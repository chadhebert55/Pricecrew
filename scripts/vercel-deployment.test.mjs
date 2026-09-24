import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { validateDeploymentEnvironment } from "./vercel-build.mjs";

const encodedHost = Buffer.from("clerk.example.com$").toString("base64");
const valid = { VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${encodedHost}` };
const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));

test("preflight accepts well-formed test and live keys without treating them as verified credentials", () => {
  assert.deepEqual(validateDeploymentEnvironment(valid), []);
  assert.deepEqual(validateDeploymentEnvironment({
    VITE_CLERK_PUBLISHABLE_KEY: `pk_live_${encodedHost}`,
    BASE_PATH: "/",
  }), []);
});

test("preflight rejects missing, secret, malformed, or whitespace-padded keys without echoing them", () => {
  for (const key of ["", "sk_live_do-not-print", "pk_live_invalid", ` ${valid.VITE_CLERK_PUBLISHABLE_KEY} `]) {
    const errors = validateDeploymentEnvironment({ VITE_CLERK_PUBLISHABLE_KEY: key });
    assert.equal(errors.length, 1);
    assert.ok(!errors.join("").includes("do-not-print"));
  }
});

for (const [name, value] of Object.entries({
  VITE_API_BASE_URL: "https://example.com",
  VITE_CLERK_PROXY_URL: "/api/__clerk",
  VITE_E2E_AUTH: "true",
  VITE_E2E_ONBOARDING: "false",
  BASE_PATH: "/estimator",
  BUNDLE_CHECK_OUTPUT_DIR: "/tmp/other",
})) {
  test(`preflight rejects incompatible deployment setting ${name}`, () => {
    assert.equal(validateDeploymentEnvironment({ ...valid, [name]: value }).length, 1);
  });
}

test("CLI stops before invoking the build when configuration is missing", () => {
  const result = spawnSync(process.execPath, [new URL("./vercel-build.mjs", import.meta.url).pathname], {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deployment preflight failed/);
});

test("API, health and upload callbacks retain their path on the Railway upstream", () => {
  const proxy = config.rewrites[0];
  assert.equal(proxy.source, "/api/:path*");
  const upstream = new URL(proxy.destination);
  assert.equal(upstream.protocol, "https:");
  assert.equal(upstream.hostname, "workspaceapi-server-production-2d60.up.railway.app");
  assert.equal(upstream.pathname, "/api/:path*");
  for (const route of ["healthz", "company", "blob/handle-upload"]) {
    assert.equal(new URL(proxy.destination.replace(":path*", route)).pathname, `/api/${route}`);
  }
  const spa = new RegExp(`^${config.rewrites[1].source}$`);
  for (const route of ["/api", "/api/healthz", "/api/blob/handle-upload"]) {
    assert.equal(spa.test(route), false);
  }
  for (const route of ["/", "/dashboard", "/quotes/123"]) {
    assert.equal(spa.test(route), true);
  }
});

test("private API responses opt out of rewrite and CDN caching", () => {
  const rule = config.headers.find(({ source }) => source === "/api/:path*");
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers["x-vercel-enable-rewrite-caching"], "0");
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers["CDN-Cache-Control"], "no-store");
});

test("Vercel runs the guarded build and uses the expected monorepo output", () => {
  assert.equal(config.buildCommand, "node scripts/vercel-build.mjs");
  assert.equal(config.installCommand, "npx --yes pnpm@9.15.9 install --frozen-lockfile=false");
  assert.equal(config.outputDirectory, "artifacts/electrical-estimator/dist/public");
  assert.equal(config.framework, null);
});
