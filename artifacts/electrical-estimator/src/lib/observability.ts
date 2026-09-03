/**
 * Frontend Sentry initialization.
 *
 * Gated on VITE_SENTRY_DSN so it stays a no-op until the DSN is set at
 * build time. The frontend replaces `import.meta.env` values at build,
 * so no runtime env plumbing is needed.
 *
 * Called from main.tsx before <App /> renders.
 */
import * as Sentry from "@sentry/react";

let initialized = false;

export function initObservability(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
    ],
  });

  initialized = true;
}

export { Sentry };
