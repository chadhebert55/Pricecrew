import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

// Format validation only: this cannot verify a Clerk instance or its DNS.
export function validateDeploymentEnvironment(env) {
  const errors = [];
  const key = env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const match = /^pk_(test|live)_([A-Za-z0-9+/]+={0,2})$/.exec(key);
  const host = match ? Buffer.from(match[2], "base64").toString("utf8") : "";
  if (!match || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\$$/i.test(host)) {
    errors.push("Set VITE_CLERK_PUBLISHABLE_KEY to a valid Clerk publishable key.");
  } else if (key !== env.VITE_CLERK_PUBLISHABLE_KEY) {
    errors.push("Remove surrounding whitespace from VITE_CLERK_PUBLISHABLE_KEY.");
  }
  if (env.VITE_API_BASE_URL?.trim()) {
    errors.push("Remove VITE_API_BASE_URL: this deployment uses the same-origin /api proxy.");
  }
  if (env.VITE_CLERK_PROXY_URL?.trim()) {
    errors.push("Remove VITE_CLERK_PROXY_URL: use the configured Clerk instance directly.");
  }
  if (Object.keys(env).some((name) => name.startsWith("VITE_E2E_") && env[name])) {
    errors.push("Remove all VITE_E2E_* variables from deployment environments.");
  }
  if (env.BASE_PATH && env.BASE_PATH !== "/") {
    errors.push("BASE_PATH must be unset or / for the app-domain deployment.");
  }
  if (env.BUNDLE_CHECK_OUTPUT_DIR) {
    errors.push("Remove BUNDLE_CHECK_OUTPUT_DIR so Vercel receives the expected build output.");
  }
  return errors;
}

export function build(env = process.env) {
  const errors = validateDeploymentEnvironment(env);
  if (errors.length) {
    console.error(`Deployment preflight failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    return 1;
  }
  if (env.VITE_CLERK_PUBLISHABLE_KEY.startsWith("pk_test_")) {
    console.warn("Clerk test instance: suitable for internal verification only, not a production launch.");
  }
  // Pin both install and build to the same pnpm version. npx adds pnpm to PATH
  // for nested workspace scripts, including codegen's library typecheck.
  for (const args of [
    ["run", "codegen"],
    ["--filter", "@workspace/electrical-estimator", "run", "build"],
  ]) {
    const result = spawnSync("npx", ["--yes", "pnpm@9.15.9", ...args], {
      cwd: root,
      env: { ...env, NODE_ENV: "production" },
      stdio: "inherit",
    });
    if (result.error) {
      console.error("Could not start the deployment build tool.");
      return 1;
    }
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = build();
}
