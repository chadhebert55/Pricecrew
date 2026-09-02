import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  type StorageAdapter,
  StorageObjectNotFoundError,
  MAX_UPLOAD_BYTES,
  buildEntityId,
  entityIdFromObjectPath,
} from "./types.js";

/**
 * In-memory storage adapter for unit tests. NEVER use in production.
 * Bytes for each objectPath must be seeded via `putForTest()` since it doesn't
 * actually accept uploads over HTTP.
 */

const store = new Map<string, { data: Buffer; contentType: string }>();

export function putForTest(objectPath: string, data: Buffer, contentType = "application/pdf") {
  store.set(entityIdFromObjectPath(objectPath), { data, contentType });
}

export function resetMemoryStorage() {
  store.clear();
}

export function createMemoryStorageAdapter(): StorageAdapter {
  return {
    name: "memory",

    async requestUploadUrl(companyId, ownerScope) {
      const entityId = buildEntityId(companyId, ownerScope, randomUUID());
      return {
        driver: "signed-url" as const,
        uploadURL: `memory://${entityId}`,
        objectPath: `/objects/${entityId}`,
        method: "PUT" as const,
      };
    },

    async downloadObject(objectPath) {
      const entry = store.get(entityIdFromObjectPath(objectPath));
      if (!entry) throw new StorageObjectNotFoundError(objectPath);
      if (entry.data.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error("This plan set is larger than 25 MB.");
      }
      return entry.data;
    },

    async headObject(objectPath) {
      const entry = store.get(entityIdFromObjectPath(objectPath));
      if (!entry) throw new StorageObjectNotFoundError(objectPath);
      return { size: entry.data.byteLength, contentType: entry.contentType };
    },

    async downloadRaw(objectPath) {
      const entry = store.get(entityIdFromObjectPath(objectPath));
      if (!entry) throw new StorageObjectNotFoundError(objectPath);
      return entry.data;
    },

    async streamObject(objectPath, res: Response) {
      const entry = store.get(entityIdFromObjectPath(objectPath));
      if (!entry) throw new StorageObjectNotFoundError(objectPath);
      res.setHeader("Content-Type", entry.contentType);
      res.setHeader("Content-Length", String(entry.data.byteLength));
      res.end(entry.data);
    },
  };
}
