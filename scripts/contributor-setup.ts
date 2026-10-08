/**
 * Prints the shell commands in CONTRIBUTING.md's "## Setup" block, so CI runs exactly what a new
 * contributor is told to run (the 30-minute promise) and the document cannot drift from reality.
 *
 *   node scripts/contributor-setup.ts            # print the commands
 *   node scripts/contributor-setup.ts | bash -euo pipefail
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The first fenced bash block after the given heading, without comments or blank lines. */
export function setupCommands(markdown: string, heading = "## Setup"): string[] {
  const start = markdown.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`CONTRIBUTING.md has no "${heading}" section`);
  const fence = /```(?:bash|sh)\n([\s\S]*?)```/.exec(markdown.slice(start));
  if (!fence?.[1]) throw new Error(`"${heading}" has no bash block`);
  return fence[1]
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("#"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = await readFile(path.join(root, "CONTRIBUTING.md"), "utf8");
  process.stdout.write(`${setupCommands(md).join("\n")}\n`);
}
