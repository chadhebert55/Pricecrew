/**
 * Sentry initialization for the API server.
 *
 * Gated entirely on SENTRY_DSN so this stays a no-op until the DSN is
 * configured. Keep the import list minimal — Sentry auto-instruments
 * http, express, and pg via its default integrations.
 *
 * Call `initObservability()` as the very first thing in the entry
 * script, before Express is imported, so instrumentation can hook.
 */
import * as Sentry from "@sentry/node";

let initialized = false;

export function initObservability(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.FLY_MACHINE_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    // Drop noisy errors we don't want to alert on.
    ignoreErrors: [
      "ECONNRESET",
      "socket hang up",
      // Clerk throws these on unauth requests that hit protected routes.
      /^Unauthenticated$/,
    ],
  });

  initialized = true;
}

/**
 * Express error handler. Mount AFTER all routes but BEFORE any custom
 * error handler so it can report before you transform the error.
 */
export const sentryErrorHandler = Sentry.expressErrorHandler();

export { Sentry };
