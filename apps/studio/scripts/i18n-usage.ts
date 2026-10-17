/**
 * Which message keys Studio's code can reach (the i18n review's Phase 5): every string literal, and
 * every template literal as a pattern — a `const` bound to a string (`const a = "comments.approvals"
 * as const`) is resolved, anything else (`${mode}`) matches one or more key characters (scopes have colons). A key
 * that no literal and no pattern can produce is unused (`test/i18n-messages.test.ts`).
 *
 *   node apps/studio/scripts/i18n-usage.ts   lists the unused keys
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";

type Node = { type: string; [k: string]: unknown };
const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && typeof (v as Node).type === "string";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === "i18n" ? [] : walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The string a constant's initializer is, given the constants known so far, if any. */
function constantValue(init: Node | null, known: Map<string, string>): string | undefined {
  while (init && (init.type === "TSAsExpression" || init.type === "TSSatisfiesExpression"))
    init = init.expression as Node;
  if (init?.type === "Literal" && typeof init.value === "string") return init.value;
  if (init?.type !== "TemplateLiteral") return undefined;
  const quasis = init.quasis as Node[];
  const exprs = init.expressions as Node[];
  let out = "";
  for (const [i, q] of quasis.entries()) {
    out += (q.value as { cooked?: string }).cooked ?? "";
    const e = exprs[i];
    if (!e) continue;
    const bound = e.type === "Identifier" ? known.get(e.name as string) : undefined;
    if (bound === undefined) return undefined;
    out += bound;
  }
  return out;
}

/**
 * String constants of a file: `const x = "…"` (`as const` included) and templates of other such
 * constants (`` const d = `${c}.banDialog` ``), resolved until nothing changes.
 */
function constants(program: Node): Map<string, string> {
  const declarators: [string, Node | null][] = [];
  const visit = (node: Node) => {
    if (node.type === "VariableDeclarator" && isNode(node.id) && node.id.type === "Identifier")
      declarators.push([node.id.name as string, node.init as Node | null]);
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.filter(isNode).forEach(visit);
      else if (isNode(value)) visit(value);
  };
  visit(program);
  const out = new Map<string, string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, init] of declarators) {
      if (out.has(name)) continue;
      const value = constantValue(init, out);
      if (value !== undefined) {
        out.set(name, value);
        changed = true;
      }
    }
  }
  return out;
}

/** The literals and template patterns of every Studio source file outside `src/i18n`. */
export function references(): { literals: Set<string>; patterns: RegExp[] } {
  const literals = new Set<string>();
  const patterns: RegExp[] = [];
  for (const file of walk(SRC)) {
    const program = parseAst(readFileSync(file, "utf8"), {
      lang: file.endsWith(".tsx") ? "tsx" : "ts",
    }) as unknown as Node;
    const consts = constants(program);
    const visit = (node: Node) => {
      if (node.type === "Literal" && typeof node.value === "string") literals.add(node.value);
      if (node.type === "TemplateLiteral") {
        const quasis = node.quasis as Node[];
        const exprs = node.expressions as Node[];
        let source = "";
        quasis.forEach((q, i) => {
          source += escapeRegExp((q.value as { cooked?: string }).cooked ?? "");
          const e = exprs[i];
          if (!e) return;
          const bound = e.type === "Identifier" ? consts.get(e.name as string) : undefined;
          source += bound !== undefined ? escapeRegExp(bound) : "[\\w.:-]+";
        });
        // A pattern needs some key text of its own: `${ns}.${key}` would match every key.
        const literal = source.replaceAll("[\\w.:-]+", "").replaceAll("\\.", ".");
        if (/[A-Za-z]{2,}/.test(literal) && literal.includes("."))
          patterns.push(new RegExp(`^${source}$`));
      }
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.filter(isNode).forEach(visit);
        else if (isNode(value)) visit(value);
    };
    visit(program);
  }
  return { literals, patterns };
}

/**
 * The keys among `keys` that Studio's code cannot reach. A literal that names a group of keys
 * (`"analytics.channels"`, handed to a helper that adds `.${value}`) reaches the whole group.
 */
export function unusedKeys(keys: Iterable<string>): string[] {
  const { literals, patterns } = references();
  const groups = [...literals].filter((l) => /^[\w-]+(\.[\w-]+)+$/.test(l)).map((l) => `${l}.`);
  return [...keys].filter(
    (k) =>
      !literals.has(k) && !patterns.some((p) => p.test(k)) && !groups.some((g) => k.startsWith(g)),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { en } = (await import("../src/i18n/en.ts")) as { en: object };
  const leaves = (o: object, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === "string" ? [`${p}${k}`] : leaves(v as object, `${p}${k}.`),
    );
  const keys = leaves(en);
  for (const f of readdirSync(path.join(SRC, "i18n/lazy")).filter((f) => f.endsWith(".en.ts"))) {
    const mod = (await import(path.join(SRC, "i18n/lazy", f))) as { messages: object };
    keys.push(...leaves(mod.messages));
  }
  for (const k of unusedKeys(keys)) console.log(k);
}
