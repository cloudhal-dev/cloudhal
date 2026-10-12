/**
 * First-party proof of work (RFC-0007 §7): signed, stateless challenges.
 *
 * - **Issue:** `v1.<payload>.<mac>` (base64url). `payload` is JSON
 *   `{s: siteId, n: nodeId or commentId, k: "comment"|"report", t: issuedAt, e: t + 600, b: bits,
 *   r: 16 random bytes}` with times in Unix seconds; `mac` is the first 16 bytes of
 *   HMAC-SHA-256(K_pow, "v1." ‖ payload) — the version prefix is signed too. Issuing writes nothing.
 * - **Solve:** the smallest decimal counter `x` with SHA-256(challenge ‖ ":" ‖ x) starting with `b`
 *   zero bits.
 * - **Verify:** parse; MAC in constant time; site, target and kind match; not expired; at least 3 s
 *   after issue; one SHA-256 of the solution. Microseconds of CPU.
 * - **Single use:** `r` is the challenge id. An isolate `ReplayCache` answers repeats cheaply and
 *   the unique indexes on `comments.challenge_id` and `comment_reports.challenge_id` make a solved
 *   challenge single use across isolates at no extra write (§7.4, invariant C12). A challenge is
 *   consumed only when something is stored, so a reader who fixes a too-short comment can resend.
 * - **Difficulty:** 18 bits; 20 once today's stored submissions pass 50 % of the daily cap, 21
 *   past 80 % (the ceiling, so a low-end phone stays under about 20 s).
 */
import {
  constantTimeEqual,
  fromBase64Url,
  type HmacKey,
  hmac,
  randomBytes,
  toBase64Url,
  utf8,
} from "./crypto.ts";

export type ChallengeKind = "comment" | "report";

export const CHALLENGE_TTL_S = 600;
export const MIN_FILL_MS = 3000;
export const DEFAULT_BITS = 18;
export const RAMP_BITS = 20;
export const MAX_BITS = 21;

export interface ChallengePayload {
  readonly s: string;
  readonly n: string;
  readonly k: ChallengeKind;
  readonly t: number;
  readonly e: number;
  readonly b: number;
  readonly r: string;
}

export interface IssuedChallenge {
  readonly challenge: string;
  readonly bits: number;
  readonly expiresAt: string;
}

/** Bits for new challenges from today's stored submissions against the daily cap (§7.2). */
export function difficultyFor(storedToday: number, dailyCap: number): number {
  if (dailyCap > 0 && storedToday * 5 > dailyCap * 4) return MAX_BITS;
  if (dailyCap > 0 && storedToday * 2 > dailyCap) return RAMP_BITS;
  return DEFAULT_BITS;
}

async function sign(key: HmacKey, signed: string): Promise<Uint8Array> {
  return (await hmac(key, utf8(signed))).slice(0, 16);
}

export async function issueChallenge(
  key: HmacKey,
  input: {
    readonly siteId: string;
    readonly target: string;
    readonly kind: ChallengeKind;
    readonly bits: number;
    readonly now: Date;
  },
): Promise<IssuedChallenge> {
  if (!Number.isInteger(input.bits) || input.bits < 0 || input.bits > 32)
    throw new Error("bits must be a whole number from 0 to 32");
  const t = Math.floor(input.now.getTime() / 1000);
  const payload: ChallengePayload = {
    s: input.siteId,
    n: input.target,
    k: input.kind,
    t,
    e: t + CHALLENGE_TTL_S,
    b: input.bits,
    r: toBase64Url(randomBytes(16)),
  };
  const signed = `v1.${toBase64Url(utf8(JSON.stringify(payload)))}`;
  const mac = await sign(key, signed);
  return {
    challenge: `${signed}.${toBase64Url(mac)}`,
    bits: input.bits,
    expiresAt: new Date(payload.e * 1000).toISOString(),
  };
}

export type ChallengeFailure =
  | "malformed"
  | "bad_mac"
  | "mismatch"
  | "expired"
  | "too_fast"
  | "wrong_solution";

export type ChallengeCheck =
  | { readonly ok: true; readonly id: string; readonly payload: ChallengePayload }
  | { readonly ok: false; readonly reason: ChallengeFailure };

