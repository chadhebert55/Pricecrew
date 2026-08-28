import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function configuredPrivateDir() {
  const value = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!value) throw new Error("App Storage is not configured.");
  return value.replace(/\/+$/, "");
}

function parseStoragePath(value: string) {
  const normalized = value.startsWith("/") ? value : `/${value}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid App Storage path.");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export async function requestTakeoffUploadUrl(companyId: number) {
  const entityId = `uploads/${companyId}/${randomUUID()}`;
  const { bucketName, objectName } = parseStoragePath(
    `${configuredPrivateDir()}/${entityId}`,
  );
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Could not create upload URL (${response.status}).`);
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Storage did not return an upload URL.");
  return { uploadURL: body.signed_url, objectPath: `/objects/${entityId}` };
}

export function takeoffObjectFile(objectPath: string) {
  if (!objectPath.startsWith("/objects/")) throw new Error("Invalid App Storage object path.");
  const { bucketName, objectName } = parseStoragePath(
    `${configuredPrivateDir()}/${objectPath.slice("/objects/".length)}`,
  );
  return storage.bucket(bucketName).file(objectName);
}

export async function downloadTakeoffObject(objectPath: string) {
  const file = takeoffObjectFile(objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Uploaded plan PDF was not found in App Storage.");
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("The uploaded PDF is empty or its size could not be verified.");
  }
  if (size > 25 * 1024 * 1024) {
    throw new Error("This plan set is larger than 25 MB. Export a smaller PDF or split the plans.");
  }
  if (metadata.contentType && metadata.contentType !== "application/pdf") {
    throw new Error("The uploaded object is not marked as a PDF.");
  }
  const [buffer] = await file.download();
  return buffer;
}

export async function streamTakeoffObject(objectPath: string, res: { setHeader(name: string, value: string): void; end(body?: unknown): void }) {
  const file = takeoffObjectFile(objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Uploaded plan PDF was not found in App Storage.");
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", metadata.contentType || "application/pdf");
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  file.createReadStream().pipe(res as never);
}