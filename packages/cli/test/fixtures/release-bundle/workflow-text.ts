/**
 * The release workflows as text (no YAML dependency): the files are read as lines, jobs and
 * steps are found by indentation. Used by release-workflows.test.ts and release-bundle-sign.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (f: string) => readFileSync(path.join(ROOT, ".github/workflows", f), "utf8");
export const RELEASE = read("release.yml");
export const BUILD = read("bundle-build.yml");

/** A GitHub Actions expression `${{ inner }}` (written so, not as a JS template). */
export const gha = (inner: string) => ["$", "{{ ", inner, " }}"].join("");
export const OPEN = ["$", "{{"].join("");

export const indentOf = (l: string) => l.length - l.trimStart().length;
export const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

/** The lines of a block that starts at `header` (exact line) and ends at the next less-indented line. */
export function block(text: string, header: string): string {
  const start = text.split("\n").indexOf(header);
  if (start === -1) throw new Error(`no line ${JSON.stringify(header)}`);
  return blockAt(text.split("\n"), start);
}
export function blockAt(lines: readonly string[], start: number): string {
  const ind = indentOf(lines[start] as string);
  let end = start + 1;
  while (end < lines.length && (lines[end]?.trim() === "" || indentOf(lines[end] as string) > ind))
    end++;
  return lines.slice(start, end).join("\n");
}
export const job = (text: string, name: string) => block(text, `  ${name}:`);
/** The step whose `- name:` is `name` (up to the next step). */
export function step(jobText: string, name: string): string {
  const lines = jobText.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (start === -1) throw new Error(`no step ${name}`);
  const ind = indentOf(lines[start] as string);
  let end = start + 1;
  while (end < lines.length && !(indentOf(lines[end] as string) <= ind && lines[end]?.trim()))
    end++;
  return lines.slice(start, end).join("\n");
}
/** The body of every `run: |` block (and one-line `run:`) in `text`. */
export function runs(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const [i, l] of lines.entries()) {
    const m = /^(\s*)(?:- )?run: ?(.*)$/.exec(l);
    if (!m) continue;
    if (m[2] !== "|" && m[2] !== ">-") {
      out.push(m[2] as string);
      continue;
    }
    const ind = (m[1] as string).length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const x = lines[j] as string;
      if (x.trim() && indentOf(x) <= ind + (l.trimStart().startsWith("- ") ? 2 : 0)) break;
      body.push(x);
    }
    const strip = Math.min(...body.filter((x) => x.trim()).map(indentOf));
    out.push(body.map((x) => x.slice(strip)).join("\n"));
  }
  return out;
}
