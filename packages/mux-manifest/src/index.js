export function manifestJsonForDeploy(deploymentId, serviceId, resolvedEnv) {
  const env = resolvedEnv && typeof resolvedEnv === "object" ? resolvedEnv : {};
  const mux = env.MUX_MANIFEST_JSON;
  if (mux && typeof mux === "object" && !Array.isArray(mux)) {
    return JSON.stringify(mux);
  }
  if (typeof mux === "string" && mux.trim()) {
    try {
      const v = JSON.parse(mux);
      if (v && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
    } catch (_) {}
  }
  const raw = env.MUX_DEFAULT_UPSTREAM;
  if (typeof raw !== "string" || !raw.trim()) return "{}";
  let base;
  try {
    base = new URL(raw.trim());
  } catch (_) {
    return "{}";
  }
  const host = base.hostname;
  if (!host) return "{}";
  const defaultPort = base.protocol === "https:" || base.protocol === "wss:" ? 443 : 80;
  const port = base.port ? Number(base.port) : defaultPort;
  if (!Number.isFinite(port)) return "{}";
  let protocol = "http";
  if (base.protocol === "https:") protocol = "https";
  else if (base.protocol === "wss:") protocol = "wss";
  else if (base.protocol === "ws:") protocol = "ws";
  const body = {
    version: "1",
    id: `${serviceId}:${deploymentId}`,
    listen: { mode: "tcp", host: "0.0.0.0", port: 0 },
    routes: [
      {
        name: "mux-default-upstream",
        match: { type: "path_prefix", prefix: "/" },
        upstream: { host, port, protocol },
      },
    ],
  };
  return JSON.stringify(body);
}
