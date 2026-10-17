/**
 * Read-only i18n audit of Studio: catalog sizes, placeholder parity, plural workarounds, `Intl`
 * use, physical vs logical CSS, hard-coded English and unused keys. Feeds
 * docs/reports/2026-10-studio-i18n-review.md; changes nothing.
 *
 *   node scripts/i18n-audit.ts [--json] [--list=<section>]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const I18N = join(ROOT, "apps/studio/src/i18n");
const SCAN = ["apps/studio/src", "packages/ui/src"];

type Tree = { [k: string]: string | Tree };
interface Catalog {
  name: string;
  file: string;
  locale: string;
  tree: Tree;
}

const leaves = (t: Tree, p = ""): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${p}${k}`, v] as [string, string]] : leaves(v, `${p}${k}.`),
  );
const depth = (t: Tree): number =>
  1 + Math.max(0, ...Object.values(t).map((v) => (typeof v === "string" ? 0 : depth(v))));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

async function catalogs(): Promise<Catalog[]> {
  const out: Catalog[] = [];
  for (const locale of ["en", "tr"]) {
    const mod = await import(join(I18N, `${locale}.ts`));
    out.push({ name: "core", file: `${locale}.ts`, locale, tree: mod[locale] });
  }
  for (const f of readdirSync(join(I18N, "lazy")).sort()) {
    const [ns, locale] = f.split(".");
    const mod = await import(join(I18N, "lazy", f));
    out.push({ name: ns ?? f, file: `lazy/${f}`, locale: locale ?? "", tree: mod.messages });
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "i18n" || f === "node_modules" ? [] : walk(p);
    return /\.(tsx?|css)$/.test(f) && !/\.(test|stories)\./.test(f) ? [p] : [];
  });
}

interface Hit {
  file: string;
  line: number;
  text: string;
}
function grep(files: string[], re: RegExp, skip?: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, i) => {
        if (re.test(text) && !skip?.test(text))
          hits.push({ file: relative(ROOT, file), line: i + 1, text: text.trim().slice(0, 140) });
      });
  }
  return hits;
}

/** Tailwind physical (left/right) vs logical (start/end) utilities. */
const PHYSICAL =
  /(?<![\w-])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right|scroll-ml|scroll-mr)(-|\b)(?![\w-]*[:=])/g;
const LOGICAL =
  /(?<![\w-])-?(ms|me|ps|pe|start|end|border-s|border-e|rounded-s|rounded-e|rounded-ss|rounded-se|rounded-es|rounded-ee|text-start|text-end|float-start|float-end)-[\w[\]./%-]+/g;
const CSS_PHYSICAL = /\b(margin|padding|border)-(left|right)\b|(?<![-\w])(left|right)\s*:/;
const CSS_LOGICAL = /\b(margin|padding|border|inset)-(inline|block)(-start|-end)?\b/;

