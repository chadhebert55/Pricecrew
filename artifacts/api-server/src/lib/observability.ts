/**
 * Sentry initialization for the API server.
 *
 * Gated entirely on SENTRY_DSN so this stays a no-op until the DSN is
 * configured. The `@sentry/node` import is dynamic so containers that
 * don't ship its transitive deps (like @opentelemetry/api) can still
 * boot without Sentry.
 *
 * Call `initObservability()` as the very first thing in the entry
 * script, before Express is imported, so auto-instrumentation hooks in.
 */
import type { ErrorRequestHandler, RequestHandler } from "express";

let initialized = false;
let cachedErrorHandler: ErrorRequestHandler | null = null;

export async function initObservability(): Promise<void> {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    // Dynamic import so builds without Sentry's runtime deps still boot.
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      release: process.env.SENTRY_RELEASE || process.env.FLY_MACHINE_VERSION,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      sendDefaultPii: false,
      ignoreErrors: [
        "ECONNRESET",
        "socket hang up",
        /^Unauthenticated$/,
      ],
    });
    cachedErrorHandler = Sentry.expressErrorHandler() as ErrorRequestHandler;
    initialized = true;
  } catch (err) {
    // Sentry failed to load — keep booting. Log once.
    // eslint-disable-next-line no-console
    console.warn("[observability] Sentry init skipped:", (err as Error)?.message ?? err);
  }
}

/**
 * Express error handler. Delegates to Sentry's handler when Sentry is
 * initialized; otherwise a no-op passthrough. Mount AFTER all routes.
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (cachedErrorHandler) return cachedErrorHandler(err, req, res, next);
  return next(err);
};

// Kept for backwards compat with any existing import; consumers should
// not rely on this at module-eval time.
export const Sentry: unknown = undefined;
// Unused typing shim to keep this file importable when Sentry types are missing.
export type _RequestHandler = RequestHandler;
