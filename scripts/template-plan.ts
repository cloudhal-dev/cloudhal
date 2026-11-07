/**
 * Keeps cloudhal-template, the repository the Deploy to Cloudflare button copies
 * (docs/guides/deploy-button.md), on the latest release (issue #111). One sync makes the
 * template's `src/`, `public/`, `astro.config.mjs` and `tsconfig.json` the blog starter that
 * `@cloudhal/cli@<version>` ships (what `npm create cloudhal` copies), gives its package.json the
 * starter's dependencies with `@cloudhal/*` at `^<version>`, and appends the starter's .gitignore
 * lines. Everything else is the template's own and stays: README, LICENSE, wrangler.jsonc,
 * cloudhal.json, .node-version, .github/ and package.json's name, `cloudflare` block and the rest.
 *
 * It fails before writing anything when the starter has a top-level entry or a package.json field
 * nobody decided about (or another package.json `type`), is not the published starter of that
 * version, or would move the template to an older version.
 * Used by scripts/template-sync.ts and its tests; the PR text is scripts/template-pr.ts. Node
 * built-ins only (starter-files.ts too): .github/workflows/template-sync.yml runs it without a
 * pnpm install.
 */
import { lstat, mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STARTER_SKIP, starterFilter } from "../packages/cli/src/starter-files.ts";

type Json = Record<string, unknown>;
type Specs = Record<string, string>;

/** Mirrored from the starter: written when missing or different, deleted when it lacks them. */
export const SYNCED_DIRS = ["src", "public"] as const;
/** Overwritten from the starter when their bytes differ, deleted when it lacks them. */
export const SYNCED_FILES = ["astro.config.mjs", "tsconfig.json"] as const;
/** Top-level starter entries the sync has a rule for: copied, merged or deliberately left out. */
export const KNOWN_STARTER_ENTRIES: ReadonlySet<string> = new Set([
  ...SYNCED_DIRS,
  ...SYNCED_FILES,
  "package.json",
  "_gitignore",
  ".gitignore",
  "README.md",
  ".yarnrc.yml",
]);

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
/**
 * Starter package.json fields the sync has a rule for: scripts, the dependency maps and
 * trustedDependencies are merged; name, version, private and description are the template's own;
 * `type` must match. `cloudhal init` keeps every field, so a new one (`engines`, `overrides`,
 * `imports`, …) fails the sync until someone decides whether the template follows it.
 */
export const KNOWN_STARTER_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "version",
  "private",
  "description",
  "type",
  "scripts",
  ...DEP_FIELDS,
  "trustedDependencies",
]);
const VERSION = /^\d+\.\d+\.\d+$/;
const SCOPE = "@cloudhal/";
const CLI = "@cloudhal/cli";

export type SyncOp =
  | {
      readonly kind: "write";
      readonly path: string;
      readonly data: Buffer;
      readonly added: boolean;
    }
  | { readonly kind: "delete"; readonly path: string };

export interface SyncOptions {
  /** A published-layout starter: `package/dist/assets/starters/blog` of the CLI tarball. */
  readonly starterDir: string;
  readonly templateDir: string;
  readonly version: string;
  /** Accept a version older than the one the template's `@cloudhal/cli` range names. */
  readonly allowDowngrade?: boolean;
}

export interface DepChange {
  readonly field: string;
  readonly name: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
}

const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : Number(a.path > b.path);

/** The starter's top-level names that no rule covers (neither known nor never copied). */
export function unknownEntries(names: Iterable<string>): string[] {
  return [...names].filter((n) => !KNOWN_STARTER_ENTRIES.has(n) && !STARTER_SKIP.has(n)).sort();
}

function depMaps(pkg: Json): [field: string, specs: Specs][] {
  return DEP_FIELDS.flatMap((field): [string, Specs][] => {
    const specs = pkg[field];
    return specs && typeof specs === "object" ? [[field, specs as Specs]] : [];
  });
}

