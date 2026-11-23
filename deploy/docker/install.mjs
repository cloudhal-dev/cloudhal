/**
 * The image's build stage (Dockerfile, RFC-0047 §9). It installs `@cloudhal/cli` and the pinned
 * workerd with plain npm (npm checks each package against the registry's integrity hash), puts the
 * release bundle of the image's version under `<target>/runtime/bundle` and checks it file by
 * file, then lays out `<target>/runtime`, the only thing the last stage copies:
 *
 *   runtime/selfhost/   the CLI's compiled `src/selfhost` (Node built-ins only: main.js)
 *   runtime/bin/workerd the workerd binary for this platform
 *   runtime/bundle/     the release bundle
 *   runtime/workerd-no-tcmalloc/workerd   linux-arm64 only, when workerd-no-tcmalloc is pinned
 *
 * Sources:
 * - a release: `CLOUDHAL_VERSION=x.y.z`, the CLI from npm and the signed bundle from the GitHub
 *   release, downloaded and verified by `cloudhal selfhost fetch` (key and yank lists, signature,
 *   every file's SHA-256);
 * - edge: `<ctx>/tarballs/index.json` (scripts/pack-packages.ts) names a packed tarball per
 *   package, and `<ctx>/bundle/` holds this ref's unsigned bundle (scripts/selfhost-edge-bundle.ts),
 *   checked only against its own manifest.
 *
 *   node install.mjs <ctx> <target>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [ctx = "/ctx", target = "/opt/cloudhal"] = process.argv.slice(2);
const version = process.env.CLOUDHAL_VERSION?.trim() || undefined;
const workerd = readFileSync(path.join(ctx, "workerd-version"), "utf8").trim();
const index = path.join(ctx, "tarballs", "index.json");
const runtime = path.join(target, "runtime");

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

// 1. the bundle
const bundle = path.join(runtime, "bundle");
mkdirSync(runtime, { recursive: true });
if (existsSync(path.join(ctx, "bundle", "manifest.json"))) {
  cpSync(path.join(ctx, "bundle"), bundle, { recursive: true });
} else {
  const cli = JSON.parse(
    readFileSync(path.join(target, "node_modules/@cloudhal/cli/package.json"), "utf8"),
  );
  cloudhal("selfhost", "fetch", version ?? cli.version, "--out", bundle);
}

// 2. the runtime entry: the compiled selfhost folder, an ES module package of its own
const selfhost = path.join(runtime, "selfhost");
cpSync(path.join(target, "node_modules/@cloudhal/cli/dist/src/selfhost"), selfhost, {
  recursive: true,
  filter: (src) => !src.endsWith(".d.ts") && !src.endsWith(".map"),
});
writeFileSync(path.join(selfhost, "package.json"), '{ "type": "module" }\n');

// 3. workerd: the platform binary itself, not npm's launcher
const platform = { x64: "linux-64", arm64: "linux-arm64" }[process.arch];
if (!platform) throw new Error(`workerd has no Linux build for ${process.arch}`);
mkdirSync(path.join(runtime, "bin"), { recursive: true });
cpSync(
  path.join(target, `node_modules/@cloudflare/workerd-${platform}/bin/workerd`),
  path.join(runtime, "bin/workerd"),
);
chmodSync(path.join(runtime, "bin/workerd"), 0o755);

// 4. linux-arm64: the pinned tcmalloc-free fallback for 39-bit kernels, if pinned
const pin = Object.fromEntries(
  readFileSync(path.join(ctx, "workerd-no-tcmalloc"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (process.arch === "arm64" && pin.version) {
  if (pin.version !== workerd)
    throw new Error(`workerd-no-tcmalloc pins ${pin.version}, but workerd-version is ${workerd}`);
  if (!/^[0-9a-f]{64}$/.test(pin.sha256 ?? "") || !pin.url?.startsWith("https://"))
    throw new Error("workerd-no-tcmalloc: version, sha256 and an https url are all required");
  const res = await fetch(pin.url);
  if (!res.ok) throw new Error(`workerd-no-tcmalloc: ${pin.url} answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== pin.sha256)
    throw new Error(`workerd-no-tcmalloc: SHA-256 ${got}, pinned ${pin.sha256}`);
  mkdirSync(path.join(runtime, "workerd-no-tcmalloc"), { recursive: true });
  writeFileSync(path.join(runtime, "workerd-no-tcmalloc/workerd"), bytes, { mode: 0o755 });
  console.log(`added the tcmalloc-free workerd ${pin.version} (sha256 ${got.slice(0, 12)})`);
}

// 5. the runtime entry checks the bundle the way every start will
execFileSync(process.execPath, [path.join(selfhost, "main.js"), "check", "--in", bundle], {
  stdio: "inherit",
});
execFileSync(path.join(runtime, "bin/workerd"), ["--version"], { stdio: "inherit" });
console.log(`installed the runtime with workerd ${workerd} for ${platform}`);
