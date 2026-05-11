import { connect } from "cloudflare:sockets";

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const meta = metaFromEnv(env);
    let parsed = {};
    try {
      const raw = env.ARK_RESOLVED_ENV;
      if (typeof raw === "string" && raw.length) parsed = JSON.parse(raw);
    } catch (_) {}

    if (u.pathname.startsWith("/__ark/adapter/")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const adapterType = parts[2] || "unknown";
      return handleAdapter(request, env, adapterType, meta, parsed);
    }
    if (u.pathname.startsWith("/__ark/")) {
      return Response.json(
        { ...meta, path: u.pathname, env_keys: Object.keys(parsed) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { ok: true, ...meta, env: parsed },
      { headers: { "cache-control": "no-store" } },
    );
  },
};

function metaFromEnv(env) {
  return {
    ark: true,
    deployment_id: env.ARK_DEPLOYMENT_ID || "",
    service_id: env.ARK_SERVICE_ID || "",
    image_ref: env.ARK_IMAGE_REF || "",
    port: Number(env.ARK_PORT || "8080") || 8080,
  };
}

async function handleAdapter(request, env, adapterType, meta, parsed) {
  const lower = adapterType.toLowerCase();
  if (lower === "websocket" || lower === "ws" || lower === "https") {
    const backend = env.ARK_WS_BACKEND_URL || env.ARK_HTTP_BACKEND_URL;
    if (!backend) {
      return json501(adapterType, meta, {
        hint: "Set ARK_WS_BACKEND_URL (wss:// or https://) for WebSocket/HTTP upgrade proxy.",
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
  const target = new URL(u.pathname + u.search, b);
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
