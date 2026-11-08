/**
 * `cloudhal studio` where it does not run on the author's machine (self-hosting, #143, #165):
 * `--host`, `--base-url`, `--behind-proxy` and `--init-if-empty`, their environment variables, what
 * they change for Better Auth behind an https reverse proxy, the setup token the first account
 * needs, where `--no-auth` is refused, and a first-run scaffold that survives being stopped.
 */

import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillOptionalValues } from "../src/cli.ts";
import { init } from "../src/commands/init.ts";
import {
  assertNoAuthLocal,
  describeSetup,
  isLoopbackHost,
  noBaseUrlWarning,
  resolveSetupToken,
} from "../src/commands/studio-auth.ts";
import {
  INIT_STAGING_DIR,
  initIfEmpty,
  parseBaseUrl,
  resolveStudioInit,
  resolveStudioServer,
  studioAuthOrigins,
  studioUrl,
} from "../src/commands/studio-options.ts";
import { type StudioHandle, studio } from "../src/index.ts";

const JSON_BODY = { "content-type": "application/json" };
const OWNER = {
  name: "Olive Owner",
  email: "owner@example.test",
  password: "correct horse battery",
};

/** The token in a running Studio's setup link (`/login#setup=<token>`). */
function setupTokenOf(s: StudioHandle): string {
  if (!s.setup) throw new Error("no setup link");
  return new URLSearchParams(new URL(s.setup.url).hash.slice(1)).get("setup") as string;
}

function signUp(base: string, headers: Record<string, string>) {
  return fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { ...JSON_BODY, ...headers },
    body: JSON.stringify(OWNER),
  });
}

/**
 * A sign-up sent to 127.0.0.1 with the `Host` a browser would send for another name (`fetch`
 * cannot set `Host`): how a LAN address, or a DNS name rebound to this machine, reaches Studio.
 */
function signUpAs(
  port: number,
  host: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(OWNER);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/api/auth/sign-up/email",
        headers: { ...JSON_BODY, ...headers, host, "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("studio server options", () => {
  it("flags win over the environment, which fills what they leave out", () => {
    const env = {
      CLOUDHAL_HOST: "0.0.0.0",
      CLOUDHAL_BASE_URL: "https://env.example/",
      CLOUDHAL_BEHIND_PROXY: "true",
    };
    expect(resolveStudioServer({}, env)).toEqual({
      port: 8787,
      hostname: "0.0.0.0",
      baseUrl: "https://env.example",
      behindProxy: true,
    });
    expect(
      resolveStudioServer(
        { port: 9000, host: "10.0.0.5", baseUrl: "http://flag.example:9000", behindProxy: false },
        env,
      ),
    ).toEqual({
      port: 9000,
      hostname: "10.0.0.5",
      baseUrl: "http://flag.example:9000",
      behindProxy: false,
    });
    expect(resolveStudioServer({}, { CLOUDHAL_HOST: " ", CLOUDHAL_BEHIND_PROXY: "0" })).toEqual({
      port: 8787,
      hostname: undefined,
      baseUrl: undefined,
      behindProxy: false,
    });
  });

  it("takes an origin for --base-url and refuses anything else", () => {
    expect(parseBaseUrl(" https://studio.example.com/ ")).toBe("https://studio.example.com");
    expect(parseBaseUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(() => parseBaseUrl("studio.example.com")).toThrow(/absolute URL/);
    expect(() => parseBaseUrl("ftp://studio.example.com")).toThrow(/http or https/);
    expect(() => parseBaseUrl("https://studio.example.com/studio")).toThrow(/origin only/);
    expect(() => parseBaseUrl("https://studio.example.com/?x=1")).toThrow(/origin only/);
  });

  it("prints the public origin, else this machine", () => {
    const base = { port: 8787, behindProxy: false };
    expect(studioUrl({ ...base, hostname: undefined, baseUrl: undefined }, 8787)).toBe(
      "http://localhost:8787/",
    );
    expect(studioUrl({ ...base, hostname: "0.0.0.0", baseUrl: undefined }, 1234)).toBe(
      "http://localhost:1234/",
    );
    expect(studioUrl({ ...base, hostname: "10.0.0.5", baseUrl: undefined }, 8787)).toBe(
      "http://10.0.0.5:8787/",
    );
    expect(studioUrl({ ...base, hostname: "fe80::1", baseUrl: undefined }, 8787)).toBe(
      "http://[fe80::1]:8787/",
    );
    expect(
      studioUrl({ ...base, hostname: "0.0.0.0", baseUrl: "https://studio.example.com" }, 8787),
    ).toBe("https://studio.example.com/");
  });

  it("gives Better Auth the public origin, or each request's own when there is none", () => {
    const local = studioAuthOrigins(
      { port: 8787, hostname: undefined, baseUrl: undefined, behindProxy: false },
      {},
    );
    expect(local).toEqual({
      baseURL: "http://localhost:8787",
      trustedOrigins: ["http://localhost:5173"],
      trustRequestOrigin: "loopback",
    });
    expect(
      studioAuthOrigins(
        { port: 8787, hostname: "0.0.0.0", baseUrl: undefined, behindProxy: false },
        {},
      ).trustRequestOrigin,
    ).toBe("any");
    const hosted = studioAuthOrigins(
      { port: 8787, hostname: "0.0.0.0", baseUrl: "https://studio.example.com", behindProxy: true },
      { CLOUDHAL_TRUSTED_ORIGINS: "https://other.example, https://studio.example.com" },
    );
    expect(hosted).toEqual({
      baseURL: "https://studio.example.com",
      trustedOrigins: [
        "http://localhost:5173",
        "https://studio.example.com",
        "https://other.example",
      ],
      trustRequestOrigin: false,
    });
  });

  it("scaffolds on --init-if-empty or CLOUDHAL_INIT, with the starter and name given", () => {
    expect(resolveStudioInit({}, {})).toBeUndefined();
    expect(resolveStudioInit({ starter: "blog" }, {})).toBeUndefined();
    expect(resolveStudioInit({ initIfEmpty: true }, {})).toEqual({
      starter: "blog",
      name: undefined,
    });
    expect(resolveStudioInit({}, { CLOUDHAL_INIT: "blog", CLOUDHAL_SITE_NAME: "Notes" })).toEqual({
      starter: "blog",
      name: "Notes",
    });
    expect(
      resolveStudioInit(
        { initIfEmpty: true, starter: "docs", name: "Flag" },
        { CLOUDHAL_INIT: "blog" },
      ),
    ).toEqual({ starter: "docs", name: "Flag" });
  });

  it("fills a bare --host (every IPv4 address) so parseArgs sees a value", () => {
    expect(fillOptionalValues(["dev", "--host"])).toEqual(["dev", "--host", "0.0.0.0"]);
    expect(fillOptionalValues(["studio", "--host", "--port", "1"])).toEqual([
      "studio",
      "--host",
      "0.0.0.0",
      "--port",
      "1",
    ]);
    expect(fillOptionalValues(["studio", "--host", "10.0.0.5"])).toEqual([
      "studio",
      "--host",
      "10.0.0.5",
    ]);
    expect(fillOptionalValues(["studio", "--host=::"])).toEqual(["studio", "--host=::"]);
    expect(fillOptionalValues(["x", "--", "--host"])).toEqual(["x", "--", "--host"]);
  });
});

describe("studio auth options (#165)", () => {
  const server = { port: 8787, baseUrl: undefined, behindProxy: false };

  it("knows loopback addresses", () => {
    for (const h of [
      undefined,
      "127.0.0.1",
      "127.1.2.3",
      "localhost",
      "::1",
      "[::1]",
      "::ffff:127.0.0.1",
    ])
      expect(isLoopbackHost(h), String(h)).toBe(true);
    for (const h of ["0.0.0.0", "::", "10.0.0.5", "fe80::1", "example.com", "127.0.0.1.evil"])
      expect(isLoopbackHost(h), h).toBe(false);
  });

  it("allows --no-auth on this machine only", () => {
    expect(() => assertNoAuthLocal({ ...server, hostname: undefined })).not.toThrow();
    expect(() => assertNoAuthLocal({ ...server, hostname: "::1" })).not.toThrow();
    expect(() => assertNoAuthLocal({ ...server, hostname: "0.0.0.0" })).toThrow(
      /for this machine only.*--host is 0\.0\.0\.0/,
    );
    expect(() =>
      assertNoAuthLocal({ ...server, hostname: "127.0.0.1", behindProxy: true }),
    ).toThrow(/for this machine only.*--behind-proxy is set/);
  });

  it("takes CLOUDHAL_SETUP_TOKEN when it is long enough, else makes one", () => {
    const given = "operator-chosen-token-0123456789abcdef";
    expect(resolveSetupToken({ CLOUDHAL_SETUP_TOKEN: ` ${given} ` })).toEqual({
      token: given,
      source: "env",
    });
    expect(() => resolveSetupToken({ CLOUDHAL_SETUP_TOKEN: "short" })).toThrow(/32 characters/);
    // a base64 value's + or / would not survive the setup link
    expect(() =>
      resolveSetupToken({ CLOUDHAL_SETUP_TOKEN: "abc+def/ghi0123456789abcdefghijklmnop=" }),
    ).toThrow(/openssl rand -hex 32/);
    const a = resolveSetupToken({ CLOUDHAL_SETUP_TOKEN: "" });
    const b = resolveSetupToken({});
    expect(a.source).toBe("generated");
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.token).not.toBe(a.token);
  });

  it("prints the setup link, but never a token the operator set", () => {
    const generated = describeSetup({
      url: "http://localhost:8787/login#setup=abc",
      tokenSource: "generated",
    });
    expect(generated).toContain("http://localhost:8787/login#setup=abc");
    expect(generated).toContain("printed only here");
    const fromEnv = describeSetup({
      url: "https://studio.example.com/login#setup=secret-value",
      tokenSource: "env",
    });
    expect(fromEnv).toContain("https://studio.example.com/login#setup=<CLOUDHAL_SETUP_TOKEN>");
    expect(fromEnv).not.toContain("secret-value");
  });

  it("warns about a Studio reachable beyond this machine without a public origin", () => {
    expect(noBaseUrlWarning({ ...server, hostname: undefined })).toBeUndefined();
    expect(noBaseUrlWarning({ ...server, hostname: "127.0.0.1" })).toBeUndefined();
    expect(
      noBaseUrlWarning({ ...server, hostname: "0.0.0.0", baseUrl: "https://studio.example.com" }),
    ).toBeUndefined();
    expect(noBaseUrlWarning({ ...server, hostname: "127.0.0.1", behindProxy: true })).toMatch(
      /--behind-proxy without --base-url/,
    );
    expect(noBaseUrlWarning({ ...server, hostname: "0.0.0.0" })).toMatch(
      /--host 0\.0\.0\.0 without --base-url.*CLOUDHAL_BASE_URL.*:8787/,
    );
  });
});

