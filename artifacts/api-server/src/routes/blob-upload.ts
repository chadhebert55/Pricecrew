/**
 * blob-upload.ts — Vercel Blob client-upload handshake endpoint.
 *
 * The frontend calls `@vercel/blob/client`'s `upload()`, which POSTs here
 * with a JSON body describing the intended upload. We validate:
 *   1. The caller is authenticated (Clerk middleware already enforced this)
 *   2. The requested pathname lives under the caller's company namespace
 *      (`objects/uploads/<companyId>/...`), preventing cross-tenant writes
 *   3. Content type + size limits match our upload contract
 *
 * On success we return a scoped client token; the browser then streams the
 * bytes directly to Vercel's edge. On completion Vercel POSTs the same
 * endpoint again with an `upload.completed` event — we log it but do not
 * persist anything here because the create-takeoff route (called by the
 * frontend right after upload finishes) is the source of truth.
 */
import { Router, type IRouter } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requestCompanyId } from "../middlewares/estimatorAuth.js";
import { MAX_UPLOAD_BYTES } from "../lib/storage/types.js";

const router: IRouter = Router();

// Content types we allow via client uploads. Keep this narrow: the app only
// uploads plan PDFs and supplier price books.
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

router.post("/blob/handle-upload", async (req, res) => {
  const body = req.body as HandleUploadBody;
  const companyId = requestCompanyId(req);
  const requiredPrefix = `objects/uploads/${companyId}/`;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(requiredPrefix)) {
          throw new Error(
            `Uploads must live under ${requiredPrefix} (got ${pathname}).`,
          );
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Vercel supports optional metadata that flows back into the
          // `onUploadCompleted` callback. We echo the companyId so audit logs
          // are useful if we ever add them.
          tokenPayload: JSON.stringify({ companyId }),
          // 15-minute upload window matches the signed-URL adapter.
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        req.log.info(
          { pathname: blob.pathname, url: blob.url, tokenPayload },
          "Vercel Blob upload completed",
        );
        // Intentionally a no-op: the frontend calls the create-takeoff /
        // create-import-review route immediately after upload, which is the
        // real source of truth for the DB row.
      },
    });
    res.json(jsonResponse);
  } catch (error) {
    req.log.error({ err: error }, "Vercel Blob handleUpload failed");
    const message = error instanceof Error ? error.message : "Upload rejected";
    res.status(400).json({ error: message });
  }
});

export default router;
