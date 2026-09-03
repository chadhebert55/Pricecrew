import type { StorageAdapter } from "./types.js";
import { createReplitStorageAdapter } from "./replit-adapter.js";
import { createVercelBlobAdapter } from "./vercel-blob-adapter.js";
import { createMemoryStorageAdapter } from "./memory-adapter.js";

export type { StorageAdapter } from "./types.js";
export {
  StorageNotConfiguredError,
  StorageObjectNotFoundError,
} from "./types.js";

/**
 * Select storage adapter via STORAGE_DRIVER env var.
 * Defaults to auto-detect: Vercel Blob if BLOB_READ_WRITE_TOKEN is set,
 * otherwise Replit.
 */
export function createStorageAdapter(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER || "").trim().toLowerCase();

  if (driver === "memory") {
    return createMemoryStorageAdapter();
  }
  if (driver === "vercel-blob") {
    return createVercelBlobAdapter();
  }
  if (driver === "replit") {
    return createReplitStorageAdapter();
  }

  // Auto-detect
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return createVercelBlobAdapter();
  }
  return createReplitStorageAdapter();
}

let cached: StorageAdapter | undefined;

/** Lazily-initialized singleton for use by route handlers. */
export function getStorage(): StorageAdapter {
  if (!cached) cached = createStorageAdapter();
  return cached;
}

/** For tests only — force a specific adapter. */
export function setStorageForTest(adapter: StorageAdapter): void {
  cached = adapter;
}