describe("cloudhal studio on an empty folder and behind a proxy", () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-selfhost-"));
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("--init-if-empty creates the project once, then serves it", async () => {
    const projectDir = path.join(tmp, "data");
    await mkdir(projectDir);
    const lines: string[] = [];
    const s = await studio({
      projectDir,
      noAuth: true,
      port: 0,
      initIfEmpty: true,
      name: "Volume Site",
      env: {},
      log: (l) => lines.push(l),
    });
    try {
      const cfg = JSON.parse(await readFile(path.join(projectDir, "cloudhal.json"), "utf8")) as {
        siteId: string;
      };
      expect(cfg.siteId).toMatch(/\S/);
      expect(lines.some((l) => l.includes('created a new "blog" project'))).toBe(true);
      // staged in a folder of its own, then moved up: nothing of the staging is left, and a
      // source checkout's `link:` dependencies point there from the project's final folder
      expect(await exists(path.join(projectDir, INIT_STAGING_DIR))).toBe(false);
      const pkg = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8")) as {
        name: string;
        dependencies: Record<string, string>;
      };
      expect(pkg.name).toBe("volume-site");
      for (const spec of Object.values(pkg.dependencies).filter((v) => v.startsWith("link:")))
        expect(await exists(path.resolve(projectDir, spec.slice(5))), spec).toBe(true);
      expect(s.setup).toBeUndefined();
      expect(s.warnings).toEqual([]);
      expect((await fetch(`${s.url}api/health`)).status).toBe(200);
      const sites = (await (await fetch(`${s.url}api/sites`)).json()) as {
        id: string;
        name: string;
      }[];
      expect(sites.map((x) => [x.id, x.name])).toEqual([[cfg.siteId, "Volume Site"]]);
      await s.stop();
      // a second start keeps the project
      const again = await studio({ projectDir, noAuth: true, port: 0, initIfEmpty: true, env: {} });
      try {
        const cfg2 = JSON.parse(await readFile(path.join(projectDir, "cloudhal.json"), "utf8")) as {
          siteId: string;
        };
        expect(cfg2.siteId).toBe(cfg.siteId);
      } finally {
        await again.stop();
      }
    } catch (e) {
      await s.stop().catch(() => {});
      throw e;
    }
  });

  it("refuses a folder that has files but no project, and does nothing without the flag", async () => {
    const other = path.join(tmp, "other");
    await mkdir(other);
    await writeFile(path.join(other, "notes.txt"), "mine");
    await expect(
      studio({ projectDir: other, noAuth: true, port: 0, initIfEmpty: true, env: {} }),
    ).rejects.toThrow(/is not empty/);
    expect(await readdir(other)).toEqual(["notes.txt"]);
    const empty = path.join(tmp, "empty");
    await mkdir(empty);
    await expect(studio({ projectDir: empty, noAuth: true, port: 0, env: {} })).rejects.toThrow();
    await expect(access(path.join(empty, "cloudhal.json"))).rejects.toThrow();
  });

  it("finishes a scaffold that an earlier start left behind, instead of refusing the folder", async () => {
    // stopped while the starter was being written: the staging folder has no cloudhal.json yet
    const unfinished = path.join(tmp, "unfinished");
    await mkdir(path.join(unfinished, INIT_STAGING_DIR), { recursive: true });
    await writeFile(path.join(unfinished, INIT_STAGING_DIR, "partial.txt"), "half");
    expect(await initIfEmpty(unfinished, { starter: "blog", name: "Again" })).toBe(true);
    expect(await exists(path.join(unfinished, "cloudhal.json"))).toBe(true);
    expect(await exists(path.join(unfinished, INIT_STAGING_DIR))).toBe(false);
    expect(await exists(path.join(unfinished, "partial.txt"))).toBe(false);

    // stopped while the finished scaffold was being moved up: some entries are already in place
    const moving = path.join(tmp, "moving");
    const staging = path.join(moving, INIT_STAGING_DIR);
    await mkdir(moving);
    await init({ dir: staging, finalDir: moving, starter: "blog", name: "Staged" });
    const staged = (await readdir(staging)).sort();
    const stagedConfig = await readFile(path.join(staging, "cloudhal.json"), "utf8");
    await rename(path.join(staging, "package.json"), path.join(moving, "package.json"));
    expect(await initIfEmpty(moving, { starter: "blog" })).toBe(true);
    expect((await readdir(moving)).sort()).toEqual(staged);
    expect(await readFile(path.join(moving, "cloudhal.json"), "utf8")).toBe(stagedConfig);
    // and a project is a project
    expect(await initIfEmpty(moving, { starter: "blog" })).toBe(false);
  });

  it("refuses --no-auth beyond loopback or behind a proxy, before touching the folder", async () => {
    const projectDir = path.join(tmp, "no-auth");
    await mkdir(projectDir);
    const base = { projectDir, noAuth: true, port: 0, initIfEmpty: true } as const;
    await expect(studio({ ...base, host: "0.0.0.0", env: {} })).rejects.toThrow(
      /--no-auth is for this machine only/,
    );
    await expect(studio({ ...base, env: { CLOUDHAL_HOST: "0.0.0.0" } })).rejects.toThrow(
      /--no-auth is for this machine only/,
    );
    await expect(studio({ ...base, behindProxy: true, env: {} })).rejects.toThrow(
      /--behind-proxy is set/,
    );
    expect(await readdir(projectDir)).toEqual([]);
  });

  it("requires the printed setup token for the first account, and none once there is one", async () => {
    const projectDir = path.join(tmp, "owner");
    await mkdir(projectDir);
    const s = await studio({ projectDir, port: 0, initIfEmpty: true, env: {} });
    try {
      expect(s.setup?.tokenSource).toBe("generated");
      const token = setupTokenOf(s);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(s.setup?.url).toBe(`${s.url}login#setup=${token}`);
      expect(s.warnings).toEqual([]);
      const base = s.url.replace(/\/$/, "");
      const bare = await signUp(base, {});
      expect(bare.status).toBe(403);
      expect(await bare.text()).toMatch(/setup link/);
      expect((await signUp(base, { "x-cloudhal-setup-token": "wrong" })).status).toBe(403);
      const ok = await signUp(base, { "x-cloudhal-setup-token": token });
      expect(ok.status, await ok.clone().text()).toBe(200);
      const cookie = ok.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] as string)
        .find((c) => c.includes("better-auth.session_token=")) as string;
      const me = await fetch(`${base}/api/me`, { headers: { cookie } });
      expect(await me.json()).toMatchObject({ role: "owner" });
    } finally {
      await s.stop();
    }
    const again = await studio({ projectDir, port: 0, env: {} });
    try {
      expect(again.setup).toBeUndefined();
    } finally {
      await again.stop();
    }
  });

  it("takes CLOUDHAL_SETUP_TOKEN instead of printing one", async () => {
    const projectDir = path.join(tmp, "env-token");
    await mkdir(projectDir);
    const token = "operator-chosen-token-0123456789abcdef";
    const s = await studio({
      projectDir,
      port: 0,
      initIfEmpty: true,
      env: { CLOUDHAL_SETUP_TOKEN: token },
    });
    try {
      expect(s.setup).toEqual({ url: `${s.url}login#setup=${token}`, tokenSource: "env" });
      expect(describeSetup(s.setup as NonNullable<typeof s.setup>)).not.toContain(token);
      const base = s.url.replace(/\/$/, "");
      expect((await signUp(base, {})).status).toBe(403);
      const ok = await signUp(base, { "x-cloudhal-setup-token": token });
      expect(ok.status, await ok.clone().text()).toBe(200);
    } finally {
      await s.stop();
    }
  });

  it("signs in from the address the browser used when no public origin is configured", async () => {
    // Better Auth's Origin check is off under NODE_ENV=test; this test turns it on.
    const projectDir = path.join(tmp, "lan");
    await mkdir(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      initIfEmpty: true,
      env: {},
      authOriginCheck: "always",
    });
    try {
      // the browser's own origin: not Better Auth's baseURL (http://localhost:<port>), yet accepted
      const own = `http://127.0.0.1:${s.port}`;
      const token = setupTokenOf(s);
      expect((await signUp(own, { origin: "https://evil.example" })).status).toBe(403);
      const ok = await signUp(own, { origin: own, "x-cloudhal-setup-token": token });
      expect(ok.status, await ok.clone().text()).toBe(200);
      const signIn = await fetch(`${own}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { ...JSON_BODY, origin: own },
        body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
      });
      expect(signIn.status, await signIn.clone().text()).toBe(200);
    } finally {
      await s.stop();
    }
  });

  it("on loopback trusts this machine's names only, so a rebound DNS name cannot sign in", async () => {
    const projectDir = path.join(tmp, "rebound");
    await mkdir(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      initIfEmpty: true,
      env: {},
      authOriginCheck: "always",
    });
    try {
      const host = `rebound.example:${s.port}`;
      const r = await signUpAs(s.port, host, {
        origin: `http://${host}`,
        "x-cloudhal-setup-token": setupTokenOf(s),
      });
      expect(r.status, r.body).toBe(403);
      expect(r.body).toMatch(/invalid origin/i);
    } finally {
      await s.stop();
    }
  });

  it("listening beyond loopback without a public origin, signs in at the LAN address used", async () => {
    const projectDir = path.join(tmp, "lan-any");
    await mkdir(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      host: "0.0.0.0",
      initIfEmpty: true,
      env: {},
      authOriginCheck: "always",
    });
    try {
      expect(s.warnings).toHaveLength(1);
      expect(s.warnings[0]).toMatch(/without --base-url/);
      const host = `10.9.8.7:${s.port}`;
      const token = setupTokenOf(s);
      const foreign = await signUpAs(s.port, host, {
        origin: "https://evil.example",
        "x-cloudhal-setup-token": token,
      });
      expect(foreign.status, foreign.body).toBe(403);
      const ok = await signUpAs(s.port, host, {
        origin: `http://${host}`,
        "x-cloudhal-setup-token": token,
      });
      expect(ok.status, ok.body).toBe(200);
    } finally {
      await s.stop();
    }
  });

  it("with a public origin, signs in from it only, and names it in invite links", async () => {
    const projectDir = path.join(tmp, "public");
    await mkdir(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      initIfEmpty: true,
      env: {},
      baseUrl: "https://studio.example.test",
      authOriginCheck: "always",
    });
    try {
      expect(s.url).toBe("https://studio.example.test/");
      const own = `http://127.0.0.1:${s.port}`;
      const token = setupTokenOf(s);
      // reached at an address that is not the public origin: refused
      const other = await signUp(own, { origin: own, "x-cloudhal-setup-token": token });
      expect(other.status).toBe(403);
      expect(await other.text()).toMatch(/invalid origin/i);
      const ok = await signUp(own, {
        origin: "https://studio.example.test",
        "x-cloudhal-setup-token": token,
      });
      expect(ok.status, await ok.clone().text()).toBe(200);
      const cookie = ok.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] as string)
        .find((c) => c.includes("better-auth.session_token=")) as string;
      // the invite link names the public origin, not the address the request came to
      const invite = await fetch(`${own}/api/invites`, {
        method: "POST",
        headers: { ...JSON_BODY, origin: "https://studio.example.test", cookie },
        body: JSON.stringify({ email: "editor@example.test", role: "editor" }),
      });
      expect(invite.status, await invite.clone().text()).toBe(201);
      const { url } = (await invite.json()) as { url: string };
      expect(url).toMatch(/^https:\/\/studio\.example\.test\/invite#chinv_/);
    } finally {
      await s.stop();
    }
  });

  it("signs the first owner in behind an https proxy with Secure cookies", async () => {
    const projectDir = path.join(tmp, "proxied");
    await mkdir(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      host: "127.0.0.1",
      baseUrl: "https://studio.example.test",
      behindProxy: true,
      initIfEmpty: true,
      env: {},
    });
    try {
      expect(s.url).toBe("https://studio.example.test/");
      expect(s.warnings).toEqual([]);
      const base = `http://127.0.0.1:${s.port}`;
      const proxied = {
        origin: "https://studio.example.test",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "studio.example.test",
        "content-type": "application/json",
      };
      const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { ...proxied, "x-cloudhal-setup-token": setupTokenOf(s) },
        body: JSON.stringify(OWNER),
      });
      expect(signUp.status, await signUp.clone().text()).toBe(200);
      const cookies = signUp.headers.getSetCookie();
      const session = cookies.find((c) => c.startsWith("__Secure-better-auth.session_token="));
      expect(session, cookies.join("\n")).toMatch(/;\s*Secure/i);
      const cookie = (session as string).split(";")[0] as string;
      const me = await fetch(`${base}/api/me`, { headers: { ...proxied, cookie } });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ role: "owner" });
      // a state-changing call from the public origin passes the API's own CSRF check
      const key = await fetch(`${base}/api/agent-keys`, {
        method: "POST",
        headers: { ...proxied, cookie },
        body: JSON.stringify({ name: "ci" }),
      });
      expect(key.status, await key.clone().text()).toBe(201);
      // a browser on another origin does not
      const foreign = await fetch(`${base}/api/agent-keys`, {
        method: "POST",
        headers: { ...proxied, cookie, origin: "https://evil.example" },
        body: JSON.stringify({ name: "no" }),
      });
      expect(foreign.status).toBe(403);
    } finally {
      await s.stop();
    }
  });
});
