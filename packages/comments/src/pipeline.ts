/**
 * The submission pipeline (RFC-0007 §6.2–§6.6), pure: it takes the request and injected
 * dependencies (settings, the published-entry resolver, the store's reads and its one write,
 * isolate limits, the replay cache, keys and a clock) and returns an outcome. The site Worker
 * (rollout step 4) wires the dependencies and turns the outcome into a response with
 * `submissionResponse`.
 *
 * `POST /__cloudhal/comments`, in order — **nothing is written before step 12** (invariant C2):
 *
 *  1. method `POST`, comments available, the site's settings `enabled` (a read error is "off");
 *  2. same origin (`Sec-Fetch-Site`, else `Origin`/`Referer` host = `Host` ∈ the site's hosts);
 *  3. `Content-Type` form or JSON, at most 32 KiB, strict UTF-8;
 *  4. the `CommentSubmission` contract (`assertValid`, precompiled; the endpoint sets `kind`);
 *  5. a published entry with an open thread; a reply only to an approved comment of that entry;
 *     the page to return to is the entry's current path, computed here;
 *  6. honeypot → the "pending" answer, nothing stored;
 *  7. proof: Turnstile, else proof of work (expired → `400 challenge_expired`; anything else wrong
 *     → "pending", nothing stored), else a JavaScript-less form post when the site allows it;
 *  8. rate limits: isolate per client and per site, the optional binding, then stored-per-client
 *     counts (indexed reads);
 *  9. content rules on the normalised name, email and text; a duplicate on the entry within 24 h →
 *     "pending", nothing stored;
 * 10. the daily cap (and the JavaScript-less cap, and pending per entry) → `503 paused`;
 * 11. bans → "pending", nothing stored;
 * 12. one `batch()`: the commenter email row (when given) and the comment, `pending` (or `spam` on
 *     a blocked word), with the rule labels. A replayed challenge fails the unique index and is
 *     answered like a duplicate.
 *
 * The one exception to "nothing before step 12": none. This month's IP salt, when it does not
 * exist yet, is inserted inside step 12's batch (the comment insert is guarded on it).
 */
import type { CommentLabel, CommentModeration } from "@cloudhal/core-contracts";
import { validationErrors } from "@cloudhal/core-contracts";
import { type CommentKeys, sha256Hex } from "./crypto.ts";
import {
  emailHmac,
  ID_PREFIX,
  ipHmac,
  isClientAddress,
  newCommentsId,
  randomSalt,
  sealEmail,
  UNKNOWN_CLIENT,
} from "./hashes.ts";
import { type CommentLimiter, type DailyCount, STORED_LIMITS } from "./limits.ts";
import {
  addMs,
  DAY_MS,
  HOUR_MS,
  type PreparedEmail,
  type PreparedReport,
  type PreparedSubmission,
  REPORT_DETAILS_MAX,
  type SubmitResult,
  type ThreadRow,
  utcDayStart,
  utcMonth,
} from "./model.ts";
import {
  checkEmail,
  checkName,
  checkText,
  cutCodePoints,
  type FieldProblem,
  normalizeEmail,
  normalizeName,
  normalizeText,
} from "./normalize.ts";
import {
  type ChallengeKind,
  difficultyFor,
  type IssuedChallenge,
  issueChallenge,
  type ReplayCache,
  verifyChallenge,
} from "./pow.ts";
import { type CompiledWordList, compileWordList, evaluateContent, ruleLabels } from "./rules.ts";
import { type CommentSettings, withoutScriptAllowed } from "./settings.ts";
import { threadState } from "./thread.ts";

export const MAX_BODY_BYTES = 32 * 1024;

/** A published entry as the renderer's resolver sees it (§6.2 step 5). */
export interface PublishedEntry {
  readonly nodeId: string;
  readonly collection: string;
  /** The entry's current public path (`/posts/ferries`): where the form returns to. */
  readonly path: string;
  /** First publication; the 90-day close counts from here. */
  readonly publishedAt: string | null;
}

export interface TurnstileResult {
  readonly success: boolean;
  readonly hostname?: string;
  readonly action?: string;
}

/** Calls `siteverify` with the site's secret; throws on an outage (the pipeline fails closed). */
export type TurnstileVerify = (input: {
  readonly token: string;
  readonly remoteip: string;
  readonly idempotencyKey: string;
}) => Promise<TurnstileResult>;

