/**
 * upload-file.ts — driver-agnostic client upload helper.
 *
 * The backend returns an `UploadInstruction` (discriminated union) that tells
 * the browser how to upload:
 *
 *   - `signed-url`: PUT the bytes directly at `uploadURL`. This is what the
 *     Replit App Storage adapter returns and what the frontend used to
 *     assume unconditionally.
 *   - `vercel-blob`: Call `@vercel/blob/client`'s `upload()` which handshakes
 *     with our server route (returned as `handleUploadRoute`) to obtain a
 *     scoped client token, then streams directly to Vercel's edge.
 *
 * Both paths report progress via the same callback so upload UI code doesn't
 * need to know which driver is in use.
 */
import { upload as vercelBlobUpload } from "@vercel/blob/client"

export type SignedUrlInstruction = {
  driver: "signed-url"
  uploadURL: string
  objectPath: string
  method: "PUT"
  headers?: Record<string, string>
}

export type VercelBlobInstruction = {
  driver: "vercel-blob"
  objectPath: string
  pathname: string
  handleUploadRoute: string
}

export type UploadInstruction = SignedUrlInstruction | VercelBlobInstruction

export type UploadProgressHandler = (fraction: number) => void

export type UploadOptions = {
  instruction: UploadInstruction
  file: File
  contentType: string
  onProgress?: UploadProgressHandler
  signal?: AbortSignal
}

export type UploadResult = {
  objectPath: string
}

/**
 * Upload a file per the server's instructions.
 *
 * Throws on network/HTTP error. Progress is reported as a fraction 0..1.
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { instruction, file, contentType, onProgress, signal } = options

  if (instruction.driver === "signed-url") {
    await uploadViaSignedUrl(instruction, file, contentType, onProgress, signal)
    return { objectPath: instruction.objectPath }
  }

  // vercel-blob
  await uploadViaVercelBlob(instruction, file, contentType, onProgress, signal)
  return { objectPath: instruction.objectPath }
}

// -----------------------------------------------------------------------------
// signed-url path (Replit / classic signed PUT)
// -----------------------------------------------------------------------------

function uploadViaSignedUrl(
  instruction: SignedUrlInstruction,
  file: File,
  contentType: string,
  onProgress: UploadProgressHandler | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const abort = () => xhr.abort()
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload aborted", "AbortError"))
        return
      }
      signal.addEventListener("abort", abort, { once: true })
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort)
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
      } else {
        reject(
          new Error(
            `Upload failed with status ${xhr.status} ${xhr.statusText || ""}`.trim(),
          ),
        )
      }
    }
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort)
      reject(new Error("Network error during upload"))
    }
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort)
      reject(new DOMException("Upload aborted", "AbortError"))
    }

    xhr.open(instruction.method, instruction.uploadURL, true)
    xhr.setRequestHeader("Content-Type", contentType)
    if (instruction.headers) {
      for (const [key, value] of Object.entries(instruction.headers)) {
        xhr.setRequestHeader(key, value)
      }
    }
    xhr.send(file)
  })
}

// -----------------------------------------------------------------------------
// vercel-blob path
// -----------------------------------------------------------------------------

async function uploadViaVercelBlob(
  instruction: VercelBlobInstruction,
  file: File,
  contentType: string,
  onProgress: UploadProgressHandler | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  await vercelBlobUpload(instruction.pathname, file, {
    access: "public",
    handleUploadUrl: instruction.handleUploadRoute,
    contentType,
    abortSignal: signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    },
  })
  onProgress?.(1)
}
