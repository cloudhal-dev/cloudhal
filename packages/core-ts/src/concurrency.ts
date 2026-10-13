/**
 * Blob reads/writes in flight at once: a Worker invocation may have at most six connections waiting
 * for response headers (https://developers.cloudflare.com/workers/platform/limits/); more queue.
 */
export const BLOB_CONCURRENCY = 6;

/** Runs `fn` over `items` with at most `limit` calls in flight; rejects on the first failure. */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
