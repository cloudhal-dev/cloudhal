/**
 * Generates `patches/@cloudflare__kumo@<version>.patch`, the one `pnpm patch` Kumo gets (pnpm takes
 * one patch per package version), from:
 * - the hand-written changes in `patches/kumo/*.patch` (today `tooltip-timestamp.patch`, DESIGN.md
 *   §2v "Kumo locale"), applied in name order;
 * - ADR-0033 A1: every physical Tailwind utility in Kumo's compiled `dist/**\/*.js` rewritten to
 *   its logical twin (`ml-2` → `ms-2`, `left-0` → `start-0`, `text-right` → `text-end`, …) with
 *   the mapping Studio's own codemod and lint use (`logical` in
 *   `apps/studio/scripts/i18n-message-rules.ts`), so Kumo mirrors in right-to-left languages.
 *
 *   node scripts/kumo-patch.ts            regenerate the patch (then `pnpm install`)
 *   node scripts/kumo-patch.ts --stats    also print what was converted
 *   node scripts/kumo-patch.ts --verify   check the installed Kumo (packages/ui/test/kumo-rtl.test.ts)
 *
 * Re-run it after every Kumo upgrade (rename the patch and the `patchedDependencies` entry for the
 * new version first). `packages/ui/test/kumo-rtl.test.ts` (`--verify`) fails when the installed Kumo still has
 * physical utilities, i.e. when the patch no longer applies or was not regenerated; `pnpm install`
 * itself fails when a hand-written hunk no longer applies. Drop the RTL part once Kumo ships
 * logical properties (`docs/design/kumo-upstream-notes.md` §7).
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logical, PHYSICAL } from "../apps/studio/scripts/i18n-message-rules.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(ROOT, "patches/kumo");

const version = (): string => {
  const lock = readFileSync(path.join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const m = /'@cloudflare\/kumo@([\d.]+)':\s*patches\//.exec(lock);
  if (!m?.[1]) throw new Error("no @cloudflare/kumo entry in patchedDependencies");
  return m[1];
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.js$/.test(name) ? [p] : [];
  });
}

/** A class-list-like string in compiled JS: its physical tokens converted. */
export function convertSource(source: string): { text: string; tokens: Map<string, number> } {
  const tokens = new Map<string, number>();
  const text = source.replace(
    /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g,
    (whole, quote: string, body: string, at: number) => {
      const lineStart = source.lastIndexOf("\n", at) + 1;
      const lineEnd = source.indexOf("\n", at);
      const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
      if (!/[a-z]-/.test(body)) return whole;
      // An offset that is centred (`left-1/2`) or that a physical x-translation measures from
      // (`translate-x-(--active-tab-left)`, `-translate-x-1/2`, anywhere on the same line — one `cn(…)` call)
      // stays physical: either it reads the
      // same both ways, or JavaScript placed it in left-to-right coordinates.
      const translated = /(^|[\s:"'`])-?translate-x-/.test(line);
      const out = body.replace(
        /(^|\s)([^\s"'`]+)(?=\s|$)/g,
        (_m, before: string, token: string) => {
          const bare = token.replace(/^(?:[^:\s[\]]+:)+/, "").replace(/^!/, "");
          if (!PHYSICAL.test(bare)) return before + token;
          if (/^-?(left|right)-/.test(bare) && (translated || /-1\/2$/.test(bare)))
            return before + token;
          tokens.set(bare, (tokens.get(bare) ?? 0) + 1);
          return before + logical(token);
        },
      );
      return quote + out + quote;
    },
  );
  return { text, tokens };
}

function main() {
  const v = version();
  const tmp = mkdtempSync(path.join(tmpdir(), "kumo-patch-"));
  try {
    const base = path.join(tmp, "base");
    const edit = path.join(tmp, "edit");
    execFileSync(
      "pnpm",
      ["patch", `@cloudflare/kumo@${v}`, "--edit-dir", base, "--ignore-existing", "-y"],
      {
        cwd: ROOT,
        stdio: "ignore",
      },
    );
    cpSync(base, edit, { recursive: true });
    for (const p of readdirSync(SOURCES)
      .filter((f) => f.endsWith(".patch"))
      .sort())
      execFileSync("git", ["apply", "--unsafe-paths", path.join(SOURCES, p)], { cwd: edit });
    const totals = new Map<string, number>();
    for (const file of walk(path.join(edit, "dist"))) {
      const { text, tokens } = convertSource(readFileSync(file, "utf8"));
      for (const [t, n] of tokens) totals.set(t, (totals.get(t) ?? 0) + n);
      writeFileSync(file, text);
    }
    let diff = "";
    try {
      execFileSync("git", ["diff", "--no-index", "--no-prefix", "base", "edit"], {
        cwd: tmp,
        encoding: "utf8",
      });
    } catch (error) {
      diff = (error as { stdout: string }).stdout; // exit 1: there are differences
    }
    diff = diff
      .replace(/^diff --git base\/(\S+) edit\/(\S+)$/gm, "diff --git a/$1 b/$2")
      .replace(/^--- base\//gm, "--- a/")
      .replace(/^\+\+\+ edit\//gm, "+++ b/");
    const target = path.join(ROOT, `patches/@cloudflare__kumo@${v}.patch`);
    writeFileSync(target, diff);
    const count = [...totals.values()].reduce((a, b) => a + b, 0);
    console.log(
      `wrote ${path.relative(ROOT, target)}: ${count} physical utilities made logical; run pnpm install`,
    );
    if (process.argv.includes("--stats"))
      for (const [t, n] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${t}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * What is wrong with the installed Kumo: physical utilities the patch should have converted (it was
 * not regenerated for this Kumo, or did not apply), or a hand-written change that is missing.
 */
export function verifyInstalled(): string[] {
  const dir = path.dirname(
    createRequire(path.join(ROOT, "packages/ui/package.json")).resolve(
      "@cloudflare/kumo/package.json",
    ),
  );
  const problems: string[] = [];
  for (const file of walk(path.join(dir, "dist"))) {
    const { tokens } = convertSource(readFileSync(file, "utf8"));
    for (const [t, n] of tokens) problems.push(`${path.relative(dir, file)}: ${n}× ${t}`);
  }
  const chart = readdirSync(path.join(dir, "dist/chunks")).find((f) => f.startsWith("chart-"));
  const text = chart ? readFileSync(path.join(dir, "dist/chunks", chart), "utf8") : "";
  if (!text.includes("tooltipTimestampFormat"))
    problems.push("tooltip-timestamp.patch is not applied");
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--verify")) {
    const problems = verifyInstalled();
    if (problems.length) {
      console.error(
        `The installed Kumo is not patched as scripts/kumo-patch.ts generates it:\n  ${problems.slice(0, 20).join("\n  ")}\n` +
          "Run `node scripts/kumo-patch.ts` and `pnpm install` (ADR-0033 A1).",
      );
      process.exit(1);
    }
    console.log("kumo patch: installed Kumo is logical and carries the hand-written changes");
  } else main();
}
