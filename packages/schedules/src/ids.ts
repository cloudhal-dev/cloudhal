/**
 * Identifiers (RFC-0008 §4, §8.5). Worker-safe: WebCrypto only.
 *
 * - Release and automation ids are random: `rel_` / `aut_` + 20 Crockford base32 characters.
 * - **Run ids are derived** (stable across versions; changing this breaks idempotency of runs that
 *   are already stored, so never change it):
 *
 *   `runId(subjectId, occurrenceAt) = "run_" + base32(first 100 bits of SHA-256(utf8(subjectId + "\n" + iso)))`
 *
 *   where `iso` is the occurrence as `Date#toISOString()` (UTC, milliseconds, `Z`, e.g.
 *   `2026-11-02T06:00:00.000Z`), and `base32` is Crockford's alphabet
 *   `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, most significant bit first, 5 bits per character, 20
 *   characters. Every tick that reaches the same occurrence computes the same id, which is the
 *   occurrence's idempotency key (`schedule_runs.id`, `UNIQUE (subject_id, occurrence_at)`).
 * - Lease tokens are random (`lease_` + 24 characters): unique per claim, so statements later in a
 *   batch can be guarded on "the row carries my token" (AGENTS.md rule 4).
 */
import { canonicalInstant } from "./instant.ts";

export const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const SCHEDULE_ID_PREFIX = {
  release: "rel",
  automation: "aut",
  run: "run",
  lease: "lease",
} as const;

function randomBase32(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CROCKFORD32[b % 32];
  return out;
}

/** A new random release id (`rel_…`). */
export function newReleaseId(): string {
  return `${SCHEDULE_ID_PREFIX.release}_${randomBase32(20)}`;
}

/** A new random automation id (`aut_…`). */
export function newAutomationId(): string {
  return `${SCHEDULE_ID_PREFIX.automation}_${randomBase32(20)}`;
}

/** A new random lease token; one per claim. */
export function newLeaseToken(): string {
  return `${SCHEDULE_ID_PREFIX.lease}_${randomBase32(24)}`;
}

/** Lower-case hex SHA-256 of UTF-8 text. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The first `chars × 5` bits of `bytes`, in Crockford base32, most significant bit first. */
export function base32Prefix(bytes: Uint8Array, chars: number): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  let i = 0;
  while (out.length < chars) {
    if (bits < 5) {
      acc = (acc << 8) | (bytes[i++] ?? 0);
      bits += 8;
    }
    bits -= 5;
    out += CROCKFORD32[(acc >> bits) & 31];
    acc &= (1 << bits) - 1;
  }
  return out;
}

/** The deterministic id of a subject's occurrence (see the module comment for the exact rule). */
export async function runId(subjectId: string, occurrenceAt: string | Date): Promise<string> {
  const text = `${subjectId}\n${canonicalInstant(occurrenceAt)}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return `${SCHEDULE_ID_PREFIX.run}_${base32Prefix(digest, 20)}`;
}

/**
 * A small deterministic 32-bit hash (FNV-1a over UTF-16 code units). Used where a stable spread is
 * enough and no digest is needed, e.g. the preset minute offset (`presetMinuteOffset`).
 */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