function classTokens(files: string[], re: RegExp): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of files.filter((x) => x.endsWith(".tsx"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{[^}]*?"([^"]*)")/g)) {
      const cls = m[1] ?? m[2] ?? m[3] ?? "";
      for (const token of cls.split(/\s+/)) {
        const bare = token.replace(/^([\w-]+:)+/, "");
        const hit = bare.match(new RegExp(`^${re.source.slice(re.source.indexOf("-?("))}`));
        if (hit) counts.set(hit[1] ?? bare, (counts.get(hit[1] ?? bare) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function audit(cats: Catalog[], files: string[]) {
  const byName = Map.groupBy(cats, (c) => c.name);
  const catalogRows = [...byName].map(([name, [en, tr]]) => {
    const enL = leaves(en?.tree ?? {});
    const trL = new Map(leaves(tr?.tree ?? {}));
    const bytes = (c?: Catalog) => (c ? readFileSync(join(I18N, c.file)) : Buffer.alloc(0));
    const mismatch = enL.filter(
      ([k, v]) => placeholders(v).join() !== placeholders(trL.get(k) ?? "").join(),
    );
    return {
      name,
      keys: enL.length,
      depth: depth(en?.tree ?? {}) - (name === "core" ? 0 : 1),
      withParams: enL.filter(([, v]) => placeholders(v).length > 0).length,
      enKb: +(bytes(en).length / 1024).toFixed(1),
      enGzKb: +(gzipSync(bytes(en)).length / 1024).toFixed(1),
      trKb: +(bytes(tr).length / 1024).toFixed(1),
      trGzKb: +(gzipSync(bytes(tr)).length / 1024).toFixed(1),
      pluralPairs: enL.filter(([k]) => /(One|Many)$/.test(k) || /\.titleOne\./.test(k)).length,
      paramMismatch: mismatch.map(([k]) => k),
    };
  });
  const allKeys = cats
    .filter((c) => c.locale === "en")
    .flatMap((c) => leaves(c.tree).map(([k]) => k));
  const source = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const literals = new Set([...source.matchAll(/["'`]([\w.]+)["'`]/g)].map((m) => m[1]));
  const prefixes = [...source.matchAll(/`([\w.]+)\.\$\{/g)].map((m) => `${m[1]}.`);
  const tails = [...source.matchAll(/\}\.([\w.]+)`/g)].map((m) => `.${m[1]}`);
  const unused = allKeys.filter(
    (k) =>
      !literals.has(k) &&
      !prefixes.some((p) => k.startsWith(p)) &&
      !tails.some((t) => k.endsWith(t)) &&
      !literals.has(k.split(".").slice(0, -1).join(".")),
  );
  const ts = files.filter((f) => !f.endsWith(".css"));
  const css = files.filter((f) => f.endsWith(".css"));
  const studio = ts.filter((f) => f.includes("apps/studio"));
  const ui = ts.filter((f) => f.includes("packages/ui"));
  const tCalls = [...source.matchAll(/\bt\(\s*(["'`])/g)];
  return {
    catalogRows,
    totalKeys: allKeys.length,
    tCalls: tCalls.length,
    tDynamic: tCalls.filter((m) => m[1] === "`").length,
    tByVariable: grep(ts, /\bt\(\s*[a-z]\w*(\s*[,)])/).length,
    unused,
    plurals: {
      countTernaries: grep(ts, /(===|!==|>|<)\s*[01]\s*\?[^:]*\bt\(|\bplural\(t,/),
      oneOtherCallSites: grep(ts, /t\([`"'][\w.${}]*(One|Many)[`"']/),
      concat: grep(ts, /\bt\([^)]*\)\s*\+\s*["'`(]|["'`]\s*\+\s*t\(/),
      joinedFragments: grep(ts, /t\([^)]*\)\}\s*\{t\(|\.join\(["'`][,;·] ?["'`]\)/),
    },
    intl: Object.fromEntries(
      [
        "PluralRules",
        "NumberFormat",
        "DateTimeFormat",
        "RelativeTimeFormat",
        "Collator",
        "ListFormat",
        "DisplayNames",
        "Segmenter",
      ].map((n) => [n, grep(ts, new RegExp(`Intl\\.${n}\\(`)).length]),
    ),
    toLocale: grep(ts, /\.toLocale(String|DateString|TimeString)\(\s*\)/),
    toLocaleWithArg: grep(ts, /\.toLocale(String|DateString|TimeString)\(\s*\S/).length,
    localeCompare: grep(ts, /localeCompare\(/),
    hardLocale: grep(
      ts,
      /["'](en-US|en-GB|en|tr-TR)["']/,
      /^\s*(\/\/|\*|import)|LOCALES|locale ===|=== "en"/,
    ),
    sortNoCollator: grep(ts, /\.sort\(\)/),
    rtl: {
      studioPhysical: Object.fromEntries(classTokens(studio, PHYSICAL)),
      studioLogical: Object.fromEntries(classTokens(studio, LOGICAL)),
      uiPhysical: Object.fromEntries(classTokens(ui, PHYSICAL)),
      uiLogical: Object.fromEntries(classTokens(ui, LOGICAL)),
      cssPhysical: grep(css, CSS_PHYSICAL).length,
      cssLogical: grep(css, CSS_LOGICAL).length,
      dir: grep(ts, /\bdir=|\.dir\s*=|documentElement\.dir|"rtl"|'rtl'/),
      directionalIcons: grep(
        ts,
        /<(Caret|Arrow)(Left|Right)\b|Icon=\{(Caret|Arrow)(Left|Right)\}|(Caret|Arrow)(Left|Right)(Icon)?\b(?=[,\s}])/,
      ).length,
    },
    english: {
      studioJsxText: grep(studio, />\s*[A-Z][a-z]+(\s+[a-z]+)+[.…]?\s*</, /^\s*(\/\/|\*)/),
      studioAttrs: grep(studio, /\b(aria-label|placeholder|title|label|alt)="[A-Z][a-z]+[^"]*"/),
      uiJsxText: grep(ui, />\s*[A-Z][a-z]+(\s+[a-z]+)*[.…]?\s*</, /^\s*(\/\/|\*)|Promise</),
      uiAttrs: grep(ui, /\b(aria-label|placeholder|title|alt)="[A-Z][a-z]+[^"]*"/),
      uiDefaults: grep(ui, /(label|Label|words|title|text)\s*=\s*"[A-Z][a-z]+[^"]*"\s*[,)}]/),
    },
  };
}

const cats = await catalogs();
const files = SCAN.flatMap((d) => walk(join(ROOT, d)));
const r = audit(cats, files);
const list = process.argv.find((a) => a.startsWith("--list="))?.slice(7);

if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
else if (list) {
  const path = list.split(".");
  let v: unknown = r;
  for (const p of path) v = (v as Record<string, unknown>)[p];
  for (const h of v as (Hit | string)[])
    console.log(typeof h === "string" ? h : `${h.file}:${h.line}  ${h.text}`);
} else {
  console.table(
    r.catalogRows.map(({ paramMismatch, ...row }) => ({
      ...row,
      paramMismatch: paramMismatch.length,
    })),
  );
  const n = (x: unknown) => (Array.isArray(x) ? x.length : x);
  console.log({
    totalKeys: r.totalKeys,
    tCalls: r.tCalls,
    tDynamic: r.tDynamic,
    tByVariable: r.tByVariable,
    unused: r.unused.length,
    plurals: Object.fromEntries(Object.entries(r.plurals).map(([k, v]) => [k, n(v)])),
    intl: r.intl,
    toLocaleNoArg: r.toLocale.length,
    toLocaleWithArg: r.toLocaleWithArg,
    localeCompare: r.localeCompare.length,
    hardLocale: r.hardLocale.length,
    sortNoCollator: r.sortNoCollator.length,
    rtl: { ...r.rtl, dir: r.rtl.dir.length },
    english: Object.fromEntries(Object.entries(r.english).map(([k, v]) => [k, v.length])),
  });
}
