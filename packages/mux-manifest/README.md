# @tschk/mux-manifest

JavaScript / TypeScript library (ESM) that builds the same **`MUX_MANIFEST_JSON`** string as the Rust crate [`mux-manifest`](../../crates/mux-manifest) and Ark’s control plane. Works in **Bun**, **Node.js 18+** (global `URL`), and bundlers targeting browsers.

```js
import { manifestJsonForDeploy } from "@tschk/mux-manifest";

const json = manifestJsonForDeploy("deploy-1", "svc-a", {
  MUX_DEFAULT_UPSTREAM: "https://origin.example.com",
});
```

See the [protocol README](../../README.md) and [`docs/manifest.md`](../../docs/manifest.md).

License: MPL-2.0 (same repository).
