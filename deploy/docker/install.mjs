/**
 * The image's build stage (Dockerfile): installs `@cloudhal/cli` and `create-cloudhal` with plain
 * npm, then the blog starter's own dependencies next to them, so a project scaffolded on the
 * volume can run `cloudhal build` with the image's node_modules (no install at run time, no
 * network). Two sources:
 *
 * - a release: `CLOUDHAL_VERSION=x.y.z` in the environment, every package from the npm registry;
 * - edge: `<ctx>/tarballs/index.json` (written by scripts/pack-packages.ts) naming a packed
 *   tarball per package; direct dependencies point at them and `overrides` catch the rest, as
 *   scripts/smoke-pack.ts installs them.
 *
 *   node install.mjs <ctx> <target>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [ctx = "/ctx", target = "/opt/cloudhal"] = process.argv.slice(2);
const version = process.env.CLOUDHAL_VERSION?.trim() || undefined;
const index = path.join(ctx, "tarballs", "index.json");

/** Package name → npm spec for every `@cloudhal/*` package and create-cloudhal. */
function specs() {
  if (existsSync(index)) {
    const files = JSON.parse(readFileSync(index, "utf8"));
    return Object.fromEntries(
      Object.entries(files).map(([name, file]) => [
        name,
        `file:${path.join(ctx, "tarballs", String(file))}`,
      ]),
    );
  }
  if (!version)
    throw new Error("set CLOUDHAL_VERSION (an npm version) or provide tarballs/index.json");
  return { "@cloudhal/cli": version, "create-cloudhal": version };
}

/** Dependencies as given, with `overrides` for the packages not among them (npm forbids both). */
function manifest(dependencies, all) {
  const overrides = Object.fromEntries(
    Object.entries(all).filter(([name]) => !(name in dependencies)),
  );
  return {
    name: "cloudhal-image",
    private: true,
    dependencies,
    ...(Object.keys(overrides).length ? { overrides } : {}),
  };
}

function install(dir, pkg) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: dir,
    stdio: "inherit",
  });
}

const all = specs();
// 1. the CLI (and create-cloudhal, so `npm create cloudhal` works inside the container too)
const cli = { "@cloudhal/cli": all["@cloudhal/cli"], "create-cloudhal": all["create-cloudhal"] };
install(target, manifest(cli, all));

// 2. the blog starter's runtime dependencies (the CLI itself and the Cloudflare adapter left out:
//    the CLI is already here, and deploying to Cloudflare is not the container's job)
const starter = JSON.parse(
  readFileSync(
    path.join(target, "node_modules/@cloudhal/cli/dist/assets/starters/blog/package.json"),
    "utf8",
  ),
);
const site = {};
for (const [name, range] of Object.entries(starter.dependencies ?? {})) {
  if (name === "@cloudhal/cli" || name === "@astrojs/cloudflare") continue;
  site[name] = all[name] ?? range;
}
install(target, manifest({ ...cli, ...site }, all));

const installed = JSON.parse(
  readFileSync(path.join(target, "node_modules/@cloudhal/cli/package.json"), "utf8"),
);
console.log(`installed @cloudhal/cli ${installed.version} with ${Object.keys(site).join(", ")}`);