/** Throws unless `pkg` is the starter `@cloudhal/cli@<version>` ships (exact pins only). */
export function assertPublishedStarter(pkg: Json, version: string): void {
  let cli: string | undefined;
  for (const [field, specs] of depMaps(pkg)) {
    for (const [name, spec] of Object.entries(specs)) {
      if (/^(?:workspace|catalog|link|file):/.test(spec))
        throw new Error(`not a published starter: ${field} has ${name}@${spec}`);
      if (name.startsWith(SCOPE) && spec !== version)
        throw new Error(`not the starter of ${version}: it pins ${name}@${spec}`);
      if (name === CLI) cli = spec;
    }
  }
  if (cli === undefined) throw new Error(`not a published starter: it does not name ${CLI}`);
}

/** Throws when the starter's package.json has a field no rule covers, or another `type`. */
export function assertKnownFields(template: Json, starter: Json): void {
  const unknown = Object.keys(starter)
    .filter((key) => !KNOWN_STARTER_FIELDS.has(key))
    .sort();
  if (unknown.length)
    throw new Error(
      `the starter's package.json has new fields (${unknown.join(", ")}): give each a rule in scripts/template-plan.ts first`,
    );
  if (starter.type !== template.type)
    throw new Error(
      `the starter's package.json type is ${String(starter.type)}, the template's ${String(template.type)}: decide which the template uses first`,
    );
}

/** -1, 0 or 1, comparing two `x.y.z` versions numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** The version the template's `@cloudhal/cli` range names (`^0.6.0` → `0.6.0`), if it has one. */
export function currentVersion(pkg: Json): string | undefined {
  for (const [, specs] of depMaps(pkg)) {
    const spec = specs[CLI];
    if (spec === undefined) continue;
    const version = spec.replace(/^[\^~]/, "");
    if (!VERSION.test(version))
      throw new Error(`the template's ${CLI} range ${spec} is not ^x.y.z`);
    return version;
  }
  return undefined;
}

/**
 * The starter's scripts with `build` renamed `build:static` (Workers Builds runs a `build` script
 * before `deploy`): names the template has keep its order, new ones are appended, names the
 * starter dropped go.
 */
export function mergeScripts(template: Specs, starter: Specs): Specs {
  if (Object.hasOwn(starter, "build") && Object.hasOwn(starter, "build:static"))
    throw new Error("the starter has both build and build:static scripts");
  const wanted = new Map(
    Object.entries(starter).map(([name, cmd]) => [name === "build" ? "build:static" : name, cmd]),
  );
  const out: Specs = {};
  for (const name of Object.keys(template)) {
    const cmd = wanted.get(name);
    if (cmd !== undefined) out[name] = cmd;
  }
  for (const [name, cmd] of wanted) if (!Object.hasOwn(out, name)) out[name] = cmd;
  if (Object.hasOwn(out, "build")) throw new Error("the template must not have a build script");
  if (!Object.hasOwn(out, "deploy"))
    throw new Error("the starter has no deploy script, which Workers Builds runs");
  return out;
}

function sortedSpecs(specs: Specs, version: string): Specs {
  const out: Specs = {};
  for (const name of Object.keys(specs).sort())
    out[name] = name.startsWith(SCOPE) ? `^${version}` : (specs[name] as string);
  return out;
}

/**
 * The template's package.json after a sync: its own fields and key order, the starter's
 * dependencies (sorted, `@cloudhal/*` at `^<version>`), trustedDependencies and scripts.
 */
