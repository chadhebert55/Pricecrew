import { randomUUID } from "node:crypto";
import { head, del, put } from "@vercel/blob";
import type { Response } from "express";
import {
  type StorageAdapter,
  StorageNotConfiguredError,
  StorageObjectNotFoundError,
  MAX_UPLOAD_BYTES,
  buildEntityId,
  entityIdFromObjectPath,
} from "./types.js";

/**
 * Vercel Blob storage adapter.
 *
 * Object layout: `objects/<entityId>` (no leading slash inside blob store).
 * We keep the app-level path format `/objects/<entityId>` for DB compatibility
 * with existing Replit-era rows.
 *
 * Requires env var BLOB_READ_WRITE_TOKEN (auto-set by Vercel when a Blob store
 * is linked to the project).
 */

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new StorageNotConfiguredError("vercel-blob");
  return token;
}

function blobKey(objectPath: string): string {
  return `objects/${entityIdFromObjectPath(objectPath)}`;
}

export function createVercelBlobAdapter(): StorageAdapter {
  return {
    name: "vercel-blob",

    async requestUploadUrl(companyId, ownerScope) {
      // Sanity-check the token exists so we fail fast with a clean error.
      requireToken();
      const entityId = buildEntityId(companyId, ownerScope, randomUUID());
      const pathname = `objects/${entityId}`;

      // For Vercel Blob we don't return a raw upload URL. The browser calls
      // `@vercel/blob/client`'s `upload()` helper, which handshakes with our
      // `/api/blob/handle-upload` route to obtain a scoped client token and
      // then uploads directly to Vercel's edge. See routes/blob-upload.ts.
      return {
        driver: "vercel-blob" as const,
        objectPath: `/objects/${entityId}`,
        pathname,
        handleUploadRoute: "/api/blob/handle-upload",
      };
    },

    async downloadObject(objectPath) {
      const token = requireToken();
      const key = blobKey(objectPath);

      const metadata = await head(key, { token }).catch((err: unknown) => {
        if (isNotFoundError(err)) return null;
        throw err;
      });
      if (!metadata) throw new StorageObjectNotFoundError(objectPath);

      const size = Number(metadata.size);
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error("The uploaded PDF is empty or its size could not be verified.");
      }
      if (size > MAX_UPLOAD_BYTES) {
        throw new Error("This plan set is larger than 25 MB. Export a smaller PDF or split the plans.");
      }
      if (metadata.contentType && metadata.contentType !== "application/pdf") {
        throw new Error("The uploaded object is not marked as a PDF.");
      }

      const response = await fetch(metadata.url);
      if (!response.ok) {
        throw new Error(`Failed to download PDF from Vercel Blob (${response.status}).`);
      }
      return Buffer.from(await response.arrayBuffer());
    },

    async headObject(objectPath) {
      const token = requireToken();
      const key = blobKey(objectPath);
      const metadata = await head(key, { token }).catch((err: unknown) => {
        if (isNotFoundError(err)) return null;
        throw err;
      });
      if (!metadata) throw new StorageObjectNotFoundError(objectPath);
      return {
        size: Number(metadata.size) || 0,
        contentType: metadata.contentType?.split(";", 1)[0]?.trim() || undefined,
      };
    },

    async downloadRaw(objectPath) {
      const token = requireToken();
      const key = blobKey(objectPath);
      const metadata = await head(key, { token }).catch((err: unknown) => {
        if (isNotFoundError(err)) return null;
        throw err;
      });
      if (!metadata) throw new StorageObjectNotFoundError(objectPath);
      const response = await fetch(metadata.url);
      if (!response.ok) {
        throw new Error(`Failed to download from Vercel Blob (${response.status}).`);
      }
      return Buffer.from(await response.arrayBuffer());
    },

    async streamObject(objectPath, res: Response) {
      const token = requireToken();
      const key = blobKey(objectPath);

      const metadata = await head(key, { token }).catch((err: unknown) => {
        if (isNotFoundError(err)) return null;
        throw err;
      });
      if (!metadata) throw new StorageObjectNotFoundError(objectPath);

      res.setHeader("Content-Type", metadata.contentType || "application/pdf");
      if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

      const response = await fetch(metadata.url);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to stream PDF from Vercel Blob (${response.status}).`);
      }

      // Convert Web ReadableStream to Node stream and pipe to response
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(value)) {
              await new Promise<void>((resolve) => res.once("drain", () => resolve()));
            }
          }
          res.end();
        } catch (err) {
          res.destroy(err as Error);
        }
      };
      await pump();
    },
  };
}

/** Server-side upload helper (used by tests / migration scripts). */
export async function serverUpload(objectPath: string, body: Buffer | Blob | ArrayBuffer, contentType = "application/pdf") {
  const token = requireToken();
  const key = blobKey(objectPath);
  return put(key, body, { access: "public", token, contentType, addRandomSuffix: false });
}

/** Deletion helper (kept for future admin/cleanup jobs). */
export async function serverDelete(objectPath: string) {
  const token = requireToken();
  const key = blobKey(objectPath);
  await del(key, { token });
}

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  const status = "status" in err ? (err as { status: unknown }).status : undefined;
  return status === 404 || /not.?found/i.test(message);
}
