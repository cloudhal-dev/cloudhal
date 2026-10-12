import { describe, expect, it } from "vitest";
import {
  applySettingsInput,
  CommentLimiter,
  CommentSettingsError,
  clientNetwork,
  commentStateHash,
  DAY_MS,
  defaultCommentSettings,
  deletedEntriesDue,
  deriveCommentKeys,
  difficultyFor,
  emailHmac,
  ISOLATE_LIMITS,
  ipHmac,
  isClientAddress,
  issueChallenge,
  KEY_INFO,
  leadingZeroBits,
  MAX_CLIENT_DATA_DAYS,
  oldestSaltMonthToKeep,
  openEmail,
  openSecret,
  planPurge,
  purgeBackoffMs,
  ReplayCache,
  rateLimitKey,
  retentionPlan,
  sealEmail,
  sealSecret,
  settingsPurgeTags,
  solveChallenge,
  threadClosesAt,
  threadState,
  UNKNOWN_CLIENT_KEY,
  verifyChallenge,
  withoutScriptAllowed,
} from "../src/index.ts";

const SECRET = "test-only-comments-key-0123456789abcdef";
const keysP = deriveCommentKeys(SECRET);
const T0 = new Date("2026-10-12T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("proof of work (§7)", () => {
  const expect_ = {
    siteId: "site_abcdef",
    target: "entry_abcdef",
    kind: "comment" as "comment" | "report",
  };

  it("issues, solves and verifies; the difficulty is in the signed payload", async () => {
    const keys = await keysP;
    const issued = await issueChallenge(keys.pow, { ...expect_, bits: 6, now: T0 });
    expect(issued.challenge).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(issued.challenge.length).toBeLessThanOrEqual(512);
    expect(issued.expiresAt).toBe("2026-10-12T10:10:00.000Z");
    const solution = await solveChallenge(issued.challenge);
    const ok = await verifyChallenge(keys.pow, issued.challenge, solution, {
      ...expect_,
      now: at(5000),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("refuses forged, tampered, mismatched, expired, early and wrong answers", async () => {
    const keys = await keysP;
    const other = await deriveCommentKeys(`${SECRET}-other`);
    const issued = await issueChallenge(keys.pow, { ...expect_, bits: 6, now: T0 });
    const sol = await solveChallenge(issued.challenge);
    const later = { ...expect_, now: at(5000) };
    const reason = async (c: string, s: string, e = later) => {
      const r = await verifyChallenge(keys.pow, c, s, e);
      return r.ok ? "ok" : r.reason;
    };
    // forged by another key
    const forged = await issueChallenge(other.pow, { ...expect_, bits: 0, now: T0 });
    expect(await reason(forged.challenge, "0")).toBe("bad_mac");
    // payload tampered (easier difficulty), MAC kept
    const [v, body, mac] = issued.challenge.split(".");
    const json = JSON.parse(Buffer.from(body ?? "", "base64url").toString());
    const easier = Buffer.from(JSON.stringify({ ...json, b: 0 })).toString("base64url");
    expect(await reason(`${v}.${easier}.${mac}`, "0")).toBe("bad_mac");
    expect(await reason("v2.x.y", sol)).toBe("malformed");
    expect(await reason(issued.challenge, "01")).toBe("malformed");
    expect(await reason(issued.challenge, sol, { ...later, siteId: "site_zzzzzz" })).toBe(
      "mismatch",
    );
    expect(await reason(issued.challenge, sol, { ...later, target: "entry_zzzzzz" })).toBe(
      "mismatch",
    );
    expect(await reason(issued.challenge, sol, { ...later, kind: "report" })).toBe("mismatch");
    expect(await reason(issued.challenge, sol, { ...later, now: at(600_000) })).toBe("expired");
    expect(await reason(issued.challenge, sol, { ...later, now: at(2_000) })).toBe("too_fast");
    // a wrong counter (find one that does not solve)
    let wrong = 0;
    while (
      leadingZeroBits(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`${issued.challenge}:${wrong}`),
          ),
        ),
      ) >= 6
    )
      wrong++;
    expect(await reason(issued.challenge, String(wrong))).toBe("wrong_solution");
  });

  it("ramps difficulty with the daily cap and never passes 21 bits", () => {
    expect(difficultyFor(0, 1000)).toBe(18);
    expect(difficultyFor(500, 1000)).toBe(18);
    expect(difficultyFor(501, 1000)).toBe(20);
    expect(difficultyFor(801, 1000)).toBe(21);
    expect(difficultyFor(5000, 1000)).toBe(21);
  });

  it("the replay cache remembers used ids until they expire, bounded", () => {
    const c = new ReplayCache(2);
    const e = T0.getTime() / 1000 + 600;
    c.add("a", e);
    expect(c.has("a", T0)).toBe(true);
    expect(c.has("a", at(600_000))).toBe(false);
    c.add("b", e);
    c.add("c", e);
    c.add("d", e);
    expect(c.size).toBe(2);
    expect(c.has("b", T0)).toBe(false);
  });
});

