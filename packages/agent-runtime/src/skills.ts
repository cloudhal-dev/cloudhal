import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertValid, type SkillManifest } from "@cloudhal/core-contracts";

export interface LoadedSkill {
  manifest: SkillManifest;
  /** Directory of the skill. */
  dir: string;
  /** Markdown body (after the frontmatter). Loaded lazily via `body()` for progressive disclosure. */
  body: () => Promise<string>;
  /** The full SKILL.md source (frontmatter included), as served over MCP resources. */
  source: () => Promise<string>;
  references: () => Promise<string[]>;
  /** Reads one file from `references/` by name; throws for names outside that directory. */
  reference: (name: string) => Promise<string>;
  cloudhal: {
    schemaVersion: number;
    requiresCapabilities: string[];
    scopes: string[];
    approval: string[];
  };
}

export class SkillError extends Error {
  override readonly name = "SkillError";
}

/** Minimal YAML frontmatter parser for the six spec fields (strings and a flat string map). */
export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new SkillError("SKILL.md must start with YAML frontmatter");
  const fm: Record<string, unknown> = {};
  let currentMap: Record<string, string> | undefined;
  for (const raw of (m[1] as string).split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const nested = raw.match(/^\s+([^:]+):\s*(.*)$/);
    if (nested && currentMap) {
      currentMap[nested[1] as string] = unquote((nested[2] as string).trim());
      continue;
    }
    const top = raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!top) throw new SkillError(`invalid frontmatter line: ${raw}`);
    const [, key, value] = top as unknown as [string, string, string];
    if (value.trim() === "") {
      currentMap = {};
      fm[key] = currentMap;
    } else {
      currentMap = undefined;
      fm[key] = unquote(value.trim());
    }
  }
  return { frontmatter: fm, body: m[2] as string };
}

function unquote(v: string): string {
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    ? v.slice(1, -1)
    : v;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Loads one skill directory: validates the manifest against the `SkillManifest` contract and the `cloudhal.*` metadata keys. */
export async function loadSkill(dir: string): Promise<LoadedSkill> {
  const file = path.join(dir, "SKILL.md");
  const markdown = await readFile(file, "utf8");
  const { frontmatter, body } = parseFrontmatter(markdown);
  assertValid("skill-manifest", frontmatter);
  const manifest = frontmatter;
  if (manifest.name !== path.basename(dir))
    throw new SkillError(
      `skill name "${manifest.name}" must match directory "${path.basename(dir)}"`,
    );
  const meta = manifest.metadata ?? {};
  const schemaVersion = Number(meta["cloudhal.schemaVersion"] ?? "1");
  if (schemaVersion !== 1)
    throw new SkillError(`${manifest.name}: unsupported cloudhal.schemaVersion ${schemaVersion}`);
  return {
    manifest,
    dir,
    body: async () => body,
    source: async () => markdown,
    reference: async (name) => {
      if (name !== path.basename(name) || !name.endsWith(".md"))
        throw new SkillError(`invalid reference name "${name}"`);
      return readFile(path.join(dir, "references", name), "utf8");
    },
    references: async () => {
      const refDir = path.join(dir, "references");
      try {
        if (!(await stat(refDir)).isDirectory()) return [];
        return (await readdir(refDir)).filter((f) => f.endsWith(".md")).sort();
      } catch {
        return [];
      }
    },
    cloudhal: {
      schemaVersion,
      requiresCapabilities: list(meta["cloudhal.requiresCapabilities"]),
      scopes: list(meta["cloudhal.scopes"]),
      approval: list(meta["cloudhal.approval"]),
    },
  };
}

/** Loads every skill under `root` (one directory per skill). Sorted by name for deterministic listings. */
export async function loadSkills(root: string): Promise<LoadedSkill[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const skills = await Promise.all(
    entries.filter((e) => e.isDirectory()).map((e) => loadSkill(path.join(root, e.name))),
  );
  return skills.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}