export function templatePackageJson(template: Json, starter: Json, version: string): Json {
  const fromStarter: Json = {
    scripts: mergeScripts((template.scripts ?? {}) as Specs, (starter.scripts ?? {}) as Specs),
    trustedDependencies: starter.trustedDependencies,
  };
  for (const field of DEP_FIELDS) {
    const specs = starter[field] as Specs | undefined;
    fromStarter[field] = specs ? sortedSpecs(specs, version) : undefined;
  }
  const out: Json = {};
  for (const key of new Set([...Object.keys(template), ...Object.keys(fromStarter)])) {
    const value = Object.hasOwn(fromStarter, key) ? fromStarter[key] : template[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Every dependency whose spec differs between two package.json files (added, moved, removed). */
export function dependencyChanges(before: Json, after: Json): DepChange[] {
  const out: DepChange[] = [];
  const a = new Map(depMaps(before));
  const b = new Map(depMaps(after));
  for (const field of DEP_FIELDS) {
    const from = a.get(field) ?? {};
    const to = b.get(field) ?? {};
    for (const name of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort())
      if (from[name] !== to[name]) out.push({ field, name, from: from[name], to: to[name] });
  }
  return out;
}

/** The template's .gitignore with every line of the starter's it lacks appended. */
export function mergeGitignore(template: string, starter: string): string {
  const have = new Set(template.split("\n").map((l) => l.trim()));
  const add = [...new Set(starter.split("\n").map((l) => l.trim()))].filter(
    (l) => l && !have.has(l),
  );
  if (!add.length) return template;
  const base = template === "" || template.endsWith("\n") ? template : `${template}\n`;
  return `${base}${add.join("\n")}\n`;
}

async function kindOf(abs: string): Promise<"file" | "dir" | "missing"> {
  try {
    const st = await lstat(abs);
    if (st.isFile()) return "file";
    if (st.isDirectory()) return "dir";
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw e;
  }
  throw new Error(`${abs} is not a regular file or directory (a symlink?): the sync copies files`);
}

/** A file's bytes; undefined when it is missing, filtered out or a directory. */
async function readIfFile(abs: string, keep: (src: string) => boolean) {
  if (!keep(abs)) return undefined;
  return (await kindOf(abs)) === "file" ? readFile(abs) : undefined;
}

/** The regular files under `root/sub` that `keep` admits, as `sub/…` paths. */
async function listFiles(root: string, sub: string, keep: (src: string) => boolean) {
  const out: string[] = [];
  const visit = async (rel: string): Promise<void> => {
    const abs = path.join(root, rel);
    if (!keep(abs)) return;
    const kind = await kindOf(abs);
    if (kind === "file") out.push(rel);
    else if (kind === "dir")
      for (const name of (await readdir(abs)).sort()) await visit(`${rel}/${name}`);
  };
  await visit(sub);
  return out;
}

function fileOp(rel: string, data: Buffer, current: Buffer | undefined): SyncOp[] {
  if (current && Buffer.compare(current, data) === 0) return [];
  return [{ kind: "write", path: rel, data, added: current === undefined }];
}

interface Sides {
  readonly starterDir: string;
  readonly templateDir: string;
  readonly keepStarter: (src: string) => boolean;
  readonly keepTemplate: (src: string) => boolean;
}

async function mirrorDir(s: Sides, dir: string): Promise<SyncOp[]> {
  if ((await kindOf(path.join(s.starterDir, dir))) !== "dir")
    throw new Error(`the starter has no ${dir}/: decide what the template keeps before syncing`);
  const wanted = await listFiles(s.starterDir, dir, s.keepStarter);
  const ops: SyncOp[] = [];
  for (const rel of wanted) {
    const current = await readIfFile(path.join(s.templateDir, rel), s.keepTemplate);
    ops.push(...fileOp(rel, await readFile(path.join(s.starterDir, rel)), current));
  }
  const keep = new Set(wanted);
  for (const rel of await listFiles(s.templateDir, dir, s.keepTemplate))
    if (!keep.has(rel)) ops.push({ kind: "delete", path: rel });
  return ops;
}

async function syncFile(s: Sides, rel: string): Promise<SyncOp[]> {
  const data = await readIfFile(path.join(s.starterDir, rel), s.keepStarter);
  const current = await readIfFile(path.join(s.templateDir, rel), s.keepTemplate);
  if (data) return fileOp(rel, data, current);
  return current ? [{ kind: "delete", path: rel }] : [];
}

async function readJson(file: string): Promise<Json> {
  return JSON.parse(await readFile(file, "utf8")) as Json;
}

async function gitignoreOp(s: Sides): Promise<SyncOp[]> {
  const starter =
    (await readIfFile(path.join(s.starterDir, "_gitignore"), s.keepStarter)) ??
    (await readIfFile(path.join(s.starterDir, ".gitignore"), s.keepStarter));
  if (!starter) return [];
  const current = await readIfFile(path.join(s.templateDir, ".gitignore"), () => true);
  const text = new TextDecoder();
  const merged = mergeGitignore(current ? text.decode(current) : "", text.decode(starter));
  return fileOp(".gitignore", Buffer.from(merged), current);
}

/** What one sync changes in the template, sorted by path; throws before anything is written. */
export async function planSync(options: SyncOptions): Promise<SyncOp[]> {
  const { starterDir, templateDir, version } = options;
  if (!VERSION.test(version)) throw new Error(`the version must be x.y.z, not ${version}`);
  const s: Sides = {
    starterDir,
    templateDir,
    keepStarter: await starterFilter(starterDir),
    keepTemplate: await starterFilter(templateDir),
  };
  const top = (await readdir(starterDir)).filter((n) => s.keepStarter(path.join(starterDir, n)));
  const unknown = unknownEntries(top);
  if (unknown.length)
    throw new Error(
      `the starter has new top-level entries (${unknown.join(", ")}): give each a rule in scripts/template-plan.ts first`,
    );
  const starterPkg = await readJson(path.join(starterDir, "package.json"));
  assertPublishedStarter(starterPkg, version);
  const templatePkg = await readJson(path.join(templateDir, "package.json"));
  assertKnownFields(templatePkg, starterPkg);
  const current = currentVersion(templatePkg);
  if (current && compareVersions(version, current) < 0 && !options.allowDowngrade)
    throw new Error(`the template is on ${current}; ${version} would downgrade it`);
  const ops: SyncOp[] = [];
  for (const dir of SYNCED_DIRS) ops.push(...(await mirrorDir(s, dir)));
  for (const file of SYNCED_FILES) ops.push(...(await syncFile(s, file)));
  const pkg = `${JSON.stringify(templatePackageJson(templatePkg, starterPkg, version), null, 2)}\n`;
  const pkgNow = await readFile(path.join(templateDir, "package.json"));
  ops.push(...fileOp("package.json", Buffer.from(pkg), pkgNow));
  ops.push(...(await gitignoreOp(s)));
  return ops.sort(byPath);
}

/** Removes `dir` and its parents up to (not including) `root` while they are empty. */
async function pruneEmpty(dir: string, root: string): Promise<void> {
  for (let d = dir; d.startsWith(`${root}${path.sep}`); d = path.dirname(d)) {
    const kind = await kindOf(d);
    if (kind === "missing") continue;
    if (kind !== "dir" || (await readdir(d)).length) return;
    await rmdir(d);
  }
}

/** Applies `planSync`'s operations: deletes (and the directories they empty), then writes. */
export async function applySync(templateDir: string, ops: readonly SyncOp[]): Promise<void> {
  const root = path.resolve(templateDir);
  const target = (rel: string) => {
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(`${root}${path.sep}`)) throw new Error(`${rel} is outside the template`);
    return abs;
  };
  const emptied = new Set<string>();
  for (const op of ops) {
    if (op.kind !== "delete") continue;
    await rm(target(op.path), { force: true });
    emptied.add(path.dirname(target(op.path)));
  }
  for (const dir of [...emptied].sort().reverse()) await pruneEmpty(dir, root);
  for (const op of ops) {
    if (op.kind !== "write") continue;
    await mkdir(path.dirname(target(op.path)), { recursive: true });
    await writeFile(target(op.path), op.data);
  }
}