/** The store reads and writes the pipeline needs (implemented by `SqlCommentStore`). */
export interface SubmissionStore {
  thread(siteId: string, nodeId: string): Promise<ThreadRow | null>;
  /** An approved comment of the site, or `null`. */
  approvedComment(
    siteId: string,
    commentId: string,
  ): Promise<{
    readonly id: string;
    readonly nodeId: string;
    readonly parentId: string | null;
  } | null>;
  /** This month's salt, read only (`undefined` when no comment created it yet). */
  readSalt(month: string): Promise<string | undefined>;
  clientActivity(
    siteId: string,
    ipHmac: string,
    since: { readonly hour: string; readonly day: string; readonly noScript: string },
  ): Promise<{ readonly hour: number; readonly day: number; readonly noScript: number }>;
  isDuplicate(siteId: string, nodeId: string, text: string, since: string): Promise<boolean>;
  storedSince(
    siteId: string,
    since: string,
  ): Promise<{ readonly total: number; readonly withoutScript: number }>;
  pendingOnEntry(siteId: string, nodeId: string): Promise<number>;
  isBanned(
    siteId: string,
    subjects: { readonly emailHmac?: string; readonly ipHmac?: string },
    now: string,
  ): Promise<boolean>;
  submit(siteId: string, input: PreparedSubmission): Promise<SubmitResult>;
  reportActivity(
    siteId: string,
    ipHmac: string | null,
    since: { readonly hour: string; readonly day: string },
  ): Promise<{ readonly clientHour: number; readonly siteDay: number }>;
  report(siteId: string, input: PreparedReport): Promise<SubmitResult>;
}

export interface PipelineDeps {
  /** The site Worker's own `CLOUDHAL_SITE_ID` — never taken from input (C14). */
  readonly siteId: string;
  /** `comments.available` for the deployment (`cloudhal.json`). */
  readonly available: boolean;
  /** Hosts the site answers on (lower case, with port when not default). */
  readonly hosts: readonly string[];
  /** The address the runtime vouches for (`CF-Connecting-IP`, the socket address). */
  readonly clientAddress: string;
  readonly keys: CommentKeys;
  readonly now: () => Date;
  /** The site's settings (memoised 60 s); `null` = no row (off). A throw counts as off. */
  readonly settings: () => Promise<CommentSettings | null>;
  readonly resolveEntry: (nodeId: string) => Promise<PublishedEntry | null>;
  readonly store: SubmissionStore;
  readonly limiter: CommentLimiter;
  readonly daily: DailyCount;
  readonly replay: ReplayCache;
  /** The optional Rate Limiting binding (`comments.rateLimit`): true when allowed. */
  readonly rateLimit?: (clientKey: string) => Promise<boolean>;
  /** Required when the site uses Turnstile; absent → `503 try_again` (fail closed). */
  readonly turnstile?: TurnstileVerify;
}

export type SubmissionError =
  | "method_not_allowed"
  | "not_found"
  | "forbidden"
  | "unsupported_media_type"
  | "too_large"
  | "invalid"
  | "challenge_expired"
  | "script_required"
  | "closed"
  | "rate_limited"
  | "proof_failed"
  | "try_again"
  | "paused";

/** Why a "pending" answer stored nothing (never shown to the client). */
export type DropReason = "honeypot" | "bad_proof" | "too_fast" | "replay" | "duplicate" | "banned";

export type SubmissionOutcome =
  | {
      readonly kind: "pending";
      readonly stored: boolean;
      readonly id?: string;
      readonly status?: "pending" | "spam";
      readonly dropped?: DropReason;
      readonly returnTo?: string;
      /** The request was a form post (no JavaScript): answer with a redirect. */
      readonly form: boolean;
    }
  | {
      readonly kind: "error";
      readonly status: number;
      readonly error: SubmissionError;
      readonly fields?: readonly string[];
      readonly retryAfter?: number;
      readonly returnTo?: string;
      readonly form: boolean;
    };

/** A rule-matched blocked word: the statement of reasons for a `spam` comment (DSA Art. 17). */
export const RULES_ACTOR = {
  kind: "system",
  id: "sys_commentrules",
  name: "Comment rules",
} as const;

const wordCache = new WeakMap<
  CommentSettings,
  { watch: CompiledWordList; blocked: CompiledWordList }
