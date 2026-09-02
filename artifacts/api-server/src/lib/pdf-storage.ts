/**
 * pdf-storage.ts — thin façade over the pluggable storage adapter.
 *
 * The real logic lives in `./storage/`. This file preserves the original
 * function signatures so existing route code keeps working without changes.
 * See `./storage/index.ts` for adapter selection (Replit, Vercel Blob, memory).
 */

import type { Response } from "express";
import { getStorage } from "./storage/index.js";

export async function requestTakeoffUploadUrl(companyId: number, ownerScope?: string) {
  return getStorage().requestUploadUrl(companyId, ownerScope);
}

export async function downloadTakeoffObject(objectPath: string): Promise<Buffer> {
  return getStorage().downloadObject(objectPath);
}

export async function streamTakeoffObject(objectPath: string, res: Response): Promise<void> {
  return getStorage().streamObject(objectPath, res);
}

/** Head/metadata check without downloading the body. */
export async function headTakeoffObject(objectPath: string) {
  return getStorage().headObject(objectPath);
}

/** Raw download (no PDF-specific validation) — for supplier uploads etc. */
export async function downloadRawObject(objectPath: string): Promise<Buffer> {
  return getStorage().downloadRaw(objectPath);
}

/**
 * @deprecated Retained for backward compatibility.
 * Callers should use headTakeoffObject() + downloadRawObject() instead.
 */
export function takeoffObjectFile(_objectPath: string): never {
  throw new Error(
    "takeoffObjectFile() is deprecated. Use headTakeoffObject() + downloadRawObject() instead.",
  );
}
