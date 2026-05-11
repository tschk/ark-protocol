# Reference Worker: routes and bindings

The module `worker/entry.mjs` is uploaded as a single `worker.js` (ES module) with `metadata.bindings` from the Cloudflare API or Wrangler.

## Canonical paths (`/protocol/v1`)

| Path | Behaviour |
|------|-----------|
| `GET /protocol/v1/...` (non-adapter) | JSON diagnostics: `protocol_id`, `protocol_version`, deployment fields, `env_keys`. |
| `GET|POST|… /protocol/v1/adapter/<type>` | Adapter handler (see below). |

`<type>` examples: `ws`, `websocket`, `https`, `tcp`, `udp`.

When reverse-proxying HTTP or WebSocket to `ARK_WS_BACKEND_URL` or `ARK_HTTP_BACKEND_URL`, the path sent upstream **strips** the `/protocol/v1/adapter/<type>` prefix so the origin sees `/` or your suffix path.

## Legacy paths (`/__ark`)

The same behaviour is mirrored under `/__ark/adapter/...` and `/__ark/...` for backward compatibility with older clients.

## `plain_text` bindings (reference names)

| Binding | Purpose |
|---------|---------|
| `ARK_DEPLOYMENT_ID` | Opaque deployment id (optional for non-Ark use). |
| `ARK_SERVICE_ID` | Opaque service id. |
| `ARK_IMAGE_REF` | Container image or build label. |
| `ARK_PORT` | Primary workload port (stringified integer). |
| `ARK_RESOLVED_ENV` | JSON string injected into diagnostics. |
| `ARK_WS_BACKEND_URL` | Base URL for WebSocket/HTTP upgrade proxy (`wss://` or `https://`). |
| `ARK_HTTP_BACKEND_URL` | Alternate base URL for plain HTTP proxy. |
| `ARK_TCP_HOST` | Hostname for outbound TCP (Workers `connect`). |
| `ARK_TCP_PORT` | Port string for outbound TCP. |

Implementations that are not Ark may set these to empty strings and rely only on adapter URLs, or fork the Worker with neutral names—the HTTP path layout remains stable.