>();
function compiledLists(s: CommentSettings) {
  let c = wordCache.get(s);
  if (!c) {
    c = { watch: compileWordList(s.watchWords), blocked: compileWordList(s.blockedWords) };
    wordCache.set(s, c);
  }
  return c;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: paths never hold control characters
const CONTROL = /[\u0000-\u001F\u007F]/;

/** A safe local path to return to: one leading slash, no scheme, no `//`, no backslash. */
export function safeReturnPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path) || CONTROL.test(path))
    return "/";
  return path;
}

// ───────────────────────────── steps 1–4 ─────────────────────────────

/** Step 2: same origin (RFC-0006's rule). */
export function isSameOrigin(request: Request, hosts: readonly string[]): boolean {
  const h = request.headers;
  const host = (h.get("host") ?? new URL(request.url).host).toLowerCase();
  if (!hosts.map((x) => x.toLowerCase()).includes(host)) return false;
  const site = h.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const source = h.get("origin") ?? h.get("referer");
  if (!source || source === "null") return false;
  try {
    return new URL(source).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

type BodyRead =
  | { readonly ok: true; readonly fields: Record<string, unknown>; readonly form: boolean }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: SubmissionError;
      readonly form: boolean;
    };

/** Step 3: type, size and strict UTF-8, then the raw object (form or JSON). */
export async function readSubmissionBody(
  request: Request,
  max = MAX_BODY_BYTES,
): Promise<BodyRead> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  const form = type === "application/x-www-form-urlencoded";
  if (!form && type !== "application/json")
    return { ok: false, status: 415, error: "unsupported_media_type", form: false };
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max))
    return { ok: false, status: 413, error: "too_large", form };
  let bytes: Uint8Array;
  if (!request.body) bytes = new Uint8Array(0);
  else {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "too_large", form };
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { ok: false, status: 400, error: "invalid", form };
  }
  if (form) {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(text)) {
      if (Object.hasOwn(fields, k)) return { ok: false, status: 400, error: "invalid", form };
      fields[k] = v;
    }
    return { ok: true, fields, form };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "invalid", form };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return { ok: false, status: 400, error: "invalid", form };
  return { ok: true, fields: { ...(parsed as Record<string, unknown>) }, form };
}

const OPTIONAL_STRINGS = [
  "parentId",
  "email",
  "challenge",
  "solution",
  "turnstileToken",
  "website",
  "details",
];

/**
 * Step 4: builds the submission (the endpoint sets `kind`, the server `schemaVersion`; empty
 * optional strings from forms are dropped) and checks it with the precompiled validator.
 */
export function buildSubmission(
  fields: Record<string, unknown>,
  kind: ChallengeKind,
): { ok: true; value: Record<string, unknown> } | { ok: false; fields: string[] } {
  const value: Record<string, unknown> = { ...fields, kind, schemaVersion: 1 };
  for (const k of OPTIONAL_STRINGS) if (value[k] === "") delete value[k];
  const errors = validationErrors("comment-submission", value);
  if (errors.length === 0) return { ok: true, value };
  // errors of the other `oneOf` branch say nothing about this endpoint's fields
  const other = `#/oneOf/${kind === "comment" ? 1 : 0}/`;
  const out = new Set<string>();
  for (const e of errors) {
    if (e.schemaPath.startsWith(other) || e.keyword === "oneOf") continue;
    const top = e.instancePath.split("/")[1];
    if (top && top !== "kind" && top !== "schemaVersion") out.add(top);
    const params = e.params as { additionalProperty?: unknown; missingProperty?: unknown };
    if (e.keyword === "additionalProperties" && typeof params.additionalProperty === "string")
      out.add(params.additionalProperty.slice(0, 40));
    if (e.keyword === "required" && typeof params.missingProperty === "string")
      out.add(params.missingProperty);
  }
  if (out.size === 0) out.add(kind === "comment" ? "body" : "reason");
  return { ok: false, fields: [...out].sort() };
}

// ───────────────────────────── shared steps ─────────────────────────────

const err = (
  status: number,
  error: SubmissionError,
  form: boolean,
  extra: { fields?: readonly string[]; retryAfter?: number; returnTo?: string } = {},
): SubmissionOutcome => ({ kind: "error", status, error, form, ...extra });

const drop = (dropped: DropReason, form: boolean, returnTo?: string): SubmissionOutcome =>
  returnTo === undefined
    ? { kind: "pending", stored: false, dropped, form }
    : { kind: "pending", stored: false, dropped, form, returnTo };

