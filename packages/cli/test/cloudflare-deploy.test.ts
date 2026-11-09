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
import { D1Driver } from "@cloudhal/storage/d1";
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

/** Reads a server-sent events response one JSON payload at a time. */
function serverSentEvents(res: Response) {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(): Promise<Record<string, unknown>> {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (data) return JSON.parse(data) as Record<string, unknown>;
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buffer += decoder.decode(value, { stream: true });
      }
    },
    close: () => reader.cancel(),
  };
}

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
    // site row not pushed yet: `unavailable` (RFC-0043 §1.2), not the runtime's default error
    const missing = await siteFetch("/");
    expect(missing.status).toBe(503);
    expect(missing.headers.get("x-cloudhal-state")).toBe("unavailable");
    expect(missing.headers.get("retry-after")).toBe("300");
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("pushes the local project, then an agent publishes through MCP with human approval", async () => {
    // cloudhal push
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const bundle = await exportSite(local, siteId);
    const newsId = (await local.store.getTermBySlug(siteId, "category", "news"))?.id as string;
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
    // pushed, never published: the not-published page (RFC-0043 §1.2)
    const unpublished = await siteFetch("/");
    expect(unpublished.status).toBe(503);
    expect(unpublished.headers.get("x-cloudhal-state")).toBe("not-published");

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

    // RFC-0020 §6: Studio's Build view follows the agent's patch through the page's build room
    // (a Durable Object), not through the isolate's memory.
    const pages = (await (
      await adminFetch(`/api/sites/${siteId}/pages`, { headers: { cookie } })
    ).json()) as { id: string; path: string; rev: number }[];
    const about = pages.find((p) => p.path === "/about") as (typeof pages)[number];
    const stream = await within(
      adminFetch(`/api/sites/${siteId}/pages/${about.id}/build/events`, { headers: { cookie } }),
    );
    expect(stream.status).toBe(200);
    const events = serverSentEvents(stream);
    expect((await within(events.next())).type).toBe("STATE_SNAPSHOT");
    const patched = await client.callTool({
      name: "patch_draft",
      arguments: {
        siteId,
        pageId: about.id,
        rev: about.rev,
        ops: [{ op: "replace", path: "/title", value: "About the edge" }],
      },
    });
    expect(patched.isError, JSON.stringify(patched.content)).toBeFalsy();
    expect(await within(events.next())).toMatchObject({
      type: "STATE_DELTA",
      title: "About the edge",
      tool: "patch_draft",
      actor: { kind: "agent", name: "newsroom-agent" },
    });
    await events.close();

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
    const { entry: draft } = created.structuredContent as { entry: { id: string; rev: number } };
    // A published entry needs a primary category (RFC-0002 invariant 2). Until the MCP tools take
    // `terms`, the owner files the draft under the seeded "News" category in Studio (REST).
    const filed = await adminFetch(`/api/sites/${siteId}/entries/${draft.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json", ...browser },
      body: JSON.stringify({ ...draft, terms: { category: { ids: [newsId], primary: newsId } } }),
    });
    expect(filed.status, await filed.clone().text()).toBe(200);
    const entry = (await filed.json()) as { id: string; rev: number };
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

    // RFC-0005 on workerd: the owner invites a Contributor; the link's token travels in the
    // fragment and in a POST body; accepting creates the account (sign-up stays closed).
    const invite = await adminFetch("/api/invites", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...browser },
      body: JSON.stringify({ email: "writer@example.com", role: "contributor" }),
    });
    expect(invite.status, await invite.clone().text()).toBe(201);
    const { url } = (await invite.json()) as { url: string };
    expect(url).toMatch(/^https:\/\/admin\.example\/invite#chinv_[A-Za-z0-9_-]{43}$/);
    const token = url.split("#")[1] as string;
    const accepted = await adminFetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json", ...browser },
      body: JSON.stringify({
        token,
        name: "Wren Writer",
        password: "correct horse battery staple",
      }),
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    const writer = (accepted.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const me = (await (await adminFetch("/api/me", { headers: { cookie: writer } })).json()) as {
      role: string;
    };
    expect(me.role).toBe("contributor");
    // a Contributor writes drafts but cannot publish or change pages
    const publish = await adminFetch(`/api/sites/${siteId}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: writer, ...browser },
      body: JSON.stringify({ publish: true }),
    });
    expect(publish.status).toBe(403);
    const replay = await adminFetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json", ...browser },
      body: JSON.stringify({ token, name: "Again", password: "correct horse battery staple" }),
    });
    expect(replay.status).toBe(410);
  });
  it("connects a remote MCP client with OAuth on workerd: Ed25519 JWT, D1, consent (RFC-0044 Phase 2)", async () => {
    const browser = { origin: "https://admin.example" };
    const signIn = await adminFetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...browser },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] as string;
    // Discovery: the 401 names the metadata, which names this deployment's issuer.
    const first = await adminFetch("/mcp", { method: "POST" });
    expect(first.status).toBe(401);
    expect(first.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://admin.example/.well-known/oauth-protected-resource/mcp"',
    );
    const meta = (await (
      await adminFetch("/.well-known/oauth-authorization-server/api/auth")
    ).json()) as Record<string, unknown>;
    expect(meta.issuer).toBe("https://admin.example/api/auth");
    // A pre-registered public client (registration is Phase 3), written as the provider stores it.
    const env = (await harness.getWorker(W.admin).getEnv()) as { DB: D1Database };
    const db = new D1Driver(env.DB);
    const now = new Date().toISOString();
    const redirect = "http://127.0.0.1:41000/callback";
    await db.batch([
      {
        sql: `INSERT INTO "oauthClient" ("id", "clientId", "disabled", "scopes", "createdAt", "updatedAt", "name", "redirectUris", "tokenEndpointAuthMethod", "applicationType", "grantTypes", "responseTypes") VALUES ('wclient', 'workerd-client', 0, '["site:read","content:read","offline_access"]', ?, ?, 'Workerd Agent', ?, 'none', 'native', '["authorization_code","refresh_token"]', '["code"]')`,
        params: [now, now, JSON.stringify([redirect])],
      },
      {
        sql: `INSERT INTO "oauthClientResource" ("id", "clientId", "resourceId", "createdAt") VALUES ('wlink', 'workerd-client', 'https://admin.example/mcp', ?)`,
        params: [now],
      },
    ]);
    const verifier = "workerd-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "workerd-client",
      redirect_uri: redirect,
      scope: "site:read content:read",
      state: "w",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://admin.example/mcp",
    });
    const start = await adminFetch(`/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie },
      redirect: "manual",
    });
    // A navigation gets a 302; a fetch without `Accept: text/html` the same URL as JSON.
    const next = start.headers.get("location") ?? ((await start.json()) as { url: string }).url;
    const consentPage = new URL(next, "https://admin.example");
    expect(consentPage.pathname).toBe("/oauth/consent");
    const approved = await adminFetch("/api/agent-grants/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...browser },
      body: JSON.stringify({
        request: consentPage.search.slice(1),
        accept: true,
        scopes: ["site:read", "content:read"],
        mode: "plan",
      }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const code = new URL(
      ((await approved.json()) as { redirect: string }).redirect,
    ).searchParams.get("code");
    const tokenRes = await adminFetch("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: redirect,
        client_id: "workerd-client",
        code_verifier: verifier,
        resource: "https://admin.example/mcp",
      }).toString(),
    });
    expect(tokenRes.status, await tokenRes.clone().text()).toBe(200);
    const { access_token: access } = (await tokenRes.json()) as { access_token: string };
    const header = JSON.parse(
      atob((access.split(".")[0] as string).replaceAll("-", "+").replaceAll("_", "/")),
    ) as Record<string, unknown>;
    expect(header).toMatchObject({ alg: "EdDSA", typ: "at+jwt" });
    const agent = new Client(
      { name: "oauth-agent", version: "1.0.0" },
      { capabilities: {}, versionNegotiation: { mode: "auto" } },
    );
    await agent.connect(
      new StreamableHTTPClientTransport(new URL("https://admin.example/mcp"), {
        requestInit: { headers: { authorization: `Bearer ${access}` } },
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
    const mode = await agent.callTool({ name: "get_mode", arguments: {} });
    expect(JSON.stringify(mode.content)).toContain("plan");
    await agent.close();
  });
});
