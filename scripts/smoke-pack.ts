/**
 * End-to-end check of what npm users get (ADR-0013): build, `pnpm pack` every publishable package,
 * then — in an empty directory outside the monorepo, with plain npm — `npm create cloudhal`,
 * `npm install`, snapshot + build the site, serve it with `cloudhal dev`, and bundle both
 * Cloudflare Workers with `cloudhal deploy --dry-run`. A second project, with the packages that
 * ship `./testing` suites as direct dependencies next to vitest 4 and miniflare 3, must resolve
 * with `npm install --dry-run` (no ERESOLVE on their optional peers). Needs network access to the
 * npm registry for third-party dependencies; @cloudhal/* come from the local tarballs.
 *
 *   node scripts/smoke-pack.ts [--keep] [--tarballs <dir>]
 *
 * `--tarballs <dir>` packs into that folder and leaves the tarballs there: the release job
 * (`publish-ci.ts`) publishes exactly what this test installed.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGES } from "./build-packages.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const tarballsArg = process.argv.indexOf("--tarballs");
const tarballsDir = tarballsArg === -1 ? undefined : process.argv[tarballsArg + 1];
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  console.log(`$ ${cmd} ${args.join(" ")}   (in ${path.relative(os.tmpdir(), cwd) || cwd})`);
  const { VITEST: _v, NODE_ENV: _n, npm_config_user_agent: _ua, ...base } = process.env;
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...base, ...env } });
};

const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-smoke-"));
try {
  run(process.execPath, ["scripts/build-packages.ts"], ROOT);
  const tarballs = tarballsDir ? path.resolve(tarballsDir) : path.join(tmp, "tarballs");
  for (const name of PACKAGES)
    run("pnpm", ["pack", "--pack-destination", tarballs], path.join(ROOT, "packages", name));
  const files = await readdir(tarballs);
  const overrides: Record<string, string> = {};
  for (const name of PACKAGES) {
    const pkg = JSON.parse(
      await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"),
    ) as { name: string; version: string };
    const tgz = files.find(
      (f) => f === `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`,
    );
    if (!tgz) throw new Error(`no tarball for ${pkg.name} in ${files.join(", ")}`);
    overrides[pkg.name] = `file:${path.join(tarballs, tgz)}`;
  }
  // a fresh directory with nothing but npm
  const consumer = path.join(tmp, "consumer");
  await writeFile(path.join(tmp, "package.json"), "{}");
  await rm(path.join(tmp, "package.json"));
  execFileSync("mkdir", ["-p", consumer]);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "smoke",
        private: true,
        dependencies: { "create-cloudhal": overrides["create-cloudhal"] },
        overrides,
      },
      null,
      2,
    ),
  );
  run("npm", ["install", "--no-audit", "--no-fund"], consumer);
  run("npx", ["create-cloudhal", "site", "--name", "Smoke Site"], consumer);
  const site = path.join(consumer, "site");
  const pkg = JSON.parse(await readFile(path.join(site, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = (pkg[field] ?? {}) as Record<string, string>;
    for (const v of Object.values(deps))
      if (/^(workspace|catalog):/.test(v)) throw new Error(`starter still has a ${v} dependency`);
  }
  // npm would fetch @cloudhal/* from the registry; point them at the local tarballs instead.
  // Direct dependencies are replaced in place (npm forbids overriding them); the rest via overrides.
  const transitive = { ...overrides };
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const name of Object.keys(deps))
      if (overrides[name]) {
        deps[name] = overrides[name];
        delete transitive[name];
      }
  }
  await writeFile(
    path.join(site, "package.json"),
    JSON.stringify({ ...pkg, overrides: transitive }, null, 2),
  );
  run("npm", ["install", "--no-audit", "--no-fund"], site);
  await directPeersInstall(path.join(tmp, "direct-peers"), overrides);
  run("npx", ["cloudhal", "snapshot", "--publish", "--label", "smoke"], site);
  run("npx", ["cloudhal", "build"], site);
  const html = await readFile(path.join(site, "dist/index.html"), "utf8");
  if (!/<h1[^>]*>Smoke Site<\/h1>/.test(html))
    throw new Error("built home page does not show the site name");
  console.log("✓ static build renders the site");

  // cloudhal dev serves live pages
  const port = 41000 + Math.floor(Math.random() * 10000);
  // Its own process group: `npx` does not pass a SIGTERM on to `cloudhal dev`, whose orphan kept
  // the script alive and wrote node_modules/.vite while the temp project was being removed.
  const dev = spawn("npx", ["cloudhal", "dev", "--port", String(port)], {
    cwd: site,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const exited = new Promise((resolve) => dev.once("exit", resolve));
  try {
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://localhost:${port}/`);
        ok = res.status === 200 && (await res.text()).includes("Smoke Site");
      } catch {
        // not up yet
      }
    }
    if (!ok) throw new Error("cloudhal dev did not serve the site");
    console.log("✓ cloudhal dev serves the site");
  } finally {
    try {
      if (dev.pid) process.kill(-dev.pid, "SIGTERM");
    } catch {
      // already gone
    }
    await exited;
  }

  run("npx", ["cloudhal", "deploy", "--dry-run"], site);
  console.log("✓ both Workers bundle with wrangler (dry run)");
  console.log("\nSmoke test passed.");
} finally {
  if (keep) console.log(`kept ${tmp}`);
  // A dev server child may still be flushing node_modules/.vite for a moment after the group stops.
  else await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

/**
 * A project that depends directly on the packages whose `./testing` suites have optional
 * vitest/miniflare peers, with other majors of both. npm stops with ERESOLVE when a direct
 * dependency's optional peer does not match the project's copy, whether or not anything imports
 * `./testing`. The default starter only reaches these packages transitively, so it misses that.
 */
async function directPeersInstall(dir: string, tarballs: Record<string, string>): Promise<void> {
  const direct = [
    "@cloudhal/storage",
    "@cloudhal/analytics",
    "@cloudhal/comments",
    "@cloudhal/schedules",
  ];
  const dependencies = Object.fromEntries(direct.map((name) => [name, tarballs[name]]));
  const overrides = Object.fromEntries(
    Object.entries(tarballs).filter(([name]) => !direct.includes(name)),
  );
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "smoke-direct-peers",
        private: true,
        dependencies,
        devDependencies: { vitest: "^4.0.0", miniflare: "^3.0.0" },
        overrides,
      },
      null,
      2,
    ),
  );
  run("npm", ["install", "--dry-run", "--no-audit", "--no-fund"], dir);
  console.log("✓ direct dependencies resolve next to vitest 4 and miniflare 3");
}