async function loadSettings(deps: PipelineDeps): Promise<CommentSettings | null> {
  if (!deps.available) return null;
  try {
    const s = await deps.settings();
    return s?.enabled ? s : null;
  } catch {
    return null;
  }
}

type ProofResult =
  | {
      readonly ok: true;
      readonly proof: "pow" | "turnstile" | "none";
      readonly challengeId: string | null;
      readonly expiresS?: number;
    }
  | { readonly ok: false; readonly outcome: SubmissionOutcome };

/** Step 7. */
async function checkProof(
  deps: PipelineDeps,
  settings: CommentSettings,
  sub: Record<string, unknown>,
  ctx: { kind: ChallengeKind; target: string; form: boolean; returnTo: string; now: Date },
): Promise<ProofResult> {
  const { form, returnTo } = ctx;
  const challenge = typeof sub.challenge === "string" ? sub.challenge : undefined;
  const solution = typeof sub.solution === "string" ? sub.solution : undefined;
  const token = typeof sub.turnstileToken === "string" ? sub.turnstileToken : undefined;
  const anyProof = challenge !== undefined || solution !== undefined || token !== undefined;
  if (!anyProof && form) {
    if (!withoutScriptAllowed(settings))
      return { ok: false, outcome: err(403, "script_required", form, { returnTo }) };
    return { ok: true, proof: "none", challengeId: null };
  }
  if (settings.protection === "turnstile") {
    if (token === undefined)
      return { ok: false, outcome: err(403, "proof_failed", form, { returnTo }) };
    if (!deps.turnstile) return { ok: false, outcome: err(503, "try_again", form, { returnTo }) };
    const tokenHash = (await sha256Hex(token)).slice(0, 32);
    let result: TurnstileResult;
    try {
      result = await deps.turnstile({
        token,
        remoteip: deps.clientAddress,
        idempotencyKey: tokenHash,
      });
    } catch {
      return { ok: false, outcome: err(503, "try_again", form, { returnTo }) };
    }
    const hosts = deps.hosts.map((h) => h.toLowerCase().replace(/:\d+$/, ""));
    if (
      !result.success ||
      !result.hostname ||
      !hosts.includes(result.hostname.toLowerCase()) ||
      result.action !== ctx.kind
    )
      return { ok: false, outcome: err(403, "proof_failed", form, { returnTo }) };
    return { ok: true, proof: "turnstile", challengeId: `ts_${tokenHash}` };
  }
  if (challenge === undefined || solution === undefined)
    return { ok: false, outcome: drop("bad_proof", form, returnTo) };
  const check = await verifyChallenge(deps.keys.pow, challenge, solution, {
    siteId: deps.siteId,
    target: ctx.target,
    kind: ctx.kind,
    now: ctx.now,
  });
  if (!check.ok) {
    if (check.reason === "expired")
      return { ok: false, outcome: err(400, "challenge_expired", form, { returnTo }) };
    return {
      ok: false,
      outcome: drop(check.reason === "too_fast" ? "too_fast" : "bad_proof", form, returnTo),
    };
  }
  if (deps.replay.has(check.id, ctx.now))
    return { ok: false, outcome: drop("replay", form, returnTo) };
  return { ok: true, proof: "pow", challengeId: check.id, expiresS: check.payload.e };
}

/** Isolate limits and the optional binding (first part of step 8). */
async function isolateLimits(
  deps: PipelineDeps,
  form: boolean,
  returnTo: string,
): Promise<SubmissionOutcome | undefined> {
  const clientKey = await deps.limiter.clientKey(deps.clientAddress);
  const retryAfter = deps.limiter.retryAfterS();
  if (!deps.limiter.allowSubmission(clientKey) || !deps.limiter.allowSite(deps.siteId))
    return err(429, "rate_limited", form, { retryAfter, returnTo });
  if (deps.rateLimit) {
    let allowed = true;
    try {
      allowed = await deps.rateLimit(clientKey);
    } catch {
      allowed = true; // the binding is an extra; the D1 limits below still apply
    }
    if (!allowed) return err(429, "rate_limited", form, { retryAfter: 60, returnTo });
  }
  return undefined;
}

