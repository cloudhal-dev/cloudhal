/**
 * End-to-end check of what npm users get (ADR-0013): build, `pnpm pack` every publishable package,
 * then — in an empty directory outside the monorepo, with plain npm — `npm create cloudhal`,
 * `npm install`, snapshot + build the site, serve it with `cloudhal dev`, and bundle both
 * Cloudflare Workers with `cloudhal deploy --dry-run`. Needs network access to the npm registry
 * for third-party dependencies; @cloudhal/* come from the local tarballs.
 *
 *   node scripts/smoke-pack.ts [--keep]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGES } from "./build-packages.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  console.log(`$ ${cmd} ${args.join(" ")}   (in ${path.relative(os.tmpdir(), cwd) || cwd})`);
  const { VITEST: _v, NODE_ENV: _n, npm_config_user_agent: _ua, ...base } = process.env;
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...base, ...env } });
};

const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-smoke-"));
try {
  run(process.execPath, ["scripts/build-packages.ts"], ROOT);
  const tarballs = path.join(tmp, "tarballs");
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
  run("npx", ["cloudhal", "snapshot", "--publish", "--label", "smoke"], site);
  run("npx", ["cloudhal", "build"], site);
  const html = await readFile(path.join(site, "dist/index.html"), "utf8");
  if (!/<h1[^>]*>Smoke Site<\/h1>/.test(html))
    throw new Error("built home page does not show the site name");
  console.log("✓ static build renders the site");

  // cloudhal dev serves live pages
  const port = 41000 + Math.floor(Math.random() * 10000);
  const dev = spawn("npx", ["cloudhal", "dev", "--port", String(port)], {
    cwd: site,
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    dev.kill("SIGTERM");
  }

  run("npx", ["cloudhal", "deploy", "--dry-run"], site);
  console.log("✓ both Workers bundle with wrangler (dry run)");
  console.log("\nSmoke test passed.");
} finally {
  if (keep) console.log(`kept ${tmp}`);
  else await rm(tmp, { recursive: true, force: true });
}