describe("keys and hashes", () => {
  it("IP HMACs: /64 for IPv6, mapped IPv4, per site, per salt", async () => {
    expect(clientNetwork("203.0.113.9")).toBe("203.0.113.9");
    expect(clientNetwork("2001:db8:1:2:aaaa::1")).toBe("2001:0db8:0001:0002::/64");
    expect(clientNetwork("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:0db8:0001:0002::/64");
    expect(clientNetwork("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(clientNetwork("::1")).toBe("0000:0000:0000:0000::/64");
    const salt = "a".repeat(64);
    const h = await ipHmac(salt, "site_abcdef", "2001:db8:1:2::5");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(await ipHmac(salt, "site_abcdef", "2001:db8:1:2:9::9")).toBe(h);
    expect(await ipHmac(salt, "site_other1", "2001:db8:1:2::5")).not.toBe(h);
    expect(await ipHmac("b".repeat(64), "site_abcdef", "2001:db8:1:2::5")).not.toBe(h);
    await expect(ipHmac("short", "site_abcdef", "1.2.3.4")).rejects.toThrow();
  });

  it("the isolate limiter counts an IPv6 /64 as one client; no address is one stricter bucket", async () => {
    const limiter = new CommentLimiter({ now: () => T0.getTime() });
    const a = await limiter.clientKey("2001:db8:1:2::1");
    expect(await limiter.clientKey("2001:db8:1:2:ffff:ffff:ffff:fffe")).toBe(a);
    expect(await limiter.clientKey("2001:db8:1:3::1")).not.toBe(a);
    expect(await limiter.clientKey("::ffff:198.51.100.7")).toBe(
      await limiter.clientKey("198.51.100.7"),
    );
    for (let i = 0; i < 3; i++) expect(limiter.allowSubmission(a)).toBe(true);
    expect(limiter.allowSubmission(a)).toBe(false);
    // no address the runtime vouches for: one shared key, 1 submission and 5 challenges a minute
    for (const missing of ["", "unknown", "not-an-address"])
      expect(await limiter.clientKey(missing)).toBe(UNKNOWN_CLIENT_KEY);
    expect(limiter.allowSubmission(UNKNOWN_CLIENT_KEY)).toBe(true);
    expect(limiter.allowSubmission(UNKNOWN_CLIENT_KEY)).toBe(false);
    for (let i = 0; i < 5; i++) expect(limiter.allowChallenge(UNKNOWN_CLIENT_KEY)).toBe(true);
    expect(limiter.allowChallenge(UNKNOWN_CLIENT_KEY)).toBe(false);
    expect(ISOLATE_LIMITS).toMatchObject({
      unknownSubmissionsPerMinute: 1,
      unknownChallengesPerMinute: 5,
    });
    expect(isClientAddress("2001:db8::1")).toBe(true);
    expect(isClientAddress("unknown")).toBe(false);
  });

  it("the COMMENTS_RL key: derived from the deployment secret, one per client network", async () => {
    const keys = await keysP;
    const k = await rateLimitKey(keys, "2001:db8:1:2::1");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(await rateLimitKey(keys, "2001:db8:1:2:9::9")).toBe(k);
    expect(await rateLimitKey(keys, "2001:db8:1:3::1")).not.toBe(k);
    expect(
      await rateLimitKey(await deriveCommentKeys(`${SECRET}-other`), "2001:db8:1:2::1"),
    ).not.toBe(k);
    expect(KEY_INFO.rateLimit).toBe("cloudhal/comments/rl/v1");
  });

  it("emails: keyed hash on the lower-cased address, AES-GCM bound to the site", async () => {
    const keys = await keysP;
    expect(await emailHmac(keys, " Ayse@Example.com")).toBe(
      await emailHmac(keys, "ayse@example.com"),
    );
    const sealed = await sealEmail(keys, "site_abcdef", "Ayse@Example.com");
    expect(sealed.ciphertext).not.toContain("ayse");
    expect(await openEmail(keys, "site_abcdef", sealed)).toBe("ayse@example.com");
    await expect(openEmail(keys, "site_zzzzzz", sealed)).rejects.toThrow();
    const other = await deriveCommentKeys(`${SECRET}-other`);
    await expect(openEmail(other, "site_abcdef", sealed)).rejects.toThrow();
    const s = await sealSecret(keys, "site_abcdef", "turnstile-secret", "0x4AAA");
    expect(await openSecret(keys, "site_abcdef", "turnstile-secret", s)).toBe("0x4AAA");
    await expect(openSecret(keys, "site_abcdef", "other", s)).rejects.toThrow();
    await expect(deriveCommentKeys("too-short")).rejects.toThrow();
  });

  it("cm1: state hashes are order-independent and see every change", async () => {
    const base = {
      comments: [
        { id: "cmt_aaaaaa", rev: 1, status: "pending" as const },
        { id: "cmt_bbbbbb", rev: 3, status: "approved" as const },
      ],
      threads: [{ nodeId: "entry_abcdef", rev: 0, state: "open" as const }],
    };
    const h = await commentStateHash(base);
    expect(h).toMatch(/^cm1:[0-9a-f]{64}$/);
    expect(await commentStateHash({ ...base, comments: [...base.comments].reverse() })).toBe(h);
    expect(
      await commentStateHash({
        ...base,
        comments: [
          { id: "cmt_aaaaaa", rev: 2, status: "pending" },
          { id: "cmt_bbbbbb", rev: 3, status: "approved" },
        ],
      }),
    ).not.toBe(h);
    expect(
      await commentStateHash({
        ...base,
        threads: [{ nodeId: "entry_abcdef", rev: 0, state: "closed" }],
      }),
    ).not.toBe(h);
  });
});

describe("settings and threadState (§4.5)", () => {
  const on = applySettingsInput(defaultCommentSettings("site_abcdef"), {
    enabled: true,
    collections: {
      posts: { enabled: true },
      news: { enabled: true, closeAfterDays: 14 },
      pages: { enabled: false },
    },
  });
  const entry = {
    nodeId: "entry_abcdef",
    collection: "posts",
    publishedAt: "2026-10-01T00:00:00.000Z",
  };

  it("defaults: off, 90 days, proof of work, 1,000 a day", () => {
    const d = defaultCommentSettings("site_abcdef");
    expect(d).toMatchObject({
      enabled: false,
      closeAfterDays: 90,
      protection: "pow",
      dailyCap: 1000,
      linkLimit: 2,
      rev: 0,
    });
    expect(threadState({ settings: d, entry, now: T0 })).toBe("off");
  });

  it("validates input", () => {
    const d = defaultCommentSettings("site_abcdef");
    const bad: unknown[] = [
      { nope: 1 },
      { enabled: "yes" },
      { collections: { "Bad Slug": { enabled: true } } },
      { collections: { posts: { enabled: true, extra: 1 } } },
      { closeAfterDays: 0 },
      { closeAfterDays: 1.5 },
      { protection: "captcha" },
      { protection: "turnstile" },
      { turnstileSiteKey: "<script>" },
      { linkLimit: 11 },
      { dailyCap: 0 },
      { watchWords: ["ok", ""] },
      { watchWords: Array(201).fill("w") },
      { retention: { pendingDays: 0 } },
      { retention: { forever: 1 } },
      // the privacy notice says "up to 30 days" for hashed addresses (§9.1, §9.6)
      { retention: { clientDataDays: 31 } },
      { retention: { clientDataDays: 3650 } },
      { retention: { clientDataDays: 0 } },
    ];
    for (const b of bad)
      expect(() => applySettingsInput(d, b as never), JSON.stringify(b)).toThrow(
        CommentSettingsError,
      );
    const ok = applySettingsInput(d, {
      protection: "turnstile",
      turnstileSiteKey: "0x4AAAAAAA",
      watchWords: [" Kripto ", "KRİPTO", "kripto"],
      retention: { hiddenDays: 180 },
      closeAfterDays: null,
    });
    expect(ok.watchWords).toEqual(["Kripto"]);
    expect(ok.retention.hiddenDays).toBe(180);
    expect(ok.retention.pendingDays).toBe(30);
    expect(ok.closeAfterDays).toBeNull();
    expect(
      applySettingsInput(d, { retention: { clientDataDays: 7 } }).retention.clientDataDays,
    ).toBe(7);
    expect(MAX_CLIENT_DATA_DAYS).toBe(30);
  });

  it("posts without JavaScript: on under proof of work, off under Turnstile unless allowed there", () => {
    const d = defaultCommentSettings("site_abcdef");
    expect(d).toMatchObject({ allowWithoutScript: true, allowWithoutScriptWithTurnstile: false });
    expect(withoutScriptAllowed(d)).toBe(true);
    const ts = applySettingsInput(d, { protection: "turnstile", turnstileSiteKey: "0x4AAAAAAA" });
    expect(withoutScriptAllowed(ts)).toBe(false);
    expect(
      withoutScriptAllowed(applySettingsInput(ts, { allowWithoutScriptWithTurnstile: true })),
    ).toBe(true);
    expect(
      withoutScriptAllowed(
        applySettingsInput(ts, {
          allowWithoutScriptWithTurnstile: true,
          allowWithoutScript: false,
        }),
      ),
    ).toBe(false);
    expect(withoutScriptAllowed(applySettingsInput(d, { allowWithoutScript: false }))).toBe(false);
    expect(() =>
      applySettingsInput(d, { allowWithoutScriptWithTurnstile: "yes" } as never),
    ).toThrow(CommentSettingsError);
  });

  it("open until first publication + closeAfterDays (collection, else site)", () => {
    expect(threadClosesAt(on, entry)).toBe("2026-12-30T00:00:00.000Z");
    expect(threadState({ settings: on, entry, now: T0 })).toBe("open");
    expect(threadState({ settings: on, entry, now: new Date("2026-12-30T00:00:00.000Z") })).toBe(
      "closed",
    );
    const news = { ...entry, collection: "news" };
    expect(threadState({ settings: on, entry: news, now: T0 })).toBe("open");
    expect(
      threadState({
        settings: on,
        entry: news,
        now: new Date(Date.parse(entry.publishedAt) + 14 * DAY_MS),
      }),
    ).toBe("closed");
    const never = applySettingsInput(on, { closeAfterDays: null });
    expect(threadClosesAt(never, entry)).toBeNull();
    expect(threadState({ settings: never, entry, now: new Date("2030-01-01T00:00:00Z") })).toBe(
      "open",
    );
  });

  it("entry modes and the off rules", () => {
    const later = new Date("2027-06-01T00:00:00Z");
    expect(
      threadState({ settings: on, entry, thread: { mode: "hidden", closesAt: null }, now: T0 }),
    ).toBe("hidden");
    expect(
      threadState({ settings: on, entry, thread: { mode: "closed", closesAt: null }, now: T0 }),
    ).toBe("closed");
    expect(
      threadState({ settings: on, entry, thread: { mode: "open", closesAt: null }, now: later }),
    ).toBe("open");
    expect(
      threadState({
        settings: on,
        entry,
        thread: { mode: "open", closesAt: "2026-11-01T00:00:00Z" },
        now: later,
      }),
    ).toBe("closed");
    expect(
      threadState({
        settings: on,
        entry,
        thread: { mode: "default", closesAt: "2026-10-05T00:00:00Z" },
        now: T0,
      }),
    ).toBe("closed");
    const pages = { ...entry, collection: "pages" };
    expect(threadState({ settings: on, entry: pages, now: T0 })).toBe("off");
    expect(threadState({ settings: on, entry: pages, hasApproved: true, now: T0 })).toBe("closed");
    const noShow = applySettingsInput(on, { showWhenOff: false, enabled: false });
    expect(threadState({ settings: noShow, entry, hasApproved: true, now: T0 })).toBe("off");
    expect(
      threadState({ settings: noShow, entry, thread: { mode: "open", closesAt: null }, now: T0 }),
    ).toBe("off");
  });
});

describe("purge planner (§8.4)", () => {
  const row = (
    tag: string,
    priority: "takedown" | "normal",
    ageMs: number,
    extra: Partial<{ attempts: number; nextAt: string }> = {},
  ) => ({
    tag,
    priority,
    enqueuedAt: at(-ageMs).toISOString(),
    attempts: extra.attempts ?? 0,
    nextAt: extra.nextAt ?? at(-ageMs).toISOString(),
  });

  it("takedowns go at once and carry normal tags in spare room", () => {
    const plan = planPurge({
      rows: [row("t1", "takedown", 0), row("n1", "normal", 1000)],
      recent: [{ at: at(-1000).toISOString(), requests: 5 }],
      now: T0,
    });
    expect(plan.requests).toEqual([{ priority: "takedown", tags: ["t1", "n1"] }]);
    expect(plan.nextCheckAt).toBeNull();
  });

  it("normal tags wait 20 s and leave room for publishes", () => {
    const young = planPurge({ rows: [row("n1", "normal", 5000)], recent: [], now: T0 });
    expect(young.requests).toEqual([]);
    expect(young.nextCheckAt).toBe(at(15_000).toISOString());
    const ripe = planPurge({ rows: [row("n1", "normal", 25_000)], recent: [], now: T0 });
    expect(ripe.requests).toEqual([{ priority: "normal", tags: ["n1"] }]);
    const busy = planPurge({
      rows: [row("n1", "normal", 25_000)],
      recent: [
        { at: at(-50_000).toISOString(), requests: 1 },
        { at: at(-10_000).toISOString(), requests: 2 },
      ],
      now: T0,
    });
    expect(busy.requests).toEqual([]);
    expect(busy.nextCheckAt).toBe(at(10_000).toISOString());
  });

  it("batches 100 tags a request and respects back-off", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      row(`n${String(i).padStart(3, "0")}`, "normal", 30_000),
    );
    const plan = planPurge({
      rows: many,
      recent: [{ at: at(-1000).toISOString(), requests: 1 }],
      now: T0,
    });
    expect(plan.requests.map((r) => r.tags.length)).toEqual([100, 50]);
    const backing = planPurge({
      rows: [row("t1", "takedown", 60_000, { attempts: 2, nextAt: at(90_000).toISOString() })],
      recent: [],
      now: T0,
    });
    expect(backing.requests).toEqual([]);
    expect(backing.nextCheckAt).toBe(at(90_000).toISOString());
    expect(
      planPurge({
        rows: [row("t1", "takedown", 130_000, { nextAt: at(1).toISOString() })],
        recent: [],
        now: T0,
      }).takedownWaiting,
    ).toBe(true);
    expect([0, 1, 2, 3, 4, 10].map(purgeBackoffMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 300_000, 300_000,
    ]);
  });

  it("settings changes purge the entries' tags, or everything above 300", () => {
    expect(settingsPurgeTags(["entry_a1b2c3", "entry_a1b2c3"])).toEqual({
      everything: false,
      tags: ["cloudhal-comments-entry_a1b2c3"],
    });
    expect(settingsPurgeTags(Array.from({ length: 301 }, (_, i) => `entry_${i}xxxxx`))).toEqual({
      everything: true,
    });
  });
});

describe("retention plan (§9.3)", () => {
  it("cutoffs from the settings, comments before emails", () => {
    const plan = retentionPlan(undefined, T0);
    expect(plan.budget).toBe(500);
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "pending",
      "spam",
      "deleted",
      "tombstones",
      "client-data",
      "reports",
      "events",
      "emails",
      "bans",
    ]);
    expect(plan.steps[0]?.cutoff).toBe(new Date(T0.getTime() - 30 * DAY_MS).toISOString());
    const hidden = retentionPlan({ ...defaultCommentSettings("s").retention, hiddenDays: 180 }, T0);
    expect(hidden.steps.find((s) => s.kind === "hidden")?.cutoff).toBe(
      new Date(T0.getTime() - 180 * DAY_MS).toISOString(),
    );
    // a value stored before the ceiling is clamped: hashes never outlive 30 days
    const legacy = retentionPlan(
      { ...defaultCommentSettings("s").retention, clientDataDays: 365 },
      T0,
    );
    expect(legacy.steps.find((s) => s.kind === "client-data")?.cutoff).toBe(
      new Date(T0.getTime() - 30 * DAY_MS).toISOString(),
    );
    const shorter = retentionPlan(
      { ...defaultCommentSettings("s").retention, clientDataDays: 7 },
      T0,
    );
    expect(shorter.steps.find((s) => s.kind === "client-data")?.cutoff).toBe(
      new Date(T0.getTime() - 7 * DAY_MS).toISOString(),
    );
    expect(oldestSaltMonthToKeep(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
    expect(
      deletedEntriesDue(
        [
          { nodeId: "entry_old111", deletedAt: "2026-09-01T00:00:00Z" },
          { nodeId: "entry_new111", deletedAt: "2026-10-01T00:00:00Z" },
        ],
        T0,
      ),
    ).toEqual(["entry_old111"]);
  });
});
