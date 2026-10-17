/**
 * ADR-0033 D: rewrites physical Tailwind utilities to logical ones (`ml-2` → `ms-2`, `text-right`
 * → `text-end`, `left-0` → `start-0`, `border-l` → `border-s`, `rounded-tr` → `rounded-se`, …) in
 * Studio and `@cloudhal/ui`, only on the lines the `rtl-logical` lint rule flags, so prose such as
 * "right-to-left" in comments is never touched.
 *
 *   node scripts/i18n-codemod/logical-utilities.ts            rewrite
 *   node scripts/i18n-codemod/logical-utilities.ts --dry-run  list the lines
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allFiles, REPO } from "../../apps/studio/scripts/design-lint.ts";
import { lintText } from "../../apps/studio/scripts/i18n-lint.ts";
import { logical } from "../../apps/studio/scripts/i18n-message-rules.ts";

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  for (const file of allFiles()) {
    const rel = path.relative(REPO, file);
    const source = readFileSync(file, "utf8");
    const lines = new Set(
      lintText(rel, source)
        .filter((v) => v.rule === "rtl-logical")
        .map((v) => v.line),
    );
    if (lines.size === 0) continue;
    const out = source
      .split("\n")
      .map((text, i) =>
        lines.has(i + 1)
          ? text.replace(
              /(["'`\s])([^"'`\s]+)(?=["'`\s])/g,
              (_m, before: string, token: string) => before + logical(token),
            )
          : text,
      )
      .join("\n");
    if (process.argv.includes("--dry-run")) console.log(`${rel}: lines ${[...lines].join(", ")}`);
    else writeFileSync(file, out);
  }
}
