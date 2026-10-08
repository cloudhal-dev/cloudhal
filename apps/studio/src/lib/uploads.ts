/**
 * Step 2 of an upload (RFC-0004 §5.5): the bytes of one file, streamed with a `PUT` to the signed,
 * single-use URL the ticket request returned. `XMLHttpRequest`, because only it reports upload
 * progress portably. Nothing else in Studio sends file bytes (CI checks).
 */
import { ApiRequestError, type UploadResult, type UploadTicket } from "./api.ts";

export type OpenTicket = Extract<UploadTicket, { uploadId: string }>;

export function isOpenTicket(t: UploadTicket): t is OpenTicket {
  return "uploadId" in t;
}

/** Thrown when the network failed or the upload was cancelled (no server answer). */
export class UploadTransportError extends Error {
  override readonly name = "UploadTransportError";
  readonly code: "network" | "aborted";
  constructor(code: "network" | "aborted") {
    super(code);
    this.code = code;
  }
}

export function putUpload(
  ticket: OpenTicket,
  file: Blob,
  options: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    // Only the ticket's own URL: same origin, `/api/sites/…/assets/uploads/upl_…?sig=…`.
    if (!/^\/api\/sites\/[^/]+\/assets\/uploads\/upl_[A-Za-z0-9]+\?sig=/.test(ticket.url)) {
      reject(new UploadTransportError("network"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.url);
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = { error: "unknown", message: xhr.statusText };
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult);
      else reject(new ApiRequestError(xhr.status, body as { error: string; message: string }));
    };
    xhr.onerror = () => reject(new UploadTransportError("network"));
    xhr.onabort = () => reject(new UploadTransportError("aborted"));
    if (options.signal) {
      if (options.signal.aborted) {
        reject(new UploadTransportError("aborted"));
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}
