/**
 * `WaeWriter` (RFC-0006 §4, §5.2 step 9): the site Worker's writer. One event is one
 * `writeDataPoint` in the fixed layout. The call is fire-and-forget: it is never awaited, adds no
 * latency, and never fails the response. There is no D1 path (invariant A7).
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import type { AnalyticsWriter } from "../model.ts";
import { toDataPoint, type WaeDataset } from "./layout.ts";

export class WaeWriter implements AnalyticsWriter {
  readonly kind = "wae" as const;
  readonly #dataset: WaeDataset;
  readonly #onError: ((message: string, error?: unknown) => void) | undefined;

  constructor(
    dataset: WaeDataset,
    options: { onError?: (message: string, error?: unknown) => void } = {},
  ) {
    this.#dataset = dataset;
    this.#onError = options.onError;
  }

  write(event: AnalyticsEvent): void {
    try {
      this.#dataset.writeDataPoint(toDataPoint(event));
    } catch (error) {
      this.#onError?.("analytics writeDataPoint failed", error);
    }
  }
}
