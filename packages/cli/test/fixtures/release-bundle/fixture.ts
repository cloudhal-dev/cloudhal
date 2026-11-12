/**
 * A small `cloudhal deploy --dry-run` build output for the release-bundle tests, written into a
 * temp directory per test (nothing here is committed output). The deploy secrets are generated per
 * call, never fixed values (AGENTS.md rule 9).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ReleaseFacts } from "../../../../../scripts/release-bundle/manifest.ts";

export interface FixtureProject {
  readonly root: string;
  readonly project: string;
  readonly studio: string;
  readonly migrations: string;
  readonly secrets: Record<string, string>;
}

function put(file: string, content: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Writes the build layout `read-build.ts` reads; `extra` adds or overrides files by path. */
export function fixtureProject(
  extra: Readonly<Record<string, string | Uint8Array>> = {},
): FixtureProject {
  const root = mkdtempSync(path.join(os.tmpdir(), "release-bundle-"));
  const project = path.join(root, "project");
  const studio = path.join(root, "studio");
  const migrations = path.join(root, "migrations");
  const secrets = {
    BETTER_AUTH_SECRET: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""),
    CLOUDHAL_PREVIEW_SECRET: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""),
  };
  const files: Record<string, string | Uint8Array> = {
    "project/.cloudhal/deploy/secrets.json": `${JSON.stringify(secrets, null, 2)}\n`,
    "project/.cloudhal/deploy/out/site/entry.mjs": "export default { fetch() {} };\n",
    "project/.cloudhal/deploy/out/site/chunks/page.mjs": "export const page = 1;\n",
    "project/.cloudhal/deploy/out/site/entry.mjs.map": "{}",
    "project/.cloudhal/deploy/out/site/README.md": "wrangler output\n",
    "project/.cloudhal/deploy/out/admin/worker.js": "export default { fetch() {} };\n",
    "project/.cloudhal/deploy/out/admin/worker.js.map": "{}",
    "project/dist/client/favicon.svg": "<svg/>",
    "project/dist/client/_headers": "/*\n  X-Frame-Options: DENY\n",
    "project/dist/client/.assetsignore": "notes.txt\nprivate/**\n",
    "project/dist/client/notes.txt": "ignored\n",
    "project/dist/client/private/a.html": "ignored",
    [`project/dist/client/_astro/${"deep/".repeat(22)}style.css`]: "body{}",
    "project/dist/server/wrangler.json": JSON.stringify({
      compatibility_date: "2026-10-01",
      compatibility_flags: ["nodejs_compat", "nodejs_compat"],
    }),
    "studio/index.html": "<!doctype html><title>Studio</title>",
    "studio/assets/app.js": "console.log(1);\n",
    "studio/assets/app.js.map": "{}",
    "migrations/0001_init.ts": "export default 1;\n",
    "migrations/0002_auth.sql": "select 1;\n",
    "migrations/index.ts": "export {};\n",
    ...extra,
  };
  for (const [rel, content] of Object.entries(files)) put(path.join(root, rel), content);
  return { root, project, studio, migrations, secrets };
}

export const COMMIT = "0123456789abcdef0123456789abcdef01234567";

export function facts(over: Partial<ReleaseFacts> = {}): ReleaseFacts {
  return {
    version: "0.8.0",
    commit: COMMIT,
    createdAt: "2026-11-12T08:00:00Z",
    keyId: "cloudhal-release-2026a",
    migrations: ["0001_init", "0002_auth"],
    toolchain: { node: "24.0.0", cli: "0.8.0", astro: "7.4.7", wrangler: "4.158.0" },
    ...over,
  };
}
