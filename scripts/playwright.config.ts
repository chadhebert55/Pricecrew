import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";

const apiUrl = "http://127.0.0.1:5080";
const webUrl = "http://127.0.0.1:5174";
const chromiumExecutable = (() => {
  try {
    return execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.browser.test.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: webUrl,
    launchOptions: chromiumExecutable
      ? { executablePath: chromiumExecutable }
      : undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @workspace/api-server run build && NODE_ENV=test PORT=5080 pnpm --filter @workspace/api-server run start",
      cwd: "..",
      url: `${apiUrl}/api/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        `NODE_ENV=test PORT=5174 BASE_PATH=/ E2E_API_URL=${apiUrl} VITE_E2E_AUTH=true pnpm --filter @workspace/electrical-estimator exec vite --config vite.config.ts --host 127.0.0.1 --mode e2e`,
      cwd: "..",
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});