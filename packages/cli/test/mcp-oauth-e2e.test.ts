/**
 * RFC-0044 §8 "End-to-end" (Phase 3b): a remote MCP client connects to `cloudhal studio` by URL,
 * the way Claude, Cursor or the MCP Inspector do, through the official TypeScript SDK's `auth()`:
 *
 * 1. discovery: the 401 challenge on `/mcp`, the protected resource metadata, the authorization
 *    server metadata (RFC 9728, RFC 8414);
 * 2. registration: dynamic client registration (RFC 7591; a metadata document would need a public
 *    HTTPS host, which the registration suite in `@cloudhal/api` stubs instead);
 * 3. authorization with PKCE S256; the member's browser part (sign-in cookie, Studio's consent
 *    screen) driven through Studio's own consent API;
 * 4. the code exchange, then `tools/call` with the access token;
 * 5. Disconnect (Studio's revoke): the next call is refused.
 *
 * `cloudhal studio` runs in-process on a fixed loopback port with `--base-url`, the issuer and
 * resource every token is bound to (§10).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  auth,
  Client,
  type OAuthClientInformationMixed,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StudioHandle, studio } from "../src/index.ts";

const OWNER = {
  name: "Olive Owner",
  email: "owner@example.test",
  password: "correct horse battery",
};
/** Where the client would listen for the redirect (never called: the test reads the URL). */
const REDIRECT = "http://127.0.0.1:43123/callback";

/** A free loopback port, so `--base-url` can name it before Studio listens. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** An `OAuthClientProvider` that keeps everything in memory and records where it was sent. */
class MemoryProvider implements OAuthClientProvider {
  client: OAuthClientInformationMixed | undefined;
  saved: OAuthTokens | undefined;
  verifier = "";
  sentTo: URL | undefined;
  get redirectUrl() {
    return REDIRECT;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "E2E Agent",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state() {
    return "e2e-state";
  }
  clientInformation() {
    return this.client;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.client = info;
  }
  tokens() {
    return this.saved;
  }
  saveTokens(tokens: OAuthTokens) {
    this.saved = tokens;
  }
  redirectToAuthorization(url: URL) {
    this.sentTo = url;
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    return this.verifier;
  }
}

const cookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0] as string)
    .filter((c) => c.startsWith("better-auth.session_token="))
    .join("; ");

describe("remote MCP client by URL (RFC-0044 §8 e2e)", () => {
  let s: StudioHandle;
  let base: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-oauth-e2e-"));
    const port = await freePort();
    base = `http://localhost:${port}`;
    s = await studio({
      projectDir,
      port,
      baseUrl: base,
      initIfEmpty: true,
      name: "E2E Site",
      scheduler: false,
      env: {},
    });
  });
  afterAll(async () => {
    await s?.stop();
    await rm(projectDir, { recursive: true, force: true });
  });

  it("discovers, registers, authorizes with PKCE and consent, calls a tool, and stops at revoke", async () => {
    // The member: the first account, made with the setup link's token.
    const token = new URLSearchParams(new URL(s.setup?.url ?? base).hash.slice(1)).get("setup");
    const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cloudhal-setup-token": token ?? "" },
      body: JSON.stringify(OWNER),
    });
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    const cookie = cookieOf(signUp);

    // 1–3. Discovery, DCR and the authorization request, as the SDK runs them.
    const provider = new MemoryProvider();
    const serverUrl = `${base}/mcp`;
    expect(await auth(provider, { serverUrl })).toBe("REDIRECT");
    expect(provider.client?.client_id).toBeTruthy();
    const sentTo = provider.sentTo as URL;
    expect(sentTo.origin + sentTo.pathname).toBe(`${base}/api/auth/oauth2/authorize`);
    expect(sentTo.searchParams.get("code_challenge_method")).toBe("S256");
    expect(sentTo.searchParams.get("resource")).toBe(serverUrl);

    // The member's browser: signed in, sent to Studio's consent screen, approves.
    // Better Auth answers a fetch with `{redirect, url}` and a navigation with a 302: both name
    // the page the browser goes to next.
    const start = await fetch(sentTo, { headers: { cookie }, redirect: "manual" });
    const next =
      start.headers.get("location") ??
      ((await start.json().catch(() => ({}))) as { url?: string }).url ??
      "";
    const consentAt = new URL(next, base);
    expect(consentAt.pathname).toBe("/oauth/consent");
    const request = consentAt.search.slice(1);
    const info = await fetch(
      `${base}/api/agent-grants/consent?request=${encodeURIComponent(request)}`,
      { headers: { cookie } },
    );
    const screen = (await info.json()) as {
      client: { name: string; kind: string };
      scopes: { requested: string; granted: string | null }[];
    };
    expect(screen.client).toMatchObject({ name: "E2E Agent", kind: "self-registered" });
    const approve = await fetch(`${base}/api/agent-grants/consent`, {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        request,
        accept: true,
        scopes: screen.scopes.filter((x) => x.granted).map((x) => x.requested),
        mode: "edits",
      }),
    });
    expect(approve.status, await approve.clone().text()).toBe(200);
    const back = new URL(((await approve.json()) as { redirect: string }).redirect);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("e2e-state");

    // 4. The code exchange (with the RFC 9207 `iss` check), then a tool call with the token.
    const result = await auth(provider, {
      serverUrl,
      authorizationCode: back.searchParams.get("code") ?? "",
      iss: back.searchParams.get("iss") ?? "",
    });
    expect(result).toBe("AUTHORIZED");
    expect(provider.saved?.access_token).toBeTruthy();
    const client = new Client({ name: "e2e-agent", version: "1.0.0" }, { capabilities: {} });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider: provider }),
    );
    const sites = await client.callTool({ name: "list_sites", arguments: {} });
    expect(sites.isError ?? false, JSON.stringify(sites)).toBe(false);
    expect(JSON.stringify(sites.content)).toContain("E2E Site");
    await client.close();

    // The connection is listed under the member, then disconnected (Studio's revoke).
    const listed = (await (
      await fetch(`${base}/api/agent-grants`, { headers: { cookie } })
    ).json()) as {
      id: string;
      clientName: string;
      client: { kind: string };
    }[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      clientName: "E2E Agent",
      client: { kind: "self-registered" },
    });
    const revoked = await fetch(`${base}/api/agent-grants/${listed[0]?.id}`, {
      method: "DELETE",
      headers: { cookie, origin: base },
    });
    expect(revoked.status).toBe(204);

    // 5. The access token is refused at once, and the client is asked to authorize again.
    const after = await fetch(serverUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.saved?.access_token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(after.status).toBe(401);
    expect(after.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});
