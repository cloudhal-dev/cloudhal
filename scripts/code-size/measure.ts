/**
 * Code-size measurement shared by `scripts/code-size.ts` (the report) and `scripts/size-check.ts`
 * (the ratchet in `pnpm check`). Rules and limits: docs/engineering/code-structure.md.
 *
 * TypeScript 7 ships no in-process compiler API; `typescript/unstable/sync` drives the bundled
 * tsgo binary over IPC. One synthetic tsconfig lists every file with `noResolve`/`noLib`, so the
 * program is syntax-only and a full monorepo parse takes a few seconds.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Workspace roots that are measured. */
const ROOTS = ["packages", "apps", "starters", "crates", "scripts"];
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|jsx|astro|css|rs)$/;
/** Generated or vendored code: never measured, never baselined. */
const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /^packages\/core-contracts\/src\/generated\//,
  /^crates\/cloudhal-schema\/src\/generated\//,
  /^packages\/core-ts\/src\/generated\//,
  /^packages\/ui\/src\/blocks\/kumo\//,
  /\.d\.ts$/,
  /(^|\/)(vite|vitest|astro)\.config\.[cm]?[jt]s$/,
];
const TEST_FILE =
  /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/(test|tests|__tests__)\/)|(\/testing(-[\w-]+)?\.tsx?$)|(\/fixtures?\.tsx?$)/;
/**
 * Translation dictionaries (`<locale>.ts`, `lazy/<ns>.<locale>.ts`, one per registered language) are
 * data, not code: no line limit (the Studio bundle budget guards
 * their weight instead). docs/engineering/code-structure.md §8.
 */
const DATA_FILE =
  /^apps\/studio\/src\/i18n\/(lazy\/[\w-]+\.)?(?!locales\.ts$|namespaces\.ts$)[a-z]{2,3}(-[A-Za-z0-9]+)*\.ts$/;
const PARSED = /\.(ts|tsx|mts|cts|js|mjs|jsx)$/;

export type Lang = "ts" | "astro" | "css" | "rs" | "js";
export interface FileMetric {
  file: string;
  pkg: string;
  lang: Lang;
  test: boolean;
  /** A dictionary (DATA_FILE): measured and reported, never limited. */
  data: boolean;
  lines: number;
}
export interface FunctionMetric {
  file: string;
  /** Stable within a file: the chain of enclosing names, `#n` for repeats. */
  name: string;
  line: number;
  lines: number;
  params: number;
  /** Deepest if/for/while/do/switch/try nesting inside the body (else-if does not nest). */
  depth: number;
  /** McCabe: 1 + branches (if, ?:, case, loops, catch, &&, ||, ??). */
  complexity: number;
  test: boolean;
}
export interface StringMetric {
  file: string;
  owner: string;
  line: number;
  lines: number;
  /** Source characters: client modules are minified, so lines undercount them. */
  chars: number;
  tag: string;
}
export interface SwitchMetric {
  file: string;
  owner: string;
  line: number;
  lines: number;
  cases: number;
}
export interface Measurement {
  files: FileMetric[];
  functions: FunctionMetric[];
  strings: StringMetric[];
  switches: SwitchMetric[];
}

export const isTestFile = (file: string) => TEST_FILE.test(file);

export function packageOf(file: string): string {
  const [top, name] = file.split("/");
  return `${top}/${name}`;
}

function langOf(file: string): Lang {
  if (file.endsWith(".astro")) return "astro";
  if (file.endsWith(".css")) return "css";
  if (file.endsWith(".rs")) return "rs";
  if (/\.(js|mjs|jsx)$/.test(file)) return "js";
  return "ts";
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n : n + 1;
}

/** Tracked and untracked (not ignored) source files, repo-relative, sorted. */
export function listSourceFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...ROOTS],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(out.split("\n"))]
    .filter((f) => f && EXTENSIONS.test(f) && !IGNORED.some((re) => re.test(f)))
    .filter((f) => {
      try {
        readFileSync(path.join(ROOT, f));
        return true;
      } catch {
        return false; // deleted in the working tree
      }
    })
    .sort();
}

export function measure(files = listSourceFiles()): Measurement {
  const result: Measurement = { files: [], functions: [], strings: [], switches: [] };
  for (const file of files) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    result.files.push({
      file,
      pkg: packageOf(file),
      lang: langOf(file),
      test: isTestFile(file),
      data: DATA_FILE.test(file),
      lines: countLines(text),
    });
  }
  const parsed = files.filter((f) => PARSED.test(f));
  if (parsed.length > 0) parseAll(parsed, result);
  return result;
}

