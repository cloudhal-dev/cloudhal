/**
 * RFC-0007 rollout step 10: `cloudhal.json` → `comments`, the comments parts of the generated
 * wrangler configs, `cloudhal comments status|export|import` (local and `--remote` over the
 * deployment token, moving comments between two stores with different comments keys) and the
 * local hourly job `cloudhal studio` and `cloudhal mcp` run (Node has no cron).
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApi } from "@cloudhal/api";
import {
  deriveCommentKeys,
  emailHmac,
  ID_PREFIX,
  newCommentsId,
  sealEmail,
} from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { ContentEntry } from "@cloudhal/core-contracts";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminWorkerConfig,
  HOURLY_CRON,
  rateLimitNamespaceId,
  siteWorkerConfig,
} from "../src/cloudflare/config.ts";
import { commentsRateLimitDeployment, loadOrCreateSecrets } from "../src/commands/deploy.ts";
import { commentsAvailable, parseCommentsConfig } from "../src/config.ts";
import {
  commentsExportCli,
  commentsImportCli,
  commentsStatusCli,
  describeCommentsStatus,
  init,
  pushSite,
  readProjectConfig,
  runLocalCommentsJob,
  snapshot,
} from "../src/index.ts";

describe("cloudhal.json comments and the generated configs", () => {
  it("parses the block leniently; absent means available", () => {
    expect(parseCommentsConfig(undefined)).toBeUndefined();
    expect(parseCommentsConfig({ available: "no", rateLimit: { limit: 0 }, extra: 1 })).toEqual({
      rateLimit: {},
    });
    expect(parseCommentsConfig({ available: false })).toEqual({ available: false });
    expect(commentsAvailable({})).toBe(true);
    expect(commentsAvailable({ comments: {} })).toBe(true);
    expect(commentsAvailable({ comments: { available: false } })).toBe(false);
    expect(commentsRateLimitDeployment({}, "newsroom")).toEqual({});
    expect(commentsRateLimitDeployment({ comments: { rateLimit: true } }, "newsroom")).toEqual({
      rateLimit: { namespaceId: rateLimitNamespaceId("newsroom", "comments"), limit: 10 },
    });
    expect(
      commentsRateLimitDeployment(
        { comments: { rateLimit: { namespaceId: "4243", limit: 5 } } },
        "newsroom",
      ),
    ).toEqual({ rateLimit: { namespaceId: "4243", limit: 5 } });
  });

  it("site and admin Worker configs: the binding, the switch and the shared hourly trigger", () => {
    const names = { name: "newsroom" };
    const on = { available: true, cron: true };
    const site = siteWorkerConfig({
      ...names,
      siteId: "site_abcdefgh",
      siteHosts: ["news.example.com"],
      comments: { ...on, rateLimit: { namespaceId: "4243", limit: 10 } },
    });
    expect(site.ratelimits).toEqual([
      { name: "COMMENTS_RL", namespace_id: "4243", simple: { limit: 10, period: 60 } },
    ]);
    expect(site.vars).toEqual({
      CLOUDHAL_SITE_ID: "site_abcdefgh",
      CLOUDHAL_SITE_HOSTS: "news.example.com",
    });
    // unavailable: no binding, no hosts (nothing reads them)
    const off = siteWorkerConfig({
      ...names,
      siteId: "site_abcdefgh",
      siteHosts: ["news.example.com"],
      comments: { available: false, cron: false, rateLimit: { namespaceId: "4243", limit: 10 } },
    });
    expect(off).not.toHaveProperty("ratelimits");
    expect(off.vars).toEqual({ CLOUDHAL_SITE_ID: "site_abcdefgh" });

    const admin = { ...names, studioDir: "studio", main: "./worker.ts" };
    expect(adminWorkerConfig({ ...admin, comments: on })).toMatchObject({
      vars: { CLOUDHAL_COMMENTS_AVAILABLE: "true" },
      triggers: { crons: [HOURLY_CRON] },
    });
    expect(
      adminWorkerConfig({ ...admin, comments: { available: true, cron: false } }),
    ).toMatchObject({
      vars: { CLOUDHAL_COMMENTS_AVAILABLE: "true", CLOUDHAL_COMMENTS_CRON: "off" },
      triggers: { crons: [] },
    });
    expect(
      adminWorkerConfig({ ...admin, comments: { available: false, cron: false } }),
    ).toMatchObject({ vars: { CLOUDHAL_COMMENTS_AVAILABLE: "false" }, triggers: { crons: [] } });
    // with analytics on and comments off, the trigger stays for analytics
    const analytics = { dataset: "newsroom_events", defaults: {}, budget: 8000, cron: true };
    expect(
      adminWorkerConfig({ ...admin, analytics, comments: { available: false, cron: false } })
        .triggers,
    ).toEqual({ crons: [HOURLY_CRON] });
  });
});

describe("cloudhal comments", () => {
  const NOW = new Date("2026-10-12T12:00:00.000Z");
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let entry: ContentEntry;
  const ids: string[] = [];

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-comments-cli-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Discussed" })).siteId;
    await snapshot({ projectDir, publish: true });
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    try {
      entry = (await local.store.listContentEntries(siteId))[0] as ContentEntry;
      const store = new SqlCommentStore(local.sql, { now: () => NOW });
      await store.putSettings(
        siteId,
        { enabled: true, collections: { posts: { enabled: true } } },
        0,
        "user_setup000001",
      );
      // the project's own key, as `cloudhal dev` would have created it
      const secret = "local-comments-key-for-tests-0123456789";
      await writeFile(path.join(local.dataDir, "comments.key"), `${secret}\n`, { mode: 0o600 });
      const keys = await deriveCommentKeys(secret);
      for (const [i, text] of [
        "First!",
        "A question about ferries",
        "Old and forgotten",
      ].entries()) {
        const id = newCommentsId(ID_PREFIX.comment);
        ids.push(id);
        await store.submit(siteId, {
          id,
          nodeId: entry.id,
          name: "Mehmet",
          text,
          status: "pending",
          labels: [],
          ipHmac: "f".repeat(32),
          challengeId: null,
          proof: "pow",
          createdAt: new Date(NOW.getTime() - (i === 2 ? 40 * 86_400_000 : i * 1000)).toISOString(),
          ...(i === 0
            ? {
                email: {
                  id: newCommentsId(ID_PREFIX.commenter),
                  hmac: await emailHmac(keys, "mehmet@example.com"),
                  ...(await sealEmail(keys, siteId, "mehmet@example.com")),
                },
              }
            : {}),
        });
      }
      await store.moderate(siteId, {
        ids: [ids[0] as string],
        action: "approve",
        actor: { kind: "human", id: "user_editor000001", name: "Ayşe" },
        expectedRevs: { [ids[0] as string]: 1 },
      });
    } finally {
      await local.close();
    }
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("status, export and an idempotent import on the project's SQLite", async () => {
    const s = await commentsStatusCli({ projectDir, now: () => NOW });
    expect(s).toMatchObject({
      siteId,
      available: true,
      key: true,
      where: "local",
      settings: { enabled: true, collections: ["posts"], protection: "pow" },
      counts: { approved: 1, pending: 2 },
      pending: { count: 2 },
    });
    const text = describeCommentsStatus(s).join("\n");
    expect(text).toMatch(/comments: available for this project/);
    expect(text).toMatch(/1 approved · 2 pending/);
    expect(text).not.toContain("ferries");

    // without personal data: nothing private; with it: owner-only file
    const plain = await commentsExportCli({ projectDir });
    expect(plain.comments).toBe(3);
    expect(plain.text).not.toContain("mehmet@example.com");
    await expect(
      commentsExportCli({ projectDir, personal: true, out: "c.jsonl", remote: false }),
    ).resolves.toMatchObject({ comments: 3, commenters: 1 });
    const file = path.join(projectDir, "c.jsonl");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toContain("mehmet@example.com");

    // moving: the rows go, the file brings them back (the reply order does not matter)
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await local.sql.batch([
      { sql: "DELETE FROM comments WHERE site_id = ?", params: [siteId] },
      { sql: "DELETE FROM commenter_emails WHERE site_id = ?", params: [siteId] },
    ]);
    await local.close();
    const first = await commentsImportCli({ projectDir, file: "c.jsonl" });
    expect(first).toEqual({ imported: 3, skipped: 0, commenters: 1, invalid: [] });
    const again = await commentsImportCli({ projectDir, file: "c.jsonl" });
    expect(again).toEqual({ imported: 0, skipped: 3, commenters: 1, invalid: [] });
    await writeFile(path.join(projectDir, "not.jsonl"), '{"hello":1}\n');
    await expect(commentsImportCli({ projectDir, file: "not.jsonl" })).rejects.toThrow(
      /not a Cloudhal comments export/,
    );
  });

  it("--remote over the deployment token: export from one store, import into another (another key)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const deployDir = path.join(projectDir, cfg.dataDir, "deploy");
    await mkdir(deployDir, { recursive: true });
    const secrets = await loadOrCreateSecrets(deployDir);
    await writeFile(
      path.join(deployDir, "state.json"),
      JSON.stringify({ name: "discussed", adminUrl: "https://discussed-admin.acme.workers.dev" }),
    );
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    const remoteComments = new SqlCommentStore(sql);
    const remoteKeys = await deriveCommentKeys(secrets.CLOUDHAL_COMMENTS_KEY);
    const app = createApi({
      store: remote,
      admin: { deployToken: secrets.CLOUDHAL_DEPLOY_TOKEN, storage: { sql, blobs } },
      comments: { store: remoteComments, keys: remoteKeys },
    });
    const f = (async (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;
    await pushSite({ projectDir, fetch: f });

    const empty = await commentsStatusCli({ projectDir, remote: true, fetch: f });
    expect(empty).toMatchObject({
      where: "remote",
      key: true,
      counts: { approved: 0, pending: 0 },
    });

    const lines: string[] = [];
    const imported = await commentsImportCli({
      projectDir,
      remote: true,
      fetch: f,
      file: "c.jsonl",
      log: (l) => lines.push(l),
    });
    expect(imported).toEqual({ imported: 3, skipped: 0, commenters: 1, invalid: [] });
    expect(lines.at(-1)).toBe("imported 3, already there 0");
    const status = await commentsStatusCli({ projectDir, remote: true, fetch: f });
    expect(status.counts).toMatchObject({ approved: 1, pending: 2 });
    // the email moved, encrypted under the deployment's own key
    const who = await remoteComments.findCommenter(siteId, { commentId: ids[0] as string });
    expect(who && (await remoteComments.commenter(siteId, who, remoteKeys))?.email).toBe(
      "mehmet@example.com",
    );
    const back = await commentsExportCli({ projectDir, remote: true, fetch: f, personal: true });
    expect(back).toMatchObject({ comments: 3, commenters: 1 });
    const local = (await readFile(path.join(projectDir, "c.jsonl"), "utf8")).trim().split("\n");
    const remoteLines = back.text.trim().split("\n");
    // the same records (the header's time and the commenter id differ)
    expect(remoteLines.slice(1, 4)).toEqual(local.slice(1, 4));
    expect(
      (await commentsImportCli({ projectDir, remote: true, fetch: f, file: "c.jsonl" })).skipped,
    ).toBe(3);
  });

  it("the local hourly job applies retention and empties the purge queue (no edge cache)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    try {
      const store = new SqlCommentStore(local.sql);
      await store.purgeQueue.enqueue(siteId, [`cloudhal-comments-${entry.id}`], "takedown");
      const r = await runLocalCommentsJob(local.store, store, new Date());
      expect(r.sites).toBe(1);
      expect(r.drained).toBe(1);
      // the 40-day-old pending comment is past the 30-day default
      expect(await store.get(siteId, ids[2] as string)).toBeNull();
      expect(await store.get(siteId, ids[0] as string)).not.toBeNull();
      expect(await store.purgeQueue.queued(siteId)).toEqual([]);
    } finally {
      await local.close();
    }
  });
});
