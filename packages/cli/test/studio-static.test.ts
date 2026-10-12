/**
 * `cloudhal studio` serving a built Studio: the SPA fallback answers Studio's own routes, never an
 * /api path. Without auth, GET /api/agent-keys is declared but not mounted; it used to receive
 * index.html with a 200, which Studio read as data and crashed every screen.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isApiPath } from "../src/commands/studio.ts";
import { init, studio } from "../src/index.ts";

const INDEX = "<!doctype html><title>Studio</title><div id=root></div>";

describe("cloudhal studio static fallback", () => {
  let tmp: string;
  let projectDir: string;
  let studioDist: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-static-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Static" });
    studioDist = path.join(tmp, "dist");
    await mkdir(path.join(studioDist, "assets"), { recursive: true });
    await writeFile(path.join(studioDist, "index.html"), INDEX);
    await writeFile(path.join(studioDist, "assets", "app.js"), "export {};\n");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("knows the API's paths", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/agent-keys")).toBe(true);
    expect(isApiPath("/apis")).toBe(false);
    expect(isApiPath("/sites/abc/api")).toBe(false);
    expect(isApiPath("/")).toBe(false);
  });

  it("answers unmounted /api routes with a JSON 404 and Studio routes with index.html", async () => {
    const s = await studio({ projectDir, studioDist, noAuth: true, port: 0 });
    try {
      const base = s.url.replace(/\/$/, "");
      for (const p of ["/api/agent-keys", "/api/nothing-here", "/api"]) {
        const res = await fetch(`${base}${p}`);
        expect(res.status, p).toBe(404);
        expect(res.headers.get("content-type"), p).toMatch(/application\/json/);
        expect(await res.json(), p).toMatchObject({ error: "not_found" });
      }
      // mounted API routes still answer
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
      // Studio's client-side routes and assets
      for (const p of ["/", "/sites/abc/pages", "/account/agents"]) {
        const res = await fetch(`${base}${p}`);
        expect(res.status, p).toBe(200);
        expect(await res.text(), p).toBe(INDEX);
      }
      const asset = await fetch(`${base}/assets/app.js`);
      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe("export {};\n");
    } finally {
      await s.stop();
    }
  });
});
