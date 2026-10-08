/**
 * Sprint 6 exit criterion on workerd: admin Worker (API + Better Auth on D1 + MCP) and site Worker
 * share D1/R2. The local project is pushed through the admin API; an agent with an API key writes
 * an article over MCP and asks to publish; the human approves; the site serves it right away
 * because publishing purges the site Worker's cache through the service binding.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { prepareAdminWorker } from "../src/cloudflare/admin.ts";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import {
  siteConfigPath,
  siteWorkerConfig,
  workerNames,
  writeWranglerConfig,
} from "../src/cloudflare/config.ts";
import { init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const SKILLS = path.resolve(here, "../../../skills/official");
const names = { name: "e2e", databaseId: "00000000-0000-0000-0000-0000000e2e01" };
const secrets = {
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-0123456789abcdef",
  MCP_STATE_KEY: "e2e-mcp-state-key-0123456789abcdefghij",
  CLOUDHAL_PREVIEW_SECRET: "e2e-preview-secret-0123456789abcdefghi",
  CLOUDHAL_PURGE_TOKEN: "e2e-purge-token-0123456789abcdefghijkl",
  CLOUDHAL_DEPLOY_TOKEN: "e2e-deploy-token-0123456789abcdefghijk",
};

describe("Cloudflare deployment (admin + site Workers)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  const W = workerNames(names);

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-deploy-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Deployed Newsroom" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({ ...names, siteId }),
      "test",
    );
    const siteConfig = await buildSiteWorker(projectDir);
    const studioDir = path.join(tmp, "studio");
    await mkdir(studioDir);
    await writeFile(
      path.join(studioDir, "index.html"),
      "<!doctype html><title>Studio</title><div id=root></div>",
    );
    const cfg = await readProjectConfig(projectDir);
    const admin = await prepareAdminWorker({
      projectDir,
      dataDir: cfg.dataDir,
      names,
      studioDir,
      skillsDir: SKILLS,
    });

    harness = createTestHarness({
      root: projectDir,
      workers: [
        { configPath: admin.configPath, secrets },
        {
          configPath: siteConfig,
          secrets: {
            CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
            CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
          },
        },
      ],
    });
    await harness.listen();
  });

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const adminFetch = (p: string, init?: RequestInit) =>
    harness
      .getWorker(W.admin)
      .fetch(`https://admin.example${p}`, init as never) as unknown as Promise<Response>;
  const siteFetch = (p: string) =>
    harness.getWorker(W.site).fetch(`https://news.example${p}`) as unknown as Promise<Response>;

  it("serves the Studio shell and answers 503 before anything is published", async () => {
    const studio = await adminFetch("/sites/whatever");
    expect(await studio.text()).toContain("<title>Studio</title>");
    // a missing build file is a real 404 (never the SPA shell under a script URL)
    expect((await adminFetch("/assets/Old-abc123.js")).status).toBe(404);
    expect((await adminFetch("/api/health")).status).toBe(200);
    expect((await siteFetch("/")).status).toBe(500); // site row not pushed yet
  });

  it("pushes the local project, then an agent publishes through MCP with human approval", async () => {
    // cloudhal push
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const bundle = await exportSite(local, siteId);
    await local.close();
    const pushed = await adminFetch(`/api/admin/sites/${siteId}/bundle`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${secrets.CLOUDHAL_DEPLOY_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(bundle),
    });
    expect(pushed.status, await pushed.clone().text()).toBe(200);
    expect((await siteFetch("/")).status).toBe(503); // pushed, never published

    // the owner signs up and mints an agent key
    const browser = { origin: "https://admin.example" };
    const signUp = await adminFetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...browser },
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    });
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    const cookie = (signUp.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const keyRes = await adminFetch("/api/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...browser },
      body: JSON.stringify({
        name: "newsroom-agent",
        scopes: ["site:read", "content:read", "content:write", "preview:create", "site:publish"],
      }),
    });
    expect(keyRes.status, await keyRes.clone().text()).toBe(201);
    const { key } = (await keyRes.json()) as { key: string };

    // Regression: listing keys used to leave the cached auth instance tied to that request, and
    // every later request in the isolate hung (Studio showed an endless loading screen).
    const within = <T>(p: Promise<T>, ms = 5000) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`no response within ${ms}ms`)), ms),
        ),
      ]);
    for (let i = 0; i < 2; i++) {
      expect((await within(adminFetch("/api/agent-keys", { headers: { cookie } }))).status).toBe(
        200,
      );
      expect(
        (await within(adminFetch(`/api/sites/${siteId}`, { headers: { cookie } }))).status,
      ).toBe(200);
      expect(
        (await within(adminFetch(`/api/sites/${siteId}/snapshots`, { headers: { cookie } })))
          .status,
      ).toBe(200);
    }

    // the agent connects over MCP
    const prompts: string[] = [];
    const client = new Client(
      { name: "agent", version: "1.0.0" },
      { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: "auto" } },
    );
    client.setRequestHandler("elicitation/create", async (req) => {
      prompts.push(req.params.message);
      return { action: "accept", content: { confirm: true } };
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://admin.example/mcp"), {
        requestInit: { headers: { "x-api-key": key } },
        // Hand the harness plain values (it crosses into workerd).
        fetch: async (input, init) => {
          const req = new Request(input, init as RequestInit);
          return adminFetch(new URL(req.url).pathname, {
            method: req.method,
            headers: Object.fromEntries(req.headers),
            ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: await req.text() }),
          });
        },
      }),
    );
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("skill://publish-article/SKILL.md");

    const created = await client.callTool({
      name: "create_entry",
      arguments: {
        siteId,
        slug: "edge-news",
        title: "News from the edge",
        summary: "s",
        body: "# Edge\n\nPublished by an agent.",
      },
    });
    expect(created.isError, JSON.stringify(created.content)).toBeFalsy();
    const { entry } = created.structuredContent as { entry: { id: string; rev: number } };
    const ready = await client.callTool({
      name: "update_entry",
      arguments: { siteId, entryId: entry.id, rev: entry.rev, status: "published" },
    });
    expect(ready.isError, JSON.stringify(ready.content)).toBeFalsy();

    // An agent cannot approve its own publish: the request waits for a person in Studio.
    const ask = await client.callTool({ name: "publish", arguments: { siteId, label: "edge" } });
    expect(ask.isError).toBe(true);
    const askText = (ask.content[0] as { text: string }).text;
    expect(askText).toMatch(/^approval pending: Publish "Deployed Newsroom" to production/);
    expect(prompts).toHaveLength(0); // the agent's own client is never asked
    const approvalId = askText.match(/approvalId: (appr_\w+)/)?.[1] as string;
    const pendingList = (await (
      await adminFetch(`/api/sites/${siteId}/approvals?status=pending`, { headers: { cookie } })
    ).json()) as { items: { id: string }[] };
    expect(pendingList.items.map((a) => a.id)).toEqual([approvalId]);
    // the agent key cannot approve it either (agents are refused on the REST API)
    const selfApprove = await adminFetch(`/api/sites/${siteId}/approvals/${approvalId}/approve`, {
      method: "POST",
      headers: { "x-api-key": key, ...browser },
    });
    expect(selfApprove.status).toBe(403);
    const approve = await adminFetch(`/api/sites/${siteId}/approvals/${approvalId}/approve`, {
      method: "POST",
      headers: { cookie, ...browser },
    });
    expect(approve.status, await approve.clone().text()).toBe(200);
    const published = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "edge", approvalId },
    });
    expect(published.isError, JSON.stringify(published.content)).toBeFalsy();
    await client.close();

    // the site serves it immediately
    const article = await siteFetch("/posts/edge-news");
    expect(article.status).toBe(200);
    expect(await article.text()).toContain("<h1>Edge</h1>");
    const home = await siteFetch("/");
    expect(home.headers.get("x-cloudhal-snapshot")).toBe(
      (published.structuredContent as { snapshot: { id: string } }).snapshot.id,
    );

    // and the owner sees what the agent did
    const activity = (await (
      await adminFetch(`/api/sites/${siteId}/activity`, { headers: { cookie } })
    ).json()) as {
      items: { tool: string; actor: { kind: string; name?: string }; decision: string }[];
    };
    expect(activity.items.map((a) => `${a.actor.kind}:${a.tool}:${a.decision}`)).toEqual(
      expect.arrayContaining([
        "agent:publish:allow",
        "agent:publish:approval-required",
        "agent:create_entry:allow",
        "human:publish:allow",
      ]),
    );
    expect(activity.items.find((a) => a.tool === "create_entry")?.actor.name).toBe(
      "newsroom-agent",
    );
  });
});
