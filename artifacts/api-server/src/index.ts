// Init Sentry BEFORE importing app so http/express auto-instrumentation hooks in.
// initObservability is async because it dynamically imports @sentry/node when
// DSN is set; we fire-and-forget so app boot doesn't block on the network.
import { initObservability } from "./lib/observability";
void initObservability();

import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
