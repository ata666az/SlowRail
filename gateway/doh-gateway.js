'use strict';

const http = require('node:http');
const dgram = require('node:dgram');

const PORT = Number(process.env.PORT || 8080);
const DNS_UDP_HOST = '127.0.0.1';
const DNS_UDP_PORT = 5300;
const MAX_DNS_PACKET = 4096;
const UDP_TIMEOUT_MS = 7000;

function sendDnsOverUdp(packet) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_) {}
      if (err) reject(err); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('DNSTT UDP backend timeout')), UDP_TIMEOUT_MS);
    socket.once('error', (err) => finish(err));
    socket.once('message', (message) => finish(null, message));
    socket.send(packet, DNS_UDP_PORT, DNS_UDP_HOST, (err) => {
      if (err) finish(err);
    });
  });
}

function decodeGetQuery(searchParams) {
  const encoded = searchParams.get('dns');
  if (!encoded) return null;
  // RFC 8484 uses unpadded base64url.
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS' && url.pathname === '/dns-query') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
      'access-control-max-age': '86400'
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('ok');
  }

  if (url.pathname !== '/dns-query' || !['GET', 'POST'].includes(req.method)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  try {
    let packet;
    if (req.method === 'GET') {
      packet = decodeGetQuery(url.searchParams);
    } else {
      const chunks = [];
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > MAX_DNS_PACKET) {
          res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
          return res.end('DNS packet too large');
        }
        chunks.push(chunk);
      }
      packet = Buffer.concat(chunks);
    }

    if (!packet || packet.length < 12 || packet.length > MAX_DNS_PACKET) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Invalid DNS message');
    }

    const answer = await sendDnsOverUdp(packet);
    res.writeHead(200, {
      'content-type': 'application/dns-message',
      'content-length': answer.length,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept'
    });
    res.end(answer);
  } catch (err) {
    console.error('[DoH] request failed:', err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('DNS tunnel backend unavailable');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[DoH] listening on 0.0.0.0:${PORT}; endpoint=/dns-query; UDP backend=${DNS_UDP_HOST}:${DNS_UDP_PORT}`);
});

module.exports = server;
                        
