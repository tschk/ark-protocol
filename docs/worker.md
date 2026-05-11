# Reference Worker: routes and bindings

The module `worker/entry.mjs` is uploaded as a single `worker.js` (ES module) with `metadata.bindings` from the Cloudflare API or Wrangler.

## Request order

1. **`/protocol/v1/adapter/…`** and **`/__ark/adapter/…`** — fixed adapter handlers (see below).
2. **`/protocol/v1/…`** (non-adapter) and **`/__ark/…`** — JSON diagnostics (`mux_manifest_active` reflects whether `MUX_MANIFEST_JSON` was parsed).
3. **Mux manifest** — if `MUX_MANIFEST_JSON` parses to `version: "1"` with a non-empty `routes` array, the first matching `routes[]` entry handles the request (HTTP/HTTPS/WS/WSS `fetch` proxy, or TCP when `upstream.protocol` is `tcp` and the client sends a WebSocket upgrade). Upstream `host` must **not** be loopback (Workers cannot reach your laptop `127.0.0.1`).
4. **`/`** and everything else — if a manifest is active but nothing matched, **404** JSON; if no manifest, the default `{ ok: true, … }` payload.

## Canonical paths (`/protocol/v1`)

| Path | Behaviour |
|------|-----------|
| `GET /protocol/v1/...` (non-adapter) | JSON diagnostics: `protocol_id`, `protocol_version`, deployment fields, `env_keys`, `mux_manifest_active`. |
| `GET|POST|… /protocol/v1/adapter/<type>` | Adapter handler (see below). |

`<type>` examples: `ws`, `websocket`, `https`, `tcp`, `udp`.

When reverse-proxying HTTP or WebSocket to `ARK_WS_BACKEND_URL` or `ARK_HTTP_BACKEND_URL`, the path sent upstream **strips** the `/protocol/v1/adapter/<type>` prefix so the origin sees `/` or your suffix path.

## Legacy paths (`/__ark`)

The same behaviour is mirrored under `/__ark/adapter/...` and `/__ark/...` for backward compatibility with older clients.

## `plain_text` bindings (reference names)

| Binding | Purpose |
|---------|---------|
| `MUX_MANIFEST_JSON` | Stringified mux manifest v1 (`version`, `id`, `listen`, `routes`). When valid, the Worker applies **manifest routing** after adapters and diagnostics paths. |
| `ARK_DEPLOYMENT_ID` | Opaque deployment id (optional for non-Ark use). |
| `ARK_SERVICE_ID` | Opaque service id. |
| `ARK_IMAGE_REF` | Container image or build label. |
| `ARK_PORT` | Primary workload port (stringified integer). |
| `ARK_RESOLVED_ENV` | JSON string injected into diagnostics. |
| `ARK_WS_BACKEND_URL` | Base URL for WebSocket/HTTP upgrade proxy (`wss://` or `https://`). |
| `ARK_HTTP_BACKEND_URL` | Alternate base URL for plain HTTP proxy. |
| `ARK_TCP_HOST` | Hostname for outbound TCP (Workers `connect`). |
| `ARK_TCP_PORT` | Port string for outbound TCP. |

Ark (and other control planes) may omit a useful manifest by binding `MUX_MANIFEST_JSON` to `"{}"`. If the resolved environment JSON embedded in `ARK_RESOLVED_ENV` includes **`MUX_MANIFEST_JSON`** (object or stringified object) or **`MUX_DEFAULT_UPSTREAM`** (a full URL such as `https://origin.example.com`), Ark’s deploy step can generate `MUX_MANIFEST_JSON` for the Worker automatically.

Implementations that are not Ark may set these to empty strings and rely only on adapter URLs, or fork the Worker with neutral names—the HTTP path layout remains stable.