/** This month's salt (read only) and the client's IP hash; a new salt is stored at step 12. */
async function clientHash(
  deps: PipelineDeps,
  now: Date,
  salt?: string,
): Promise<{ ipHmac: string; newSalt?: { month: string; salt: string } }> {
  const month = utcMonth(now);
  const stored = salt ?? (await deps.store.readSalt(month));
  // without an address the runtime vouches for, every such client shares the `unknown` hash: one
  // bucket for the D1 limits (stricter), which an IP ban never targets (SqlCommentStore.ban)
  const address = isClientAddress(deps.clientAddress) ? deps.clientAddress : UNKNOWN_CLIENT;
  if (stored) return { ipHmac: await ipHmac(stored, deps.siteId, address) };
  const fresh = randomSalt();
  return {
    ipHmac: await ipHmac(fresh, deps.siteId, address),
    newSalt: { month, salt: fresh },
  };
}

async function prepareEmail(
  deps: PipelineDeps,
  email: string | undefined,
): Promise<{ email?: PreparedEmail; hmac?: string }> {
  if (email === undefined) return {};
  const hmac = await emailHmac(deps.keys, email);
  const sealed = await sealEmail(deps.keys, deps.siteId, email);
  return {
    hmac,
    email: {
      id: newCommentsId(ID_PREFIX.commenter),
      hmac,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
    },
  };
}

// ───────────────────────────── POST /__cloudhal/comments ─────────────────────────────

