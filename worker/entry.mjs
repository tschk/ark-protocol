/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { connect } from "cloudflare:sockets";

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const pathname = u.pathname;
    const meta = metaFromEnv(env);
    const parsed = parseResolvedEnv(env);

    const adapterType = adapterTypeFromPath(pathname);
    if (adapterType !== null) {
      return handleAdapter(request, env, adapterType, meta, parsed);
    }

    const manifest = parseMuxManifest(env);

    if (isDiagnosticPath(pathname)) {
      return Response.json(
        {
          ...meta,
          path: pathname,
          env_keys: Object.keys(parsed),
          mux_manifest_active: Boolean(manifest),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (manifest) {
      const route = pickRoute(request, manifest);
      if (route) {
        return tryManifestRequest(request, route, meta);
      }
      return Response.json(
        {
          ...meta,
          error: "mux manifest is active but no route matched this request",
          path: pathname,
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    return Response.json(
      { ok: true, ...meta, env: parsed, mux_manifest_active: false },
      { headers: { "cache-control": "no-store" } },
    );
  },
};

function metaFromEnv(env) {
  return {
    protocol_id: "ark-protocol",
    protocol_version: "1",
    deployment_id: env.ARK_DEPLOYMENT_ID || "",
    service_id: env.ARK_SERVICE_ID || "",
    image_ref: env.ARK_IMAGE_REF || "",
    port: Number(env.ARK_PORT || "8080") || 8080,
  };
}

function parseResolvedEnv(env) {
  let parsed = {};
  try {
    const raw = env.ARK_RESOLVED_ENV;
    if (typeof raw === "string" && raw.length) parsed = JSON.parse(raw);
  } catch (_) {}
  return parsed;
}

function parseMuxManifest(env) {
  const raw = env.MUX_MANIFEST_JSON;
  if (typeof raw !== "string" || !raw.trim()) return null;
  let m;
  try {
    m = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  if (m.version !== "1") return null;
  if (!Array.isArray(m.routes) || m.routes.length === 0) return null;
  for (const r of m.routes) {
    if (!r || typeof r !== "object") return null;
    if (typeof r.name !== "string" || !r.match || !r.upstream) return null;
    const up = r.upstream;
    if (typeof up.host !== "string" || !up.host.length) return null;
    if (typeof up.port !== "number" || !Number.isFinite(up.port)) return null;
  }
  return m;
}

function isBlockedUpstream(host) {
  const h = String(host).toLowerCase();
  return (
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.startsWith("127.")
  );
}

function pickRoute(request, manifest) {
  const url = new URL(request.url);
  const hostHeader = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const pathname = url.pathname;
  const edgeHost = url.hostname.toLowerCase();
  for (const route of manifest.routes) {
    const m = route.match;
    if (!m || !m.type) continue;
    if (m.type === "http_host") {
      if (hostHeader === String(m.host || "").toLowerCase()) return route;
    } else if (m.type === "path_prefix") {
      if (pathname.startsWith(m.prefix)) return route;
    } else if (m.type === "tls_sni") {
      if (edgeHost === String(m.server_name || "").toLowerCase()) return route;
    }
  }
  return null;
}

function manifestPathForUpstream(request, route) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const m = route.match;
  if (m && m.type === "path_prefix" && typeof m.prefix === "string") {
    if (!pathname.startsWith(m.prefix)) return pathname + url.search;
    const rest = pathname.slice(m.prefix.length) || "/";
    return rest + url.search;
  }
  return pathname + url.search;
}

function upstreamProtocol(up) {
  return String(up.protocol || "http").toLowerCase();
}

function originBaseFromUpstream(up, proto) {
  const scheme =
    proto === "wss" || proto === "ws"
      ? proto === "wss"
        ? "wss"
        : "ws"
      : proto === "https"
        ? "https"
        : "http";
  const defaultPort = scheme === "https" || scheme === "wss" ? 443 : 80;
  const p = typeof up.port === "number" && Number.isFinite(up.port) ? up.port : defaultPort;
  const omit =
    (scheme === "http" && p === 80) ||
    (scheme === "https" && p === 443) ||
    (scheme === "ws" && p === 80) ||
    (scheme === "wss" && p === 443);
  if (omit) return `${scheme}://${up.host}/`;
  return `${scheme}://${up.host}:${p}/`;
}

async function proxyWebOrHttpToUrl(request, originBase, pathWithSearch) {
  const path = pathWithSearch.startsWith("/") ? pathWithSearch : `/${pathWithSearch}`;
  const target = new URL(path, originBase);
  const headers = new Headers(request.headers);
  headers.delete("host");
  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}

async function tryManifestRequest(request, route, meta) {
  const up = route.upstream;
  if (isBlockedUpstream(up.host)) {
    return Response.json(
      {
        ...meta,
        error: "manifest upstream must be reachable from Cloudflare (not loopback)",
        host: up.host,
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const proto = upstreamProtocol(up);
  const pathOut = manifestPathForUpstream(request, route);
  const base = originBaseFromUpstream(up, proto);
  if (proto === "tcp") {
    return tcpOverWebSocket(request, up.host, up.port, meta);
  }
  if (proto === "udp") {
    return Response.json(
      { ...meta, error: "manifest udp upstream is not supported in this worker" },
      { status: 501, headers: { "cache-control": "no-store" } },
    );
  }
  return proxyWebOrHttpToUrl(request, base, pathOut);
}

function adapterTypeFromPath(pathname) {
  let m = pathname.match(/^\/protocol\/v1\/adapter\/([^/]+)/);
  if (m) return m[1];
  m = pathname.match(/^\/__ark\/adapter\/([^/]+)/);
  if (m) return m[1];
  return null;
}

function isDiagnosticPath(pathname) {
  if (pathname.startsWith("/protocol/v1/adapter/")) return false;
  if (pathname.startsWith("/protocol/v1")) return true;
  if (pathname.startsWith("/__ark/adapter/")) return false;
  if (pathname.startsWith("/__ark/")) return true;
  return false;
}

function upstreamPathname(pathname) {
  const p1 = pathname.match(/^\/protocol\/v1\/adapter\/[^/]+(\/.*)?$/);
  if (p1) return p1[1] && p1[1].length > 0 ? p1[1] : "/";
  const p2 = pathname.match(/^\/__ark\/adapter\/[^/]+(\/.*)?$/);
  if (p2) return p2[1] && p2[1].length > 0 ? p2[1] : "/";
  return pathname;
}

async function handleAdapter(request, env, adapterType, meta, parsed) {
  const lower = adapterType.toLowerCase();
  if (lower === "websocket" || lower === "ws" || lower === "https") {
    const backend = env.ARK_WS_BACKEND_URL || env.ARK_HTTP_BACKEND_URL;
    if (!backend) {
      return json501(adapterType, meta, {
        hint: "Set ARK_WS_BACKEND_URL (wss:// or https://) or ARK_HTTP_BACKEND_URL for WebSocket/HTTP upgrade proxy.",
        env_keys: Object.keys(parsed),
      });
    }
    return proxyWebOrHttp(request, backend);
  }
  if (lower === "tcp" || lower === "udp") {
    const host = env.ARK_TCP_HOST;
    const portStr = env.ARK_TCP_PORT;
    if (!host || !portStr) {
      return json501(adapterType, meta, {
        hint: "Set ARK_TCP_HOST and ARK_TCP_PORT for outbound TCP sockets.",
        env_keys: Object.keys(parsed),
      });
    }
    const port = Number(portStr);
    if (!Number.isFinite(port)) {
      return Response.json(
        { error: "invalid ARK_TCP_PORT", ...meta },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return tcpOverWebSocket(request, host, port, meta);
  }
  return json501(adapterType, meta, {
    hint: "Supported adapter_type values include ws, websocket, https, tcp.",
    env_keys: Object.keys(parsed),
  });
}

function json501(adapterType, meta, extra) {
  return Response.json(
    { adapter: adapterType, ...meta, ...extra },
    { status: 501, headers: { "cache-control": "no-store" } },
  );
}

async function proxyWebOrHttp(request, backendBase) {
  const b = backendBase.replace(/\/$/, "");
  const u = new URL(request.url);
  const path = upstreamPathname(u.pathname);
  const target = new URL(path + u.search, b);
  const headers = new Headers(request.headers);
  headers.delete("host");
  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}

async function tcpOverWebSocket(request, host, port, meta) {
  if (request.headers.get("Upgrade") !== "websocket") {
    return Response.json(
      {
        ...meta,
        error: "TCP adapter expects WebSocket upgrade on this path",
        tcp: { host, port },
      },
      { status: 426, headers: { "cache-control": "no-store" } },
    );
  }

  let socket;
  try {
    socket = connect({ hostname: host, port });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json(
      { ...meta, error: msg },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  server.addEventListener("message", async (ev) => {
    try {
      let data;
      if (ev.data instanceof ArrayBuffer) data = new Uint8Array(ev.data);
      else if (typeof ev.data === "string") data = new TextEncoder().encode(ev.data);
      else return;
      await writer.write(data);
    } catch (_) {}
  });

  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength) server.send(value);
      }
    } catch (_) {
    } finally {
      try {
        server.close();
      } catch (_) {}
      try {
        socket.close();
      } catch (_) {}
    }
  })();

  return new Response(null, { status: 101, webSocket: client });
}
