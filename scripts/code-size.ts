/**
 * Code-size report: oversized files per package, long/deep/complex functions, embedded code
 * strings, giant switches and size × churn risk. Feeds the code-size report.
 *
 *   node scripts/code-size.ts [--since=60.days] [--top=40] [--json]
 */
import { churnSince } from "./code-size/churn.ts";
import { FUNCTION_LIMITS, fileLimit } from "./code-size/limits.ts";
import { type FileMetric, type FunctionMetric, measure } from "./code-size/measure.ts";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const since = arg("since", "60.days");
const top = Number(arg("top", "40"));

const m = measure();
const churn = churnSince(since);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...m, churn: Object.fromEntries(churn) }));
  process.exit(0);
}

const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map((_, i) => (rows.every((r) => typeof r[i] === "number") ? "---:" : "---")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
const code = (s: string) => `\`${s.replaceAll("|", "\\|")}\``;
const count = <T>(xs: T[], p: (x: T) => boolean) => xs.filter(p).length;

const src = m.files.filter((f) => !f.test);
const tests = m.files.filter((f) => f.test);
const fns = m.functions.filter((f) => !f.test);

console.log("## Totals\n");
const langs = ["ts", "js", "astro", "css", "rs"] as const;
console.log(
  table(
    ["kind", "Files", "Lines", "> 500", "> 1000", "Over hard limit"],
    [
      ...langs.map((lang) => {
        const xs = src.filter((f) => f.lang === lang);
        return [
          lang,
          xs.length,
          xs.reduce((a, f) => a + f.lines, 0),
          count(xs, (f) => f.lines > 500),
          count(xs, (f) => f.lines > 1000),
          count(xs, (f) => f.lines > fileLimit(f).hard),
        ];
      }),
      [
        "tests",
        tests.length,
        tests.reduce((a, f) => a + f.lines, 0),
        count(tests, (f) => f.lines > 500),
        count(tests, (f) => f.lines > 1000),
        count(tests, (f) => f.lines > fileLimit(f).hard),
      ],
    ],
  ),
);

const fileRows = (xs: FileMetric[]) =>
  xs
    .sort((a, b) => a.pkg.localeCompare(b.pkg) || b.lines - a.lines)
    .map((f) => [
      f.pkg,
      code(f.file.slice(f.pkg.length + 1)),
      f.lines,
      f.data ? "data (no limit)" : f.lines > 1000 ? "●" : "",
    ]);
console.log("\n## Source files over 500 lines (● over 1000)\n");
console.log(
  table(["package", "file", "Lines", ">1000"], fileRows(src.filter((f) => f.lines > 500))),
);
console.log("\n## Test files over 500 lines\n");
console.log(
  table(["package", "file", "Lines", ">1000"], fileRows(tests.filter((f) => f.lines > 500))),
);

console.log("\n## Functions\n");
console.log(
  table(
    ["measure", "> soft", "> hard", "Max"],
    (["lines", "depth", "params", "complexity"] as const).map((k) => [
      `${k} (soft ${FUNCTION_LIMITS[k].soft}, hard ${FUNCTION_LIMITS[k].hard})`,
      count(fns, (f) => f[k] > FUNCTION_LIMITS[k].soft),
      count(fns, (f) => f[k] > FUNCTION_LIMITS[k].hard),
      Math.max(...fns.map((f) => f[k])),
    ]),
  ),
);
const fnRows = (xs: FunctionMetric[]) =>
  xs.map((f) => [
    code(`${f.file}:${f.line}`),
    code(f.name),
    f.lines,
    f.depth,
    f.params,
    f.complexity,
  ]);
const head = ["where", "function", "Lines", "Depth", "Params", "CC"];
console.log(`\n### Longest functions (> ${FUNCTION_LIMITS.lines.hard} lines, top ${top})\n`);
console.log(
  table(
    head,
    fnRows(
      fns
        .filter((f) => f.lines > FUNCTION_LIMITS.lines.hard)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, top),
    ),
  ),
);
console.log(`\n### Functions over 80 lines per package\n`);
const byPkg = new Map<string, [number, number]>();
for (const f of fns) {
  const pkg = f.file.split("/").slice(0, 2).join("/");
  const e = byPkg.get(pkg) ?? [0, 0];
  if (f.lines > 80) e[0]++;
  if (f.lines > 150) e[1]++;
  byPkg.set(pkg, e);
}
console.log(
  table(
    ["package", "> 80", "> 150"],
    [...byPkg]
      .filter(([, [a]]) => a > 0)
      .sort((a, b) => b[1][0] - a[1][0])
      .map(([p, [a, b]]) => [p, a, b]),
  ),
);
console.log("\n### Deepest nesting (depth ≥ 5)\n");
console.log(table(head, fnRows(fns.filter((f) => f.depth >= 5).sort((a, b) => b.depth - a.depth))));
console.log("\n### Highest cyclomatic complexity (top 20)\n");
console.log(table(head, fnRows([...fns].sort((a, b) => b.complexity - a.complexity).slice(0, 20))));

console.log("\n## Embedded strings (≥ 30 lines, or String.raw code ≥ 1000 chars)\n");
console.log(
  table(
    ["where", "owner", "Lines", "Chars", "tag"],
    m.strings
      .sort((a, b) => b.chars - a.chars)
      .map((s) => [
        code(`${s.file}:${s.line}`),
        code(s.owner),
        s.lines,
        s.chars,
        s.tag && code(s.tag),
      ]),
  ),
);
console.log("\n## Switch statements (≥ 15 cases or ≥ 150 lines)\n");
console.log(
  table(
    ["where", "owner", "Cases", "Lines"],
    m.switches
      .sort((a, b) => b.cases - a.cases)
      .map((s) => [code(`${s.file}:${s.line}`), code(s.owner), s.cases, s.lines]),
  ),
);

console.log(`\n## Risk = lines × commits (git log --since=${since}, files > 500 lines)\n`);
const risky = src
  .filter((f) => f.lines > 500)
  .map((f) => {
    const c = churn.get(f.file) ?? { commits: 0, added: 0, deleted: 0 };
    const longest = Math.max(0, ...fns.filter((x) => x.file === f.file).map((x) => x.lines));
    return { f, c, longest, risk: f.lines * c.commits };
  })
  .sort((a, b) => b.risk - a.risk)
  .slice(0, top);
console.log(
  table(
    ["#", "file", "Lines", "Commits", "Churn (+/−)", "Longest fn", "Risk"],
    risky.map((r, i) => [
      i + 1,
      code(r.f.file),
      r.f.lines,
      r.c.commits,
      `+${r.c.added} / −${r.c.deleted}`,
      r.longest || "—",
      r.risk,
    ]),
  ),
);
