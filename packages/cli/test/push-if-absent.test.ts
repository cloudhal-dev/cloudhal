/**
 * `pushSite({ ifAbsent })`, the push `cloudhal deploy` makes after uploading the Workers. On
 * 2026-11-15, a Workers Builds deploy of cloudhal.com failed: the probe for the site got 401,
 * because the new deployment token had not reached the edge yet. It was read as "absent", and
 * the bootstrap PUT that followed got 409 for the site the deployment had. Only 200 and 404
 * answer the probe now; a 401 is retried by `whileTokenPropagates`. A bootstrap 409 for that
 * site is "already deployed".
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { whileTokenPropagates } from "../src/commands/deploy/resources.ts";
import { init, pushSite, readProjectConfig } from "../src/index.ts";

const ADMIN = "https://push-admin.example.workers.dev";
const TOKEN = "test-deploy-token";
const CONFLICT = JSON.stringify({
  error: "conflict",
  message:
    'target already has site site_x with different content (1 node(s) differ: n1); pull first or pass mode "replace"',
  details: { differing: ["n1"] },
});

type Call = { method: string; path: string };

/** A fetch that answers the bundle probe with `probes` in turn and the bundle PUT with `put`. */
function stub(probes: number[], put: { status: number; body: string }) {
  const calls: Call[] = [];
  const queue = [...probes];
  const f = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    if (url.pathname.endsWith("/bundle") && method === "GET") {
      const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] as number);
      const body = status === 404 ? '{"error":"not_found","message":"site not found"}' : "{}";
      return new Response(status === 200 ? "{}" : body, { status });
    }
    if (url.pathname.endsWith("/bundle") && method === "PUT")
      return new Response(put.body, { status: put.status });
    // Media: the deployment has every file already.
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const puts = () => calls.filter((c) => c.method === "PUT" && c.path.endsWith("/bundle")).length;
  const probesMade = () =>
    calls.filter((c) => c.method === "GET" && c.path.endsWith("/bundle")).length;
  return { f, puts, probesMade };
}

describe("pushSite({ ifAbsent }) after a deploy", () => {
  let tmp: string;
  let projectDir: string;
  const lines: string[] = [];
  const log = (l: string) => lines.push(l);

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-push-if-absent-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Push If Absent" });
    const cfg = await readProjectConfig(projectDir);
    const dir = path.join(projectDir, cfg.dataDir, "deploy");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: TOKEN }),
    );
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  const push = (f: typeof fetch, extra: { ifAbsent?: boolean; replace?: boolean } = {}) =>
    pushSite({ projectDir, adminUrl: ADMIN, fetch: f, log, ifAbsent: true, ...extra });

  it("retries a 401 probe while the token spreads, then leaves the deployed site alone", async () => {
    const s = stub([401, 401, 200], { status: 500, body: "must not be called" });
    lines.length = 0;
    const result = await whileTokenPropagates(() => push(s.f), { log, waitMs: 1 });
    expect(result).toEqual({ pushed: false, message: "already deployed" });
    expect(s.probesMade()).toBe(3);
    expect(s.puts()).toBe(0);
    expect(lines.join("\n")).toContain("does not accept the new token yet");
    expect(lines.join("\n")).toContain("already has this site");
  });

  it("pushes the site when the probe answers 404", async () => {
    const s = stub([404], { status: 200, body: '{"ok":true}' });
    expect(await push(s.f)).toEqual({ pushed: true, message: '{"ok":true}' });
    expect(s.puts()).toBe(1);
  });

  it("fails on any other probe answer and pushes nothing", async () => {
    for (const status of [500, 502, 403]) {
      const s = stub([status], { status: 200, body: '{"ok":true}' });
      const err = push(s.f);
      await expect(err).rejects.toThrow(`failed (${status})`);
      await expect(err).rejects.toThrow(/nothing was pushed/);
      expect(s.puts()).toBe(0);
    }
    // Not retried by whileTokenPropagates: only a 401 is the token spreading.
    const s = stub([500], { status: 200, body: "{}" });
    await expect(whileTokenPropagates(() => push(s.f), { log, waitMs: 1 })).rejects.toThrow(
      /\(500\)/,
    );
    expect(s.probesMade()).toBe(1);
  });

  it("takes a bootstrap 409 for the same site as already deployed", async () => {
    const s = stub([404], { status: 409, body: CONFLICT });
    lines.length = 0;
    expect(await push(s.f)).toEqual({ pushed: false, message: "already deployed" });
    expect(lines.join("\n")).toContain("already has this site");
  });

  it("keeps the divergence error for `cloudhal push` (no ifAbsent)", async () => {
    const s = stub([], { status: 409, body: CONFLICT });
    await expect(push(s.f, { ifAbsent: false })).rejects.toThrow(/diverged from your local copy/);
    expect(s.probesMade()).toBe(0);
    // Other 409s under ifAbsent are still errors.
    const other = stub([404], {
      status: 409,
      body: '{"error":"schedules_running","message":"a release is running"}',
    });
    await expect(push(other.f)).rejects.toThrow(/a release is running/);
  });
});
