import type { Response } from "express";

/**
 * Storage adapter interface for uploaded plan PDFs and other user files.
 *
 * objectPath is the app-level identifier stored in the database, always of the
 * form `/objects/<entityId>` where entityId is a slash-separated key like
 * `uploads/<companyId>/<uuid>`. Adapters translate this into their own storage
 * layout internally.
 */
export interface ObjectMetadata {
  size: number;
  contentType?: string;
}

/**
 * Discriminated union describing how the frontend should perform the upload.
 *
 * - `signed-url`: PUT the file bytes directly at `uploadURL` with the given
 *   content type. Classic S3/GCS-style signed URL. Used by the Replit adapter.
 * - `vercel-blob`: The browser must call `@vercel/blob/client`'s `upload()`
 *   helper, which handshakes with our `handleUploadRoute` to get a client
 *   token. We only return the target `pathname` and the route to call.
 */
export type UploadInstruction =
  | {
      driver: "signed-url";
      uploadURL: string;
      objectPath: string;
      method: "PUT";
      headers?: Record<string, string>;
    }
  | {
      driver: "vercel-blob";
      objectPath: string;
      pathname: string;
      handleUploadRoute: string;
    };

export interface StorageAdapter {
  /** Human-readable name for logs. */
  readonly name: string;

  /**
   * Return upload instructions the browser can act on, plus the objectPath
   * the app should record. The exact shape depends on the adapter — see
   * `UploadInstruction`.
   */
  requestUploadUrl(
    companyId: number,
    ownerScope?: string,
  ): Promise<UploadInstruction>;

  /**
   * Download the object's bytes as a Buffer, with basic sanity checks
   * (existence, non-zero, PDF content-type, size ceiling).
   */
  downloadObject(objectPath: string): Promise<Buffer>;

  /**
   * Fetch object metadata (size + content-type) without downloading the body.
   * Used by callers that need to validate before download.
   */
  headObject(objectPath: string): Promise<ObjectMetadata>;

  /**
   * Raw download without PDF-specific validation. Used for supplier price-book
   * uploads (CSV/XLSX/PDF) and other non-takeoff files.
   */
  downloadRaw(objectPath: string): Promise<Buffer>;

  /**
   * Stream the object's bytes to the Express response, setting Content-Type
   * and Content-Length headers.
   */
  streamObject(objectPath: string, res: Response): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor(driver: string) {
    super(`Storage driver "${driver}" is not configured. Check environment variables.`);
    this.name = "StorageNotConfiguredError";
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor(objectPath: string) {
    super(`Uploaded plan PDF was not found in App Storage: ${objectPath}`);
    this.name = "StorageObjectNotFoundError";
  }
}

/** Path helpers shared across adapters. */
export function entityIdFromObjectPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error("Invalid App Storage object path.");
  }
  return objectPath.slice("/objects/".length);
}

export function buildEntityId(companyId: number, ownerScope: string | undefined, uuid: string): string {
  return `uploads/${companyId}/${ownerScope ? `${ownerScope}/` : ""}${uuid}`;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
