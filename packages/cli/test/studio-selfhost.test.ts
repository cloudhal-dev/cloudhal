/**
 * `cloudhal studio` where it does not run on the author's machine (self-hosting, #143): `--host`,
 * `--base-url`, `--behind-proxy` and `--init-if-empty`, their environment variables, and what they
 * change for Better Auth behind an https reverse proxy.
 */
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillOptionalValues } from "../src/cli.ts";
import {
  parseBaseUrl,
  resolveStudioInit,
  resolveStudioServer,
  studioAuthOrigins,
  studioUrl,
} from "../src/commands/studio-options.ts";
import { studio } from "../src/index.ts";

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

  it("gives Better Auth the public origin and trusts it for the API's CSRF check", () => {
    const local = studioAuthOrigins(
      { port: 8787, hostname: undefined, baseUrl: undefined, behindProxy: false },
      {},
    );
    expect(local).toEqual({
      baseURL: "http://localhost:8787",
      trustedOrigins: ["http://localhost:5173"],
    });
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

  it("fills a bare --host (every interface) so parseArgs sees a value", () => {
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
      log: (l) => lines.push(l),
    });
    try {
      const cfg = JSON.parse(await readFile(path.join(projectDir, "cloudhal.json"), "utf8")) as {
        siteId: string;
      };
      expect(cfg.siteId).toMatch(/\S/);
      expect(lines.some((l) => l.includes('created a new "blog" project'))).toBe(true);
      expect((await fetch(`${s.url}api/health`)).status).toBe(200);
      const sites = (await (await fetch(`${s.url}api/sites`)).json()) as {
        id: string;
        name: string;
      }[];
      expect(sites.map((x) => [x.id, x.name])).toEqual([[cfg.siteId, "Volume Site"]]);
      await s.stop();
      // a second start keeps the project
      const again = await studio({ projectDir, noAuth: true, port: 0, initIfEmpty: true });
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
      studio({ projectDir: other, noAuth: true, port: 0, initIfEmpty: true }),
    ).rejects.toThrow(/is not empty/);
    const empty = path.join(tmp, "empty");
    await mkdir(empty);
    await expect(studio({ projectDir: empty, noAuth: true, port: 0 })).rejects.toThrow();
    await expect(access(path.join(empty, "cloudhal.json"))).rejects.toThrow();
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
    });
    try {
      expect(s.url).toBe("https://studio.example.test/");
      const base = `http://127.0.0.1:${s.port}`;
      const proxied = {
        origin: "https://studio.example.test",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "studio.example.test",
        "content-type": "application/json",
      };
      const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: proxied,
        body: JSON.stringify({
          name: "Olive Owner",
          email: "owner@example.test",
          password: "correct horse battery staple",
        }),
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
