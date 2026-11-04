'use strict';

const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');

function required(name) {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

function validateZone(zone) {
  const normalized = zone.toLowerCase().replace(/\.$/, '');
  if (normalized.length > 180 || !normalized.includes('.') || !/^[a-z0-9.-]+$/.test(normalized) || normalized.split('.').some((p) => !p || p.length > 63 || p.startsWith('-') || p.endsWith('-'))) {
    throw new Error('DNS_ZONE must be a valid domain/zone, for example t.example.com');
  }
  return normalized;
}

function startChild(command, args, label) {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    console.error(`[${label}] exited: code=${code}, signal=${signal}`);
    if (!shuttingDown) process.exit(code || 1);
  });
  child.on('error', (err) => {
    console.error(`[${label}] failed to start:`, err.message);
    process.exit(1);
  });
  return child;
}

let shuttingDown = false;
const children = [];

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[start] received ${signal}; stopping services`);
  for (const child of children) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

(async () => {
  const zone = validateZone(required('DNS_ZONE'));
  const privateKey = required('PRIVATE_KEY').replace(/^0x/i, '');
  const password = required('SSH_PASSWORD');
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('PRIVATE_KEY must contain exactly 64 hexadecimal characters (32 bytes), without spaces');
  }
  if (password.length < 8) throw new Error('SSH_PASSWORD must contain at least 8 characters');

  // Fixed SSH account name keeps client configuration simple.
  try { execFileSync('id', ['-u', 'slowdns'], { stdio: 'ignore' }); }
  catch (_) { execFileSync('useradd', ['-m', '-s', '/bin/bash', 'slowdns']); }
  execFileSync('chpasswd', [], { input: `slowdns:${password}\n` });
  execFileSync('mkdir', ['-p', '/run/sshd']);
  execFileSync('ssh-keygen', ['-A']);

  const publicKey = execFileSync('dnstt-pubkey', [], {
    encoding: 'utf8',
    env: { ...process.env, PRIVATE_KEY: privateKey }
  }).trim();

  console.log('[Nautica Railway SlowDNS] starting');
  console.log(`[DNSTT] zone=${zone}; UDP listener=127.0.0.1:5300; SSH target=127.0.0.1:22`);
  console.log(`[DNSTT] PUBLIC_KEY=${publicKey}`);
  console.log('[SSH] username=slowdns; password is configured from SSH_PASSWORD (value hidden)');

  children.push(startChild('sshd', ['-D', '-e', '-f', '/etc/ssh/sshd_config'], 'sshd'));
  children.push(startChild('dnstt-server', [
    '-udp', '127.0.0.1:5300',
    '-privkey', privateKey,
    zone,
    '127.0.0.1:22'
  ], 'dnstt-server'));

  // The HTTP gateway remains the foreground web listener for Railway.
  require('./gateway/doh-gateway.js');
})().catch((err) => {
  console.error('[startup] fatal:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
