# SSH SlowDNS Railway (DNSTT over direct DoH)

A Railway-oriented packaging layer around the upstream `Mygod/dnstt` server. It runs three components in one container:

1. `dnstt-server` listens only on `127.0.0.1:5300/UDP`.
2. A small HTTP DoH gateway exposes `/dns-query` on Railway's injected `PORT` and forwards DNS wire-format messages to the local DNSTT UDP listener.
3. OpenSSH listens only on `127.0.0.1:22`; DNSTT forwards tunnel streams to it.

This is **not** a public UDP/53 server and does not require Railway to expose UDP publicly. The DoH URL configured in a compatible DNSTT client must point directly to this app's `/dns-query` endpoint, not to Google/Cloudflare public recursive DNS. The gateway forwards raw DNS messages directly to DNSTT.

## Deploy

1. Put the contents of this folder in a GitHub repository.
2. In Railway, create a project from that repository. Railway builds using `Dockerfile`.
3. Add these Railway variables:

   - `DNS_ZONE`: your tunnel zone, e.g. `t.example.com`
   - `PRIVATE_KEY`: DNSTT X25519 private key as 64 hex characters (32 bytes)
   - `SSH_PASSWORD`: password for SSH user `slowdns` (minimum 8 characters)

4. Generate a Railway public domain for the service. The DoH endpoint is:

   `https://YOUR-APP.up.railway.app/dns-query`

Railway supplies `PORT`; do not hard-code it.

## Client usage

Build/use a compatible DNSTT client. The upstream command-line form is:

```sh
dnstt-client -doh https://YOUR-APP.up.railway.app/dns-query -pubkey YOUR_PUBLIC_KEY t.example.com 127.0.0.1:7000
```

Then connect SSH through the local port opened by the DNSTT client:

```sh
ssh -p 7000 slowdns@127.0.0.1
```

Username is `slowdns`; password is the `SSH_PASSWORD` value. The app prints `PUBLIC_KEY=...` in Railway logs at startup. Copy that public key into the client; do not share the private key.

## Key format

The `PRIVATE_KEY` must be a DNSTT/X25519 key, not an OpenSSH login key. If you do not have one, generate a DNSTT keypair with the upstream `dnstt-server -gen-key` command and put the private key in Railway. Keep the matching public key for the client. The service also prints the public key derived from the configured private key at startup.

## Health check

`GET /health` returns `200 ok`. DoH requests use `POST /dns-query` with `Content-Type: application/dns-message`; RFC 8484 GET requests with the `dns=` base64url parameter are also accepted.

## Important limitations / validation

- This package adapts DNSTT's transport path for Railway HTTP ingress. It is not a replacement for a normal DNS authoritative server.
- It has not been end-to-end tested against your exact Android client or a live Railway deployment from this environment. First deploy should be treated as an integration test; check Railway logs for `PUBLIC_KEY`, `dnstt-server` startup, and the `/health` endpoint.
- The public Railway domain provides HTTPS. Custom domains can also be used once Railway provisions TLS.
- Keep `SSH_PASSWORD` and `PRIVATE_KEY` only in Railway Variables; never commit them to Git.
