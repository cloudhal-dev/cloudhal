/**
 * The image's build stage (Dockerfile, RFC-0047 §9): installs `@cloudhal/cli` and the pinned
 * workerd with plain npm (npm checks each package against the registry's integrity hash), then
 * puts the release bundle of the image's version under `<target>/bundle`, checked file by file.
 *
 * - a release: `CLOUDHAL_VERSION=x.y.z`, the CLI from npm and the signed bundle from the GitHub
 *   release, downloaded and verified by `cloudhal selfhost fetch` (key and yank lists, signature,
 *   every file's SHA-256);
 * - edge: `<ctx>/tarballs/index.json` (scripts/pack-packages.ts) names a packed tarball per
 *   package, and `<ctx>/bundle/` holds this ref's unsigned bundle, extracted by
 *   scripts/selfhost-edge-bundle.ts; it is only checked against its own manifest.
 *
 *   node install.mjs <ctx> <target>
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [ctx = "/ctx", target = "/opt/cloudhal"] = process.argv.slice(2);
const version = process.env.CLOUDHAL_VERSION?.trim() || undefined;
const workerd = readFileSync(path.join(ctx, "workerd-version"), "utf8").trim();
const index = path.join(ctx, "tarballs", "index.json");

/** Package name → npm spec for every `@cloudhal/*` package. */
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
  return { "@cloudhal/cli": version };
}

const all = specs();
const dependencies = { "@cloudhal/cli": all["@cloudhal/cli"], workerd };
const overrides = Object.fromEntries(
  Object.entries(all).filter(([name]) => !(name in dependencies)),
);
mkdirSync(target, { recursive: true });
writeFileSync(
  path.join(target, "package.json"),
  `${JSON.stringify(
    {
      name: "cloudhal-image",
      private: true,
      dependencies,
      ...(Object.keys(overrides).length ? { overrides } : {}),
    },
    null,
    2,
  )}\n`,
);
execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
  cwd: target,
  stdio: "inherit",
});

const bin = path.join(target, "node_modules/.bin");
const cloudhal = (...args) =>
  execFileSync(path.join(bin, "cloudhal"), args, { stdio: "inherit", cwd: target });
const bundle = path.join(target, "bundle");
if (existsSync(path.join(ctx, "bundle", "manifest.json"))) {
  cpSync(path.join(ctx, "bundle"), bundle, { recursive: true });
} else {
  const cli = JSON.parse(
    readFileSync(path.join(target, "node_modules/@cloudhal/cli/package.json"), "utf8"),
  );
  cloudhal("selfhost", "fetch", version ?? cli.version, "--out", bundle);
}
cloudhal("selfhost", "check", "--in", bundle);
execFileSync(path.join(bin, "workerd"), ["--version"], { stdio: "inherit" });
console.log(`installed @cloudhal/cli with workerd ${workerd}`);