function parseAll(files: string[], result: Measurement) {
  const config = path.join(ROOT, `.size-tsconfig.${process.pid}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        noResolve: true,
        noLib: true,
        allowJs: true,
        jsx: "preserve",
        types: [],
        noEmit: true,
      },
      files,
    }),
  );
  const api = new API({ cwd: ROOT });
  try {
    const project = api.updateSnapshot({ openProject: config }).getProject(config);
    if (!project) throw new Error("tsgo did not open the synthetic project");
    for (const file of files) {
      const sf = project.program.getSourceFile(path.join(ROOT, file));
      if (sf) new FileWalker(file, sf, result).run();
    }
  } finally {
    api.close();
    rmSync(config, { force: true });
  }
}

const FUNCTION_KINDS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);
const NESTING_KINDS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.TryStatement,
]);
const BRANCH_KINDS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.CaseClause,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
]);
const LOGICAL_OPERATORS = new Set([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);
const STRING_KINDS = new Set([
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.StringLiteral,
]);
/** Strings this long, or `String.raw` code of this many characters, count as embedded code. */
const STRING_REPORT_LINES = 30;
const RAW_REPORT_CHARS = 1000;
const SWITCH_REPORT_CASES = 15;

interface Frame {
  metric: FunctionMetric;
  depth: number;
}

// biome-ignore lint/suspicious/noExplicitAny: tsgo's AST nodes are typed per kind; the walker reads a few common fields.
type AnyNode = any;

class FileWalker {
  private readonly names = new Map<string, number>();
  private readonly scope: string[] = [];
  private readonly frames: Frame[] = [];
  private readonly file: string;
  private readonly sf: SourceFile;
  private readonly out: Measurement;
  private readonly test: boolean;

  constructor(file: string, sf: SourceFile, out: Measurement) {
    this.file = file;
    this.sf = sf;
    this.out = out;
    this.test = isTestFile(file);
  }

  run() {
    this.sf.forEachChild((child) => this.visit(child));
  }

  private lineOf(pos: number) {
    return this.sf.getLineAndCharacterOfPosition(pos).line + 1;
  }

  private span(node: Node) {
    const start = this.lineOf(node.getStart(this.sf));
    return { line: start, lines: this.lineOf(node.getEnd()) - start + 1 };
  }

  private owner() {
    return this.scope.join(">") || "<module>";
  }

  private visit(node: Node): void {
    const n = node as AnyNode;
    const frame = this.frames.at(-1);
    if (frame && BRANCH_KINDS.has(node.kind)) frame.metric.complexity++;
    if (frame && node.kind === SyntaxKind.BinaryExpression) {
      if (LOGICAL_OPERATORS.has(n.operatorToken.kind)) frame.metric.complexity++;
    }
    if (STRING_KINDS.has(node.kind)) this.recordString(node);
    if (node.kind === SyntaxKind.SwitchStatement) this.recordSwitch(node);

    if (FUNCTION_KINDS.has(node.kind)) {
      this.visitFunction(node);
      return;
    }
    if (node.kind === SyntaxKind.ClassDeclaration && n.name) {
      this.scope.push(n.name.getText(this.sf));
      node.forEachChild((child) => this.visit(child));
      this.scope.pop();
      return;
    }
    const nests =
      frame &&
      NESTING_KINDS.has(node.kind) &&
      !(
        node.kind === SyntaxKind.IfStatement &&
        node.parent.kind === SyntaxKind.IfStatement &&
        (node.parent as AnyNode).elseStatement === node
      );
    if (nests) {
      frame.depth++;
      frame.metric.depth = Math.max(frame.metric.depth, frame.depth);
    }
    node.forEachChild((child) => this.visit(child));
    if (nests) frame.depth--;
  }

  private visitFunction(node: Node) {
    const base = [...this.scope, this.functionName(node)].join(">");
    const seen = (this.names.get(base) ?? 0) + 1;
    this.names.set(base, seen);
    const name = seen === 1 ? base : `${base}#${seen}`;
    const params = ((node as AnyNode).parameters ?? []).filter(
      (p: AnyNode) => p.name?.getText?.(this.sf) !== "this",
    ).length;
    const metric: FunctionMetric = {
      file: this.file,
      name,
      ...this.span(node),
      params,
      depth: 0,
      complexity: 1,
      test: this.test,
    };
    this.out.functions.push(metric);
    this.scope.push(name.slice(name.lastIndexOf(">") + 1));
    this.frames.push({ metric, depth: 0 });
    node.forEachChild((child) => this.visit(child));
    this.frames.pop();
    this.scope.pop();
  }

  private functionName(node: Node): string {
    const n = node as AnyNode;
    if (node.kind === SyntaxKind.Constructor) return "constructor";
    if (n.name) return n.name.getText(this.sf);
    const parent = node.parent as AnyNode;
    switch (parent.kind) {
      case SyntaxKind.VariableDeclaration:
      case SyntaxKind.PropertyAssignment:
      case SyntaxKind.PropertyDeclaration:
      case SyntaxKind.JsxAttribute:
        return parent.name.getText(this.sf);
      case SyntaxKind.ExportAssignment:
        return "default";
      case SyntaxKind.CallExpression:
        return `${this.calleeLabel(parent)}(cb)`;
      default:
        return "<anonymous>";
    }
  }

  private calleeLabel(call: AnyNode): string {
    const callee = call.expression.getText(this.sf).replace(/\s+/g, "");
    const first = call.arguments?.[0];
    const label =
      first && first.kind === SyntaxKind.StringLiteral
        ? `${callee}(${first.getText(this.sf)})`
        : callee;
    return label.length > 80 ? `${label.slice(0, 77)}...` : label;
  }

  private recordString(node: Node) {
    const span = this.span(node);
    const chars = node.getEnd() - node.getStart(this.sf);
    const parent = node.parent as AnyNode;
    const tag =
      parent.kind === SyntaxKind.TaggedTemplateExpression ? parent.tag.getText(this.sf) : "";
    if (span.lines < STRING_REPORT_LINES && !(tag === "String.raw" && chars >= RAW_REPORT_CHARS))
      return;
    const owner = this.stringOwner(node);
    this.out.strings.push({ file: this.file, owner, tag, chars, ...span });
  }

  private stringOwner(node: Node): string {
    for (let p = node.parent as AnyNode; p; p = p.parent) {
      if (p.kind === SyntaxKind.VariableDeclaration || p.kind === SyntaxKind.PropertyAssignment)
        return [...this.scope, p.name.getText(this.sf)].join(">");
      if (FUNCTION_KINDS.has(p.kind)) break;
    }
    return this.owner();
  }

  private recordSwitch(node: Node) {
    const cases = (node as AnyNode).caseBlock.clauses.length;
    const span = this.span(node);
    if (cases < SWITCH_REPORT_CASES && span.lines < 150) return;
    this.out.switches.push({ file: this.file, owner: this.owner(), cases, ...span });
  }
}
