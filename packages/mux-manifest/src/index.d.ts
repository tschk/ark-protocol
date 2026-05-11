/**
 * Build the Worker `MUX_MANIFEST_JSON` plain-text binding from resolved environment.
 * Mirrors the Rust crate `mux-manifest::manifest_json_for_deploy` and the same keys:
 * `MUX_MANIFEST_JSON` (object or JSON string) or `MUX_DEFAULT_UPSTREAM` (full URL).
 */
export function manifestJsonForDeploy(
  deploymentId: string,
  serviceId: string,
  resolvedEnv: Record<string, unknown>,
): string;
