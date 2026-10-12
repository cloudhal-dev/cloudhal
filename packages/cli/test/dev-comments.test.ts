/**
 * RFC-0007 §8.5 in a real `cloudhal dev` (a child process: Astro disables its dev middleware under
 * Vitest): the integration's comments middleware serves the module and its worker, answers the
 * endpoints on the local SQLite store with a local key, and the article renders the section.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");

async function spawnDev(
  projectDir: string,
  port: number,
): Promise<{ child: ChildProcess; url: string }> {
  const { VITEST: _v, NODE_ENV: _n, CLOUDHAL_COMMENTS_KEY: _k, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "dev", "--port", String(port)], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`cloudhal dev did not start:\n${output}`)),
      60_000,
    );
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const m = output.match(/cloudhal dev → (http:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1] as string);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudhal dev exited with ${code}:\n${output}`));
    });
  });
  return { child, url };
}

describe("cloudhal dev with reader comments (RFC-0007 §8.5)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let dataDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-dev-comments-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Dev Comments" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "v1", publish: true });
    dataDir = path.join(projectDir, (await readProjectConfig(projectDir)).dataDir);
    // what Studio's settings will do (step 8): turn comments on for posts
    const local = await openLocalStore(dataDir);
    try {
      await new SqlCommentStore(local.sql).putSettings(
        siteId,
        { enabled: true, collections: { posts: { enabled: true } } },
        0,
        "user_devcomment1",
      );
    } finally {
      await local.close();
    }
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("renders the form, serves the module and stores a posted comment in SQLite", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    let hello: string | undefined;
    try {
      let html = "";
      for (let i = 0; i < 40; i++) {
        const res = await fetch(new URL("/posts/hello-world", server.url));
        html = await res.text();
        if (res.status === 200 && html.includes("<h1")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(html).toContain('data-cloudhal-comments data-state="open"');
      hello = html.match(/name="nodeId" value="([^"]+)"/)?.[1];
      expect(hello).toBeDefined();
      const module = html.match(/src="(\/_cloudhal\/c\.[0-9a-f]{8}\.js)"/)?.[1];
      const code = await (await fetch(new URL(module as string, server.url))).text();
      expect(code).toContain("/__cloudhal/comments");
      const worker = code.match(/\/_cloudhal\/cw\.[0-9a-f]{8}\.js/)?.[0];
      const solver = await fetch(new URL(worker as string, server.url));
      expect(solver.headers.get("content-type")).toContain("javascript");

      const challenge = await fetch(
        new URL(`/__cloudhal/comments/challenge?node=${hello}&for=comment`, server.url),
      );
      expect(challenge.status).toBe(200);
      expect(challenge.headers.get("cache-control")).toBe("no-store");

      const origin = new URL(server.url).origin;
      const posted = await fetch(new URL("/__cloudhal/comments", server.url), {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({
          nodeId: hello as string,
          name: "Local Reader",
          body: "Trying comments locally.",
        }).toString(),
      });
      expect(posted.status).toBe(303);
      expect(posted.headers.get("location")).toBe("/posts/hello-world#comment-pending");
    } finally {
      server.child.kill();
    }
    // a local key was created in the data directory (never in the project's committed files)
    expect((await stat(path.join(dataDir, "comments.key"))).isFile()).toBe(true);
    const local = await openLocalStore(dataDir);
    try {
      const { comments } = await new SqlCommentStore(local.sql).list(siteId, {
        status: "pending",
        limit: 10,
      });
      expect(comments.map((c) => [c.nodeId, c.author, c.body?.text])).toEqual([
        [hello, { kind: "guest", name: "Local Reader" }, "Trying comments locally."],
      ]);
    } finally {
      await local.close();
    }
  });
});