export async function handleCommentSubmission(
  request: Request,
  deps: PipelineDeps,
): Promise<SubmissionOutcome> {
  // 1. method and feature
  if (request.method !== "POST") return err(405, "method_not_allowed", false);
  const settings = await loadSettings(deps);
  if (!settings) return err(404, "not_found", false);
  // 2. same origin
  if (!isSameOrigin(request, deps.hosts)) return err(403, "forbidden", false);
  // 3. size and type
  const body = await readSubmissionBody(request);
  if (!body.ok) return err(body.status, body.error, body.form);
  const form = body.form;
  // 4. schema
  const built = buildSubmission(body.fields, "comment");
  if (!built.ok) return err(400, "invalid", form, { fields: built.fields });
  const sub = built.value;
  const nodeId = sub.nodeId as string;
  const now = deps.now();

  // 5. thread
  const entry = await deps.resolveEntry(nodeId);
  if (!entry || entry.nodeId !== nodeId) return err(404, "not_found", form);
  const returnTo = safeReturnPath(entry.path);
  const thread = await deps.store.thread(deps.siteId, nodeId);
  const state = threadState({ settings, entry, thread, now });
  if (state === "closed") return err(403, "closed", form, { returnTo });
  if (state !== "open") return err(404, "not_found", form);
  let parentId: string | undefined;
  let inReplyToId: string | undefined;
  if (typeof sub.parentId === "string") {
    const parent = await deps.store.approvedComment(deps.siteId, sub.parentId);
    if (!parent || parent.nodeId !== nodeId)
      return err(400, "invalid", form, { fields: ["parentId"], returnTo });
    parentId = parent.parentId ?? parent.id;
    if (parent.parentId) inReplyToId = parent.id;
  }

  // 6. honeypot
  if (typeof sub.website === "string" && sub.website.length > 0)
    return drop("honeypot", form, returnTo);

  // 7. proof
  const proof = await checkProof(deps, settings, sub, {
    kind: "comment",
    target: nodeId,
    form,
    returnTo,
    now,
  });
  if (!proof.ok) return proof.outcome;
  const withoutScript = proof.proof === "none";

  // 8. rate limits
  const limited = await isolateLimits(deps, form, returnTo);
  if (limited) return limited;
  let client = await clientHash(deps, now);
  if (!client.newSalt) {
    const a = await deps.store.clientActivity(deps.siteId, client.ipHmac, {
      hour: addMs(now, -HOUR_MS),
      day: addMs(now, -DAY_MS),
      noScript: addMs(now, -STORED_LIMITS.noScriptWindowMs),
    });
    if (a.hour >= STORED_LIMITS.commentsPerClientPerHour)
      return err(429, "rate_limited", form, { retryAfter: 3600, returnTo });
    if (a.day >= STORED_LIMITS.commentsPerClientPerDay)
      return err(429, "rate_limited", form, { retryAfter: 86_400, returnTo });
    if (withoutScript && a.noScript >= 1)
      return err(429, "rate_limited", form, { retryAfter: 600, returnTo });
  }

  // 9. content rules
  const name = normalizeName(sub.name as string);
  const text = normalizeText(sub.body as string);
  const email = normalizeEmail(sub.email as string | undefined);
  const problems: [string, FieldProblem | undefined][] = [
    ["name", checkName(name)],
    ["email", email === undefined ? undefined : checkEmail(email)],
    ["body", checkText(text)],
  ];
  const bad = problems.filter(([, p]) => p !== undefined).map(([f]) => f);
  if (bad.length > 0) return err(400, "invalid", form, { fields: bad, returnTo });
  const lists = compiledLists(settings);
  const decision = evaluateContent(
    { name, text },
    { linkLimit: settings.linkLimit, watchWords: lists.watch, blockedWords: lists.blocked },
  );
  if (!decision.ok) return err(400, "invalid", form, { fields: [decision.field], returnTo });
  if (await deps.store.isDuplicate(deps.siteId, nodeId, text, addMs(now, -DAY_MS)))
    return drop("duplicate", form, returnTo);

  // 10. daily cap, JavaScript-less cap, pending per entry
  const today = await deps.daily.get(deps.siteId, utcDayStart(now), () =>
    deps.store.storedSince(deps.siteId, utcDayStart(now)),
  );
  if (today.total >= settings.dailyCap) return err(503, "paused", form, { returnTo });
  if (withoutScript && today.withoutScript >= STORED_LIMITS.noScriptPerSitePerDay)
    return err(503, "paused", form, { returnTo });
  if ((await deps.store.pendingOnEntry(deps.siteId, nodeId)) >= STORED_LIMITS.pendingPerEntry)
    return err(503, "paused", form, { returnTo });

  // 11. bans
  const sealed = await prepareEmail(deps, email);
  if (
    await deps.store.isBanned(
      deps.siteId,
      { ...(sealed.hmac ? { emailHmac: sealed.hmac } : {}), ipHmac: client.ipHmac },
      now.toISOString(),
    )
  )
    return drop("banned", form, returnTo);

  // 12. moderation decision and write
  const at = now.toISOString();
  const labels: CommentLabel[] = ruleLabels(decision.labels, at);
  const moderation: CommentModeration | undefined =
    decision.status === "spam"
      ? {
          action: "spam",
          actor: RULES_ACTOR,
          at,
          reasonCode: "spam",
          note: "Matched a blocked word.",
          automated: true,
        }
      : undefined;
  const id = newCommentsId(ID_PREFIX.comment);
  const prepare = (c: typeof client): PreparedSubmission => ({
    id,
    nodeId,
    ...(parentId ? { parentId } : {}),
    ...(inReplyToId ? { inReplyToId } : {}),
    name,
    text,
    status: decision.status,
    labels,
    ...(moderation ? { moderation } : {}),
    ...(sealed.email ? { email: sealed.email } : {}),
    ipHmac: c.ipHmac,
    challengeId: proof.challengeId,
    proof: proof.proof,
    createdAt: at,
    ...(c.newSalt ? { newSalt: c.newSalt } : {}),
  });
  let result = await deps.store.submit(deps.siteId, prepare(client));
  if ("saltConflict" in result) {
    const salt = await deps.store.readSalt(utcMonth(now));
    if (!salt) return err(503, "try_again", form, { returnTo });
    client = await clientHash(deps, now, salt);
    result = await deps.store.submit(deps.siteId, prepare(client));
    if ("saltConflict" in result) return err(503, "try_again", form, { returnTo });
  }
  if ("duplicate" in result) return drop("replay", form, returnTo);
  if (proof.challengeId && proof.expiresS !== undefined)
    deps.replay.add(proof.challengeId, proof.expiresS);
  deps.daily.increment(deps.siteId, withoutScript);
  return { kind: "pending", stored: true, id: result.id, status: decision.status, form, returnTo };
}

// ───────────────────────────── POST /__cloudhal/comments/report ─────────────────────────────

/**
 * A report (§6.6, DSA Art. 16): steps 1–4, 6–8 and 10. Only an approved comment can be reported;
 * a report never changes the comment's status.
 */
