/**
 * `cloudhal import`'s media writes (RFC-0039 §2, pass 2): one media file of the archive into the
 * project's blob store, streamed when the store can, verified by the store against its SHA-256
 * (`FsBlobStore` refuses a stream of another size or content before the file is in place).
 */
import { type BundleMedia, mediaBlobKey } from "@cloudhal/core-ts";
import type { BlobStore } from "@cloudhal/storage";
import type { ArchiveMediaItem } from "./archive-reassemble.ts";

/** A media body as the stream `putStream` takes. */
function webStream(body: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** Writes one media file unless the store has it at its size; the store verifies its SHA-256. */
export async function writeMedia(
  blobs: BlobStore,
  siteId: string,
  item: ArchiveMediaItem,
  m: BundleMedia,
): Promise<boolean> {
  const key = mediaBlobKey(siteId, m.sha256);
  if ((await blobs.head(key))?.size === m.bytes) return false;
  const meta = { sha256: m.sha256, contentType: m.mediaType };
  if (blobs.putStream) {
    await blobs.putStream(key, webStream(item.body), { ...meta, size: m.bytes });
    return true;
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of item.body) chunks.push(chunk);
  await blobs.put(key, Buffer.concat(chunks), meta);
  return true;
}
