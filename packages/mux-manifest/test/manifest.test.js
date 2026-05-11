import { describe, expect, test } from "bun:test";
import { manifestJsonForDeploy } from "../src/index.js";

describe("manifestJsonForDeploy", () => {
  test("empty env", () => {
    expect(manifestJsonForDeploy("d1", "s1", {})).toBe("{}");
  });

  test("MUX_DEFAULT_UPSTREAM https with non-default port", () => {
    const s = manifestJsonForDeploy("dep", "svc", {
      MUX_DEFAULT_UPSTREAM: "https://origin.example.com:8443/api",
    });
    const v = JSON.parse(s);
    expect(v.version).toBe("1");
    expect(v.routes[0].upstream.host).toBe("origin.example.com");
    expect(v.routes[0].upstream.port).toBe(8443);
    expect(v.routes[0].upstream.protocol).toBe("https");
  });

  test("MUX_MANIFEST_JSON object wins over MUX_DEFAULT_UPSTREAM", () => {
    const custom = {
      version: "1",
      id: "x",
      listen: { mode: "tcp", host: "0.0.0.0", port: 1 },
      routes: [
        {
          name: "r",
          match: { type: "path_prefix", prefix: "/z" },
          upstream: { host: "a.example", port: 80, protocol: "http" },
        },
      ],
    };
    const s = manifestJsonForDeploy("d", "s", {
      MUX_DEFAULT_UPSTREAM: "https://ignored.example",
      MUX_MANIFEST_JSON: custom,
    });
    const v = JSON.parse(s);
    expect(v.routes[0].match.prefix).toBe("/z");
  });

  test("MUX_MANIFEST_JSON string", () => {
    const inner = JSON.stringify({
      version: "1",
      id: "y",
      listen: { mode: "tcp", host: "0.0.0.0", port: 0 },
      routes: [
        {
          name: "q",
          match: { type: "http_host", host: "h" },
          upstream: { host: "b", port: 443, protocol: "https" },
        },
      ],
    });
    const s = manifestJsonForDeploy("a", "b", { MUX_MANIFEST_JSON: inner });
    expect(JSON.parse(s).id).toBe("y");
  });
});
