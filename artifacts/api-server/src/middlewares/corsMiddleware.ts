/**
 * CORS middleware for split-origin deploys (frontend on Vercel, API on a
 * container host).
 *
 * Only activates when ALLOWED_ORIGINS is set — comma-separated exact origins.
 * Wildcards are not supported: Clerk session cookies require credentialed
 * requests, and browsers refuse `Access-Control-Allow-Origin: *` with
 * credentials.
 *
 *   ALLOWED_ORIGINS=https://app.pricecrew.com,https://staging.pricecrew.com
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOWED_HEADERS =
  "content-type,authorization,x-test-clerk-user-id,x-vercel-blob-token";

export function corsMiddleware(): RequestHandler {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) {
    return (_req, _res, next) => next();
  }

  const allowlist = new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin && allowlist.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (req.method === "OPTIONS" && origin && allowlist.has(origin)) {
      res.status(204).end();
      return;
    }

    next();
  };
}