export async function handleReportSubmission(
  request: Request,
  deps: PipelineDeps,
): Promise<SubmissionOutcome> {
  if (request.method !== "POST") return err(405, "method_not_allowed", false);
  const settings = await loadSettings(deps);
  if (!settings) return err(404, "not_found", false);
  if (!isSameOrigin(request, deps.hosts)) return err(403, "forbidden", false);
  const body = await readSubmissionBody(request);
  if (!body.ok) return err(body.status, body.error, body.form);
  const form = body.form;
  const built = buildSubmission(body.fields, "report");
  if (!built.ok) return err(400, "invalid", form, { fields: built.fields });
  const sub = built.value;
  const commentId = sub.commentId as string;
  const now = deps.now();

  const target = await deps.store.approvedComment(deps.siteId, commentId);
  if (!target) return err(404, "not_found", form);
  const entry = await deps.resolveEntry(target.nodeId);
  if (!entry) return err(404, "not_found", form);
  const returnTo = safeReturnPath(entry.path);

  if (typeof sub.website === "string" && sub.website.length > 0)
    return drop("honeypot", form, returnTo);
  const proof = await checkProof(deps, settings, sub, {
    kind: "report",
    target: commentId,
    form,
    returnTo,
    now,
  });
  if (!proof.ok) return proof.outcome;

  const limited = await isolateLimits(deps, form, returnTo);
  if (limited) return limited;
  let client = await clientHash(deps, now);
  const activity = await deps.store.reportActivity(
    deps.siteId,
    client.newSalt ? null : client.ipHmac,
    {
      hour: addMs(now, -HOUR_MS),
      day: utcDayStart(now),
    },
  );
  if (activity.clientHour >= STORED_LIMITS.reportsPerClientPerHour)
    return err(429, "rate_limited", form, { retryAfter: 3600, returnTo });

  const details =
    typeof sub.details === "string"
      ? cutCodePoints(normalizeText(sub.details), REPORT_DETAILS_MAX) || null
      : null;
  const email = normalizeEmail(sub.email as string | undefined);
  if (email !== undefined && checkEmail(email))
    return err(400, "invalid", form, { fields: ["email"], returnTo });

  if (activity.siteDay >= STORED_LIMITS.reportsPerSitePerDay)
    return err(503, "paused", form, { returnTo });

  const sealed = await prepareEmail(deps, email);
  const id = newCommentsId(ID_PREFIX.report);
  const prepare = (c: typeof client): PreparedReport => ({
    id,
    commentId,
    reason: sub.reason as PreparedReport["reason"],
    details,
    ...(sealed.email ? { email: sealed.email } : {}),
    ipHmac: c.ipHmac,
    challengeId: proof.challengeId,
    createdAt: now.toISOString(),
    ...(c.newSalt ? { newSalt: c.newSalt } : {}),
  });
  let result = await deps.store.report(deps.siteId, prepare(client));
  if ("saltConflict" in result) {
    const salt = await deps.store.readSalt(utcMonth(now));
    if (!salt) return err(503, "try_again", form, { returnTo });
    client = await clientHash(deps, now, salt);
    result = await deps.store.report(deps.siteId, prepare(client));
    if ("saltConflict" in result) return err(503, "try_again", form, { returnTo });
  }
  if ("duplicate" in result) return drop("replay", form, returnTo);
  if (proof.challengeId && proof.expiresS !== undefined)
    deps.replay.add(proof.challengeId, proof.expiresS);
  return { kind: "pending", stored: true, id: result.id, form, returnTo };
}

// ───────────────────────────── GET /__cloudhal/comments/challenge ─────────────────────────────

export type ChallengeOutcome =
  | { readonly kind: "challenge"; readonly challenge: IssuedChallenge }
  | {
      readonly kind: "error";
      readonly status: number;
      readonly error: SubmissionError;
      readonly retryAfter?: number;
    };

/**
 * Issues a challenge (§6.1, §7.2): `?node=<entry id>&for=comment` for an open thread, or
 * `?node=<comment id>&for=report` for an approved comment; `404` otherwise. 20 a minute per client
 * (isolate). Difficulty ramps with today's stored submissions. Writes nothing.
 */
