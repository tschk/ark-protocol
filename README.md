# ark-protocol

Public edge worker used by [Ark](https://github.com/tschk/ark): HTTPS and WebSocket at Cloudflare Workers, with optional bridges to upstream HTTP/WebSocket (`ARK_WS_BACKEND_URL` / `ARK_HTTP_BACKEND_URL`) or raw TCP (`ARK_TCP_HOST` + `ARK_TCP_PORT` via `cloudflare:sockets`).

## Layout

- `worker/entry.mjs` — module worker uploaded by Ark’s control plane as `worker.js` (see Ark `cf_common` / `cloudflare_runtime`).
- `wrangler.toml` — deploy this worker standalone for experiments; Ark normally uploads the same script via the Workers API.

## Adapter routes

| Path | Behaviour |
|------|-----------|
| `GET /__ark/*` | Metadata JSON (deployment, service, env keys). |
| `GET /__ark/adapter/ws` (or `websocket`, `https`) | Proxies the request (including WebSocket upgrade) to `ARK_WS_BACKEND_URL` or `ARK_HTTP_BACKEND_URL`. |
| `GET /__ark/adapter/tcp` | Expects a WebSocket upgrade; frames are forwarded to `ARK_TCP_HOST`:`ARK_TCP_PORT`. |

Bindings are plain-text vars on the Worker. Ark sets `ARK_DEPLOYMENT_ID`, `ARK_SERVICE_ID`, `ARK_IMAGE_REF`, `ARK_PORT`, and `ARK_RESOLVED_ENV` on each deploy. Optional bridge vars can be added later via the same Workers metadata API or Wrangler vars.

## Local Wrangler

```bash
npx wrangler@3 dev
```

Set `[vars]` in `wrangler.toml` or use `wrangler secret put` where appropriate.

## License

MIT
