# Cloudflare integration

## Single origin, many local ports

Cloudflare does not need one Worker per internal port. Standard patterns:

### 1. Cloudflare Tunnel (`cloudflared`) — recommended baseline

- Tunnel agent on the VPS maintains **one** (or few) QUIC connections to Cloudflare.
- You publish hostnames in the Zero Trust / public routing UI; each hostname maps to `http://127.0.0.1:<port>` or a Unix socket.
- Your **mux manifest v1** can be the canonical description from which you generate `cloudflared` config or dashboard JSON.

No inbound firewall holes on the VPS are required for HTTP-style services.

### 2. DNS A/AAAA to VPS + reverse proxy

- Point `app.example.com` to the VPS IP.
- Terminate TLS on the VPS (Caddy/nginx) or use **Full (strict)** to an origin cert.
- Reverse proxy uses the same manifest-driven routing as in [vps.md](vps.md).

### 3. Cloudflare Workers (this repo’s `worker/entry.mjs`)

- TLS terminates at the Worker edge.
- The Worker can **reverse-proxy** HTTP/WebSocket to an origin URL (`ARK_HTTP_BACKEND_URL` / `ARK_WS_BACKEND_URL` style bindings in the reference script), or open **TCP sockets** to a host you control (`ARK_TCP_HOST` / `ARK_TCP_PORT`).
- Canonical HTTP paths are under **`/protocol/v1/`**; **`/__ark/`** is a **legacy alias** kept for older integrations.

Workers are optional: many teams use Tunnel + nginx only.

## TLS and WebSockets

Cloudflare handles HTTPS and WebSocket upgrades on orange-cloud hostnames. Ensure your origin or Tunnel target supports WebSocket if your manifest marks a route as `ws` or `wss`.
