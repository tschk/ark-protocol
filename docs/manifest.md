# Mux manifest v1

The file `spec/mux-manifest.v1.schema.json` is the normative schema. This page summarizes intent.

## Top-level fields

| Field | Meaning |
|-------|---------|
| `version` | Must be the string `"1"`. |
| `id` | Stable identifier for this manifest (UUID, hostname, or operator-defined string). |
| `listen` | Where the **ingress** accepts traffic on the VPS (public `host` + `port`, or `unix_socket`). |
| `routes` | Ordered list of routing rules. |
| `extensions` | Free-form object for tools that need extra keys without forking the schema. |

## `routes[]`

Each route describes how to match a client request and where to send it.

| Field | Meaning |
|-------|---------|
| `name` | Logical service name (for logs and ops). |
| `match` | Discriminated matcher (see schema `oneOf`). Examples: `http_host`, `path_prefix`, `tls_sni`. |
| `upstream` | Target `host`, `port`, and optional `protocol` hint (`http`, `https`, `tcp`, `udp`). |
| `public` | Optional external port or hostname hint for documentation or UI. |

The schema requires at least one route. Matchers are evaluated in array order; first win is implementation-defined unless you document otherwise for your multiplexer.

## Example

See `examples/manifest.v1.example.json` in this repository.

## Consumers

Any program may read this JSON: Ark, Ansible, a small Go binary, or nginx config generators. The Worker in this repo does **not** parse the manifest at runtime today; it only implements the HTTP adapter surface. A future `muxd` binary could load the manifest directly.
