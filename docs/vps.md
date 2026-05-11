# VPS: many ports → one ingress

## Goal

Processes on the VPS keep listening on **localhost** (or a private Docker network) on **different ports**. Only **one** port (or one Unix socket) faces the Internet—or connects outbound to Cloudflare—so firewalls and TLS stay simple.

## Pattern A — Reverse proxy on one public port

1. Keep app sockets bound to `127.0.0.1:<port>` per service.
2. Run a reverse proxy on `:443` (or `:8443` behind another load balancer) that terminates TLS.
3. Load the **mux manifest v1** (JSON file or generated config) and map:

   - `Host` / path / ALPN (depending on proxy) → upstream `host:port`.

Examples: **Caddy** with `handle_path`, **nginx** `upstream` + `server_name`, **HAProxy** ACLs + backends. Your automation writes the manifest once; a small script can emit native config from the same JSON.

## Pattern B — No public inbound: Cloudflare Tunnel only

1. All services stay on localhost ports as in Pattern A.
2. Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) on the VPS.
3. Define **one tunnel** with multiple **public hostnames** or path rules, each pointing at `http://127.0.0.1:<port>`.

Cloudflare sees **one persistent outbound connection** from the VPS; internally you still have many ports. The manifest remains the source of truth for “which logical name maps to which local port” even if `cloudflared` YAML is generated from it.

## Pattern C — Multiplex framing (advanced)

If you truly need **one TCP port** on the VPS and multiple opaque TCP backends, you combine a multiplexer (e.g. custom TLS with ALPN per service, or a length-prefixed framing layer) with the manifest’s `routes[].match` fields. That is deployment-specific; the schema leaves room in `extensions` for vendor fields.

## Validation

Validate manifests with any JSON Schema tool:

```bash
python -c "import json,jsonschema; s=json.load(open('spec/mux-manifest.v1.schema.json')); jsonschema.Draft202012Validator(s).validate(json.load(open('examples/manifest.v1.example.json')))"
```