export async function handleChallengeRequest(
  request: Request,
  deps: PipelineDeps,
): Promise<ChallengeOutcome> {
  if (request.method !== "GET") return { kind: "error", status: 405, error: "method_not_allowed" };
  const settings = await loadSettings(deps);
  if (!settings) return { kind: "error", status: 404, error: "not_found" };
  const url = new URL(request.url);
  const target = url.searchParams.get("node") ?? "";
  const kind = (url.searchParams.get("for") ?? "comment") as ChallengeKind;
  if (kind !== "comment" && kind !== "report")
    return { kind: "error", status: 400, error: "invalid" };
  const idRe = kind === "comment" ? /^[a-z]+_[A-Za-z0-9]{6,32}$/ : /^cmt_[A-Za-z0-9]{6,32}$/;
  if (!idRe.test(target)) return { kind: "error", status: 400, error: "invalid" };
  const clientKey = await deps.limiter.clientKey(deps.clientAddress);
  if (!deps.limiter.allowChallenge(clientKey))
    return {
      kind: "error",
      status: 429,
      error: "rate_limited",
      retryAfter: deps.limiter.retryAfterS(),
    };
  const now = deps.now();
  if (kind === "comment") {
    const entry = await deps.resolveEntry(target);
    if (!entry) return { kind: "error", status: 404, error: "not_found" };
    const thread = await deps.store.thread(deps.siteId, target);
    if (threadState({ settings, entry, thread, now }) !== "open")
      return { kind: "error", status: 404, error: "not_found" };
  } else {
    const c = await deps.store.approvedComment(deps.siteId, target);
    if (!c) return { kind: "error", status: 404, error: "not_found" };
  }
  const today = await deps.daily.get(deps.siteId, utcDayStart(now), () =>
    deps.store.storedSince(deps.siteId, utcDayStart(now)),
  );
  const challenge = await issueChallenge(deps.keys.pow, {
    siteId: deps.siteId,
    target,
    kind,
    bits: difficultyFor(today.total, settings.dailyCap),
    now,
  });
  return { kind: "challenge", challenge };
}

// ───────────────────────────── answers (§6.3) ─────────────────────────────

const FRAGMENTS: Partial<Record<SubmissionError, string>> = {
  invalid: "comment-invalid",
  closed: "comment-closed",
  script_required: "comment-script-required",
  rate_limited: "comment-slow-down",
  proof_failed: "comment-try-again",
  try_again: "comment-try-again",
  challenge_expired: "comment-try-again",
  paused: "comment-paused",
};

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * Turns an outcome into the response of §6.3: form posts get `303 See Other` to a fragment of the
 * entry's cached page (`#comment-pending`, `#comment-invalid`, …); the module gets JSON. Every
 * answer is `no-store`. Dropped submissions are indistinguishable from stored ones. `pendingFragment`
 * lets the report endpoint answer `#comment-reported`.
 */
export function submissionResponse(
  outcome: SubmissionOutcome,
  options: { readonly pendingFragment?: string } = {},
): Response {
  if (outcome.kind === "pending") {
    if (outcome.form)
      return new Response(null, {
        status: 303,
        headers: {
          ...NO_STORE,
          location: `${outcome.returnTo ?? "/"}#${options.pendingFragment ?? "comment-pending"}`,
        },
      });
    return Response.json({ status: "pending" }, { status: 200, headers: NO_STORE });
  }
  const headers: Record<string, string> = { ...NO_STORE };
  if (outcome.retryAfter !== undefined) headers["retry-after"] = String(outcome.retryAfter);
  if (outcome.status === 405) headers.allow = "POST";
  const fragment = FRAGMENTS[outcome.error];
  if (outcome.form && fragment && outcome.returnTo !== undefined)
    return new Response(null, {
      status: 303,
      headers: { ...headers, location: `${outcome.returnTo}#${fragment}` },
    });
  if (outcome.form) return new Response(outcome.error, { status: outcome.status, headers });
  return Response.json(
    {
      error: outcome.error,
      ...(outcome.fields ? { fields: outcome.fields } : {}),
      ...(outcome.retryAfter !== undefined ? { retryAfter: outcome.retryAfter } : {}),
    },
    { status: outcome.status, headers },
  );
}

/** The challenge endpoint's answer (JSON, `no-store`). */
export function challengeResponse(outcome: ChallengeOutcome): Response {
  if (outcome.kind === "challenge") return Response.json(outcome.challenge, { headers: NO_STORE });
  const headers: Record<string, string> = { ...NO_STORE };
  if (outcome.retryAfter !== undefined) headers["retry-after"] = String(outcome.retryAfter);
  if (outcome.status === 405) headers.allow = "GET";
  return Response.json({ error: outcome.error }, { status: outcome.status, headers });
}
