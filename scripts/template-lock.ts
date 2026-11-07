/**
 * The lockfile half of a cloudhal-template sync (issue #111). A plain
 * `npm install --package-lock-only` against the `^<version>` ranges keeps every locked
 * `@cloudhal/*` that already satisfies them and moves the rest to the newest release in range, so
 * a sync to anything but the newest release would lock another version than the PR names (and its
 * check would test that one). `scripts/template-sync.ts --lock` therefore installs the template's
 * direct `@cloudhal/*` dependencies at exactly <version> (theirs on each other are exact pins), then
 * fails unless `lockProblems` is empty. Pure functions; no imports.
 */

type Json = Record<string, unknown>;
type Specs = Record<string, string>;

const SCOPE = "@cloudhal/";
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
/** A lock `packages` key of an installed `@cloudhal/*` package, nested ones included. */
const LOCKED_SCOPED = /(?:^|\/)node_modules\/@cloudhal\/[^/]+$/;

function scoped(pkg: Json): [field: string, name: string, spec: string][] {
  return DEP_FIELDS.flatMap((field) =>
    Object.entries((pkg[field] ?? {}) as Specs)
      .filter(([name]) => name.startsWith(SCOPE))
      .map(([name, spec]): [string, string, string] => [field, name, spec]),
  );
}

/** `name@<version>` for every `@cloudhal/*` the template's package.json names, sorted. */
export function lockPins(pkg: Json, version: string): string[] {
  const names = [...new Set(scoped(pkg).map(([, name]) => name))].sort();
  if (!names.length) throw new Error(`the template's package.json names no ${SCOPE}* package`);
  return names.map((name) => `${name}@${version}`);
}

/**
 * Why `pkg` and `lock` do not install exactly `version`: a `@cloudhal/*` range in package.json
 * other than `^<version>` (npm rewrote it), or a locked `@cloudhal/*` package at another version.
 * Empty when they match the release the PR names.
 */
export function lockProblems(pkg: Json, lock: Json, version: string): string[] {
  const problems: string[] = [];
  for (const [field, name, spec] of scoped(pkg))
    if (spec !== `^${version}`) problems.push(`package.json ${field} has ${name}@${spec}`);
  const packages = (lock.packages ?? {}) as Record<string, { version?: string }>;
  const locked = Object.keys(packages)
    .filter((key) => LOCKED_SCOPED.test(key))
    .sort();
  if (!locked.length) problems.push(`package-lock.json locks no ${SCOPE}* package`);
  for (const key of locked) {
    const at = packages[key]?.version;
    if (at !== version) problems.push(`${key} is locked at ${at ?? "no version"}`);
  }
  return problems;
}
