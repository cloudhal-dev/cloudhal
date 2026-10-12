/**
 * The comments module and its proof-of-work worker (RFC-0007 §7.3, §8.2): built and hashed by the
 * integration, within their gzipped budgets (module ≤ 4 KB, worker ≤ 1 KB), first-party, storage-
 * free, and the worker's pure-JS SHA-256 finds exactly the counter the server's verifier accepts.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  deriveCommentKeys,
  issueChallenge,
  solveChallenge,
  verifyChallenge,
} from "@cloudhal/comments";
import {
  CLIENT_DIR,
  COMMENTS_CHALLENGE_ENDPOINT,
  COMMENTS_ENDPOINT,
  COMMENTS_REPORT_ENDPOINT,
  MODULE_GZIP_BUDGET,
  SOLVER_GZIP_BUDGET,
  TURNSTILE_ORIGIN,
} from "@cloudhal/comments/client";
import { beforeAll, describe, expect, it } from "vitest";
import { COMMENTS_CHALLENGE_PATH, COMMENTS_PATH, COMMENTS_REPORT_PATH } from "../src/comments.ts";
import { buildCommentsClient, type CommentsClient } from "../src/comments-client.ts";
import { TURNSTILE_ORIGIN as CSP_TURNSTILE } from "../src/csp.ts";

let client: CommentsClient;
let solve: (challenge: string, bits: number) => string;

beforeAll(async () => {
  client = await buildCommentsClient();
  const mod = (await import(
    `data:text/javascript,${encodeURIComponent(client.solver.code)}`
  )) as Record<string, unknown>;
  // the built worker exports its search (minified name); it is the only export
  const fn = Object.values(mod).find((v) => typeof v === "function");
  solve = fn as typeof solve;
});

/** The reference: the smallest counter whose SHA-256(challenge ":" x) has `bits` leading zeros. */
function reference(challenge: string, bits: number): string {
  for (let x = 0; ; x++) {
    const digest = createHash("sha256").update(`${challenge}:${x}`).digest();
    let zeros = 0;
    for (const byte of digest) {
      if (byte === 0) {
        zeros += 8;
        continue;
      }
      zeros += Math.clz32(byte) - 24;
      break;
    }
    if (zeros >= bits) return String(x);
  }
}

describe("comments client build", () => {
  it("emits hashed first-party file names and keeps the endpoints in sync", () => {
    expect(client.module.path).toMatch(/^\/_cloudhal\/c\.[0-9a-f]{8}\.js$/);
    expect(client.solver.path).toMatch(/^\/_cloudhal\/cw\.[0-9a-f]{8}\.js$/);
    expect(client.module.path.startsWith(CLIENT_DIR)).toBe(true);
    expect([COMMENTS_ENDPOINT, COMMENTS_REPORT_ENDPOINT, COMMENTS_CHALLENGE_ENDPOINT]).toEqual([
      COMMENTS_PATH,
      COMMENTS_REPORT_PATH,
      COMMENTS_CHALLENGE_PATH,
    ]);
    expect(TURNSTILE_ORIGIN).toBe(CSP_TURNSTILE);
    // the module starts the worker by its hashed URL, as a module worker
    expect(client.module.code).toContain(client.solver.path);
    expect(client.module.code).toContain("/__cloudhal/comments");
  });

  it("keeps the module within 4 KB and the worker within 1 KB, gzipped", () => {
    expect(gzipSync(client.module.code).byteLength).toBeLessThanOrEqual(MODULE_GZIP_BUDGET);
    expect(gzipSync(client.solver.code).byteLength).toBeLessThanOrEqual(SOLVER_GZIP_BUDGET);
  });

  it("uses no device storage, no cookies, no WebAssembly and no third party but opt-in Turnstile", () => {
    for (const { code } of [client.module, client.solver]) {
      expect(code).not.toMatch(/cookie|localStorage|sessionStorage|indexedDB|WebAssembly|eval\(/i);
      const urls = code.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) expect(url.startsWith(`${TURNSTILE_ORIGIN}/`), url).toBe(true);
    }
    expect(client.solver.code).not.toMatch(/https?:\/\//);
  });

  it("finds the smallest counter, for short and multi-block challenges alike", () => {
    for (const length of [1, 40, 54, 55, 56, 63, 64, 65, 119, 120, 128, 200]) {
      const challenge = `v1.${"a".repeat(length)}.mac`;
      expect(solve(challenge, 10), `length ${length}`).toBe(reference(challenge, 10));
    }
  });

  it("solves a real challenge the server's verifier accepts", async () => {
    const keys = await deriveCommentKeys("client-test-key-not-a-secret-000000000");
    const now = new Date("2026-10-12T10:00:00Z");
    const { challenge } = await issueChallenge(keys.pow, {
      siteId: "site_client01",
      target: "entry_client01",
      kind: "comment",
      bits: 12,
      now,
    });
    const solution = solve(challenge, 12);
    expect(solution).toBe(await solveChallenge(challenge));
    const check = await verifyChallenge(keys.pow, challenge, solution, {
      siteId: "site_client01",
      target: "entry_client01",
      kind: "comment",
      now: new Date(now.getTime() + 5000),
    });
    expect(check.ok).toBe(true);
  });
});
