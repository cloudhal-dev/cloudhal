/**
 * `releaseWhen` (§9.1): a release's time from what a person or agent sent. It resolves wall-clock
 * times in a zone, so it lives apart from `release.ts`, which stays free of Temporal (the
 * `./engine` entry).
 */
import type { ReleaseWhen } from "@cloudhal/core-contracts";
import { ScheduleError } from "./errors.ts";
import { MAX_HORIZON_DAYS, MIN_LEAD_MS } from "./release.ts";
import {
  assertTimeZone,
  canonicalInstant,
  DAY_MS,
  instantMs,
  resolveLocalTime,
  UTC,
} from "./time.ts";

export type WhenInput =
  | { at: string | Date | number; timeZone?: string }
  | { localTime: string; timeZone?: string }
  | "on-approval";

/**
 * Builds a `ReleaseWhen` (§9.1): a wall-clock time is kept with its zone (the site's, D1: UTC when
 * absent) and resolved to `at`; an instant is a machine's absolute intent, kept with the zone for
 * display. Checks the lead time (≥ 1 minute) and horizon (≤ 366 days, or `horizonDays`).
 */
export function releaseWhen(
  input: WhenInput,
  options: { siteTimeZone?: string; now: string | Date | number; horizonDays?: number },
): ReleaseWhen {
  if (input === "on-approval") return { kind: "on-approval" };
  const timeZone = input.timeZone ?? options.siteTimeZone ?? UTC;
  assertTimeZone(timeZone);
  const when: ReleaseWhen =
    "localTime" in input
      ? {
          kind: "at",
          at: resolveLocalTime(input.localTime, timeZone).at,
          timeZone,
          localTime: input.localTime,
        }
      : { kind: "at", at: canonicalInstant(input.at), timeZone };
  const at = instantMs(when.at);
  const now = instantMs(options.now);
  if (at < now + MIN_LEAD_MS)
    throw new ScheduleError(
      "too_soon",
      "a release time must be at least a minute ahead (use Publish now or on-approval)",
    );
  const horizon = options.horizonDays ?? MAX_HORIZON_DAYS;
  if (at > now + horizon * DAY_MS)
    throw new ScheduleError("too_far", `a release time must be within ${horizon} days`);
  return when;
}
