# Overview

## Problem

A typical VPS runs **multiple** TCP listeners (for example `127.0.0.1:3000` for an API, `127.0.0.1:3478` for STUN/TURN-style UDP-over-TCP bridges, `127.0.0.1:9090` for admin). Operators still want:

- **One** public HTTPS (and often WebSocket) entry for browsers and CDNs.
- A **repeatable, versioned contract** so automation (Ark, Terraform, shell, another SaaS) can configure the same shape everywhere.

## What ark-protocol specifies

1. **Mux manifest v1** — JSON describing routes from a **public name** (or path/SNI key) to an **upstream** `host:port` and protocol hint. See [manifest.md](manifest.md) and `../spec/mux-manifest.v1.schema.json`.

2. **Ingress discipline** — you run **one** TLS-terminated listener (or one Cloudflare Tunnel outbound socket) on the VPS; local software uses the manifest to decide which upstream receives each connection.

3. **Optional Worker module** — when you terminate TLS on Cloudflare Workers instead of on the VPS, the reference `worker/entry.mjs` exposes **`/protocol/v1/…`** for diagnostics and adapter-style bridging (HTTP/WebSocket proxy, TCP-over-WebSocket using `cloudflare:sockets`). The same module reads **`MUX_MANIFEST_JSON`** at runtime and applies **`routes`** when valid. That surface is **generic HTTP**; any product may generate URLs under that prefix.

## Relationship to Ark

[Ark](https://github.com/tschk/ark) is one consumer: it can upload this Worker and set bindings. Nothing in the manifest or route layout **requires** Ark. If you do not use Ark, use the manifest with your own reverse proxy (Caddy, nginx, HAProxy) or with `cloudflared` only—see [vps.md](vps.md) and [cloudflare.md](cloudflare.md).