function parsePayload(segment: string): ChallengePayload | undefined {
  const bytes = fromBase64Url(segment);
  if (!bytes) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return undefined;
  }
  if (v === null || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  const int = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
  if (
    typeof p.s !== "string" ||
    typeof p.n !== "string" ||
    (p.k !== "comment" && p.k !== "report") ||
    !int(p.t) ||
    !int(p.e) ||
    !int(p.b) ||
    (p.b as number) > 32 ||
    typeof p.r !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(p.r)
  )
    return undefined;
  return p as unknown as ChallengePayload;
}

/** Number of leading zero bits of a digest. */
export function leadingZeroBits(digest: Uint8Array): number {
  let n = 0;
  for (const byte of digest) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(byte) - 24;
  }
  return n;
}

export async function solutionBits(challenge: string, solution: string): Promise<number> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(`${challenge}:${solution}`)),
  );
  return leadingZeroBits(digest);
}

/**
 * Checks a challenge and its solution for one site, target and kind (§7.4). The result names why
 * it failed; callers answer `expired` with `400 challenge_expired` and every other failure with the
 * silent "pending" answer (it is a bot).
 */
export async function verifyChallenge(
  key: HmacKey,
  challenge: string,
  solution: string,
  expect: {
    readonly siteId: string;
    readonly target: string;
    readonly kind: ChallengeKind;
    readonly now: Date;
    readonly minFillMs?: number;
  },
): Promise<ChallengeCheck> {
  const parts = challenge.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^(?:0|[1-9][0-9]{0,15})$/.test(solution))
    return { ok: false, reason: "malformed" };
  const [, body = "", macPart = ""] = parts;
  const mac = fromBase64Url(macPart);
  if (mac?.length !== 16) return { ok: false, reason: "malformed" };
  const expected = await sign(key, `v1.${body}`);
  if (!constantTimeEqual(mac, expected)) return { ok: false, reason: "bad_mac" };
  const payload = parsePayload(body);
  if (!payload) return { ok: false, reason: "malformed" };
  if (payload.s !== expect.siteId || payload.n !== expect.target || payload.k !== expect.kind)
    return { ok: false, reason: "mismatch" };
  const nowMs = expect.now.getTime();
  if (payload.e * 1000 <= nowMs) return { ok: false, reason: "expired" };
  if (payload.t * 1000 > nowMs - (expect.minFillMs ?? MIN_FILL_MS))
    return { ok: false, reason: "too_fast" };
  if ((await solutionBits(challenge, solution)) < payload.b)
    return { ok: false, reason: "wrong_solution" };
  return { ok: true, id: payload.r, payload };
}

/** Finds the smallest solving counter (tests, the CLI seeder, and the browser worker's algorithm). */
export async function solveChallenge(challenge: string, maxTries = 1 << 26): Promise<string> {
  const segment = challenge.split(".")[1] ?? "";
  const payload = parsePayload(segment);
  if (!payload) throw new Error("malformed challenge");
  for (let x = 0; x < maxTries; x++) {
    if ((await solutionBits(challenge, String(x))) >= payload.b) return String(x);
  }
  throw new Error("no solution within the limit");
}

/**
 * Recently used challenge ids in this isolate (§7.4). Bounded; entries leave when their challenge
 * expires or when the oldest is evicted. The unique index is the real guarantee across isolates.
 */
export class ReplayCache {
  readonly #max: number;
  readonly #seen = new Map<string, number>();

  constructor(max = 10_000) {
    this.#max = max;
  }

  has(id: string, now: Date): boolean {
    const until = this.#seen.get(id);
    if (until === undefined) return false;
    if (until <= now.getTime()) {
      this.#seen.delete(id);
      return false;
    }
    return true;
  }

  /** Records a used challenge until it expires (Unix seconds `e`). */
  add(id: string, expiresAtS: number): void {
    this.#seen.delete(id);
    this.#seen.set(id, expiresAtS * 1000);
    while (this.#seen.size > this.#max) {
      const oldest = this.#seen.keys().next().value;
      if (oldest === undefined) break;
      this.#seen.delete(oldest);
    }
  }

  get size(): number {
    return this.#seen.size;
  }
}
