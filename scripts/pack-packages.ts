/**
 * Builds every publishable package and packs it into a folder, for the `edge` Docker image
 * (.github/workflows/docker.yml): the same build and `pnpm pack` as scripts/smoke-pack.ts, with an
 * `index.json` (package name → tarball file) that deploy/docker/install.mjs installs from.
 *
 *   node scripts/pack-packages.ts <dir> [--no-build]
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGES } from "./build-packages.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Packs the built packages into `dir` and writes its index; returns name → file. */
export async function packPackages(
  dir: string,
  options: { build?: boolean } = {},
): Promise<Record<string, string>> {
  const out = path.resolve(dir);
  if (options.build !== false)
    execFileSync(process.execPath, ["scripts/build-packages.ts"], { cwd: ROOT, stdio: "inherit" });
  await mkdir(out, { recursive: true });
  for (const name of PACKAGES)
    execFileSync("pnpm", ["pack", "--pack-destination", out], {
      cwd: path.join(ROOT, "packages", name),
      stdio: "inherit",
    });
  const files = await readdir(out);
  const index: Record<string, string> = {};
  for (const name of PACKAGES) {
    const pkg = JSON.parse(
      await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"),
    ) as { name: string; version: string };
    const tgz = files.find(
      (f) => f === `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`,
    );
    if (!tgz) throw new Error(`no tarball for ${pkg.name} in ${files.join(", ")}`);
    index[pkg.name] = tgz;
  }
  await writeFile(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) throw new Error("usage: node scripts/pack-packages.ts <dir> [--no-build]");
  const index = await packPackages(dir, { build: !args.includes("--no-build") });
  console.log(`packed ${Object.keys(index).length} packages into ${path.resolve(dir)}`);
}
