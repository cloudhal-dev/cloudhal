/**
 * The message rules of RFC-0032 §5.5, beside the hard-coded-words rule (`i18n-lint.ts`):
 * - `i18n-plural`: a choice between two messages by whether a number is 1
 *   (`n === 1 ? t(a) : t(b)`) is a plural written by hand — one `plural` message, `t(k, { count })`;
 * - `i18n-concat`: a sentence assembled from several messages (`${t(a)} ${t(b)}`, `t(a) + t(b)`,
 *   `{t(a)} {t(b)}` in JSX) or a list joined with a comma (`items.join(", ")`) — one message, or
 *   `listOf(items)`.
 * - `i18n-format`: a formatter built on the spot (`new Intl.DateTimeFormat(…)`, `n.toLocaleString(…)`)
 *   instead of the cached, locale-taking layer in `@cloudhal/messages/format` (`formatDate`,
 *   `formatNumber`, `numberFormat`, …) — the i18n review's Phase 2.
 * - `rtl-logical`: a physical Tailwind utility (`ml-2`, `pr-4`, `left-0`, `text-right`,
 *   `border-l`, `rounded-r`) where a logical one mirrors in right-to-left languages (`ms-2`, `pe-4`,
 *   `start-0`, `text-end`, `border-s`, `rounded-e`) — ADR-0033 D.
 * Exceptions carry `i18n-ignore: <reason>` on the line or the line above, as for the words rule.
 */

type Node = { type: string; start: number; end: number; [k: string]: unknown };
const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && typeof (v as Node).type === "string";

export interface RuleHit {
  rule: "i18n-plural" | "i18n-concat" | "i18n-format" | "rtl-logical";
  node: Node;
  message: string;
}

const unwrap = (n: unknown): unknown =>
  isNode(n) && n.type === "ParenthesizedExpression" ? unwrap(n.expression) : n;

/** A call of the message function: `t("…")`. */
function isT(n: unknown): boolean {
  const node = unwrap(n);
  if (!isNode(node) || node.type !== "CallExpression") return false;
  const callee = node.callee as Node;
  return callee.type === "Identifier" && callee.name === "t";
}

const isOne = (n: unknown) => isNode(n) && n.type === "Literal" && n.value === 1;
/** Equality with 1 is English's one/other; `> 0` and the like choose between states, not forms. */
const COMPARISONS = new Set(["===", "!==", "==", "!="]);
/** A comma (or Arabic comma, semicolon) and a space, or an ideographic comma: a list for people. A bare `,` joins protocol values. */
const LIST_SEPARATOR = /^([,،;]\s+|、)$/;

const PLURAL = "a plural by hand — one `plural` message called as t(key, { count }) (DESIGN.md §1)";
const CONCAT =
  "a sentence assembled from several messages — make it one message (a `select` for the part that varies), DESIGN.md §1";
const LIST = 'a list joined with ", " — use listOf(items) (Intl.ListFormat in the Studio language)';

const FORMATTERS = new Set([
  "NumberFormat",
  "DateTimeFormat",
  "RelativeTimeFormat",
  "ListFormat",
  "PluralRules",
  "DisplayNames",
  "Collator",
  "Segmenter",
]);
const TO_LOCALE = new Set(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]);
const FORMAT =
  "a formatter built on the spot — use the cached layer in @cloudhal/messages/format (formatDate, formatNumber, numberFormat, dateTimeFormat, …) with the Studio locale";

/** `new Intl.X(…)`, `Intl.X(…)` and `x.toLocaleString(…)` (Phase 2: one cached, locale-taking layer). */
function checkFormat(node: Node, hits: RuleHit[]) {
  if (node.type !== "NewExpression" && node.type !== "CallExpression") return;
  const callee = node.callee as Node;
  if (callee.type !== "MemberExpression" || callee.computed) return;
  const object = callee.object as Node;
  const property = (callee.property as Node).name as string;
  const intl = object.type === "Identifier" && object.name === "Intl" && FORMATTERS.has(property);
  if (intl || (node.type === "CallExpression" && TO_LOCALE.has(property)))
    hits.push({ rule: "i18n-format", node, message: FORMAT });
}

/** A physical utility, after its variants (`md:`, `group-hover:`); `-` for negative values. */
export const PHYSICAL =
  /^-?(?:(?:scroll-)?[mp][lr]-|(?:left|right)-|text-(?:left|right)$|border-[lr](?:-|$)|rounded-(?:[lr]|[tb][lr])(?:-|$)|(?:float|clear)-(?:left|right)$)/;
/** One utility (after its variants and `!`) to its logical twin, or itself. */
export function logical(token: string): string {
  const m = /^((?:[^:\s[\]]+:)*!?)(-?)(.*)$/.exec(token);
  if (!m) return token;
  const [, variants, neg, body] = m as unknown as [string, string, string, string];
  const swap: [RegExp, string][] = [
    [/^(scroll-)?m([lr])-/, ""],
    [/^(scroll-)?p([lr])-/, ""],
    [/^left-/, "start-"],
    [/^right-/, "end-"],
    [/^text-left$/, "text-start"],
    [/^text-right$/, "text-end"],
    [/^border-l(?=-|$)/, "border-s"],
    [/^border-r(?=-|$)/, "border-e"],
    [/^rounded-tl(?=-|$)/, "rounded-ss"],
    [/^rounded-tr(?=-|$)/, "rounded-se"],
    [/^rounded-bl(?=-|$)/, "rounded-es"],
    [/^rounded-br(?=-|$)/, "rounded-ee"],
    [/^rounded-l(?=-|$)/, "rounded-s"],
    [/^rounded-r(?=-|$)/, "rounded-e"],
    [/^(float|clear)-left$/, "$1-start"],
    [/^(float|clear)-right$/, "$1-end"],
  ];
  for (const [re, to] of swap) {
    if (!re.test(body)) continue;
    const out =
      to === ""
        ? body.replace(
            /^(scroll-)?([mp])([lr])-/,
            (_x, s = "", mp, lr) => `${s}${mp}${lr === "l" ? "s" : "e"}-`,
          )
        : body.replace(re, to);
    return `${variants}${neg}${out}`;
  }
  return token;
}

const LOGICAL_HINT =
  "a physical utility — use the logical one so it mirrors in right-to-left languages (ms/me, ps/pe, start/end, text-start/end, border-s/e, rounded-s/e/ss/se/es/ee), ADR-0033";

/** Physical utilities in a string that reads as a class list. */
function checkPhysical(node: Node, hits: RuleHit[]) {
  const text =
    node.type === "Literal" && typeof node.value === "string"
      ? node.value
      : node.type === "TemplateElement"
        ? ((node.value as { cooked?: string }).cooked ?? "")
        : undefined;
  if (!text || !/[a-z]-/.test(text)) return;
  const tokens = text.split(/\s+/).map((t) => t.replace(/^(?:[^:\s[\]]+:)+/, "").replace(/^!/, ""));
  if (tokens.some((t) => PHYSICAL.test(t)))
    hits.push({ rule: "rtl-logical", node, message: LOGICAL_HINT });
}

function check(node: Node, hits: RuleHit[]) {
  checkFormat(node, hits);
  checkPhysical(node, hits);
  if (node.type === "ConditionalExpression") {
    const test = unwrap(node.test);
    const counted =
      isNode(test) &&
      test.type === "BinaryExpression" &&
      COMPARISONS.has(test.operator as string) &&
      (isOne(test.left) || isOne(test.right));
    if (counted && isT(node.consequent) && isT(node.alternate))
      hits.push({ rule: "i18n-plural", node, message: PLURAL });
  }
  if (node.type === "TemplateLiteral" && (node.expressions as Node[]).filter(isT).length >= 2)
    hits.push({ rule: "i18n-concat", node, message: CONCAT });
  if (
    node.type === "BinaryExpression" &&
    node.operator === "+" &&
    (isT(node.left) || isT(node.right))
  ) {
    const other = isT(node.left) ? unwrap(node.right) : unwrap(node.left);
    if (
      isNode(other) &&
      (isT(other) || other.type === "Literal" || other.type === "TemplateLiteral")
    )
      hits.push({ rule: "i18n-concat", node, message: CONCAT });
  }
  if (node.type === "CallExpression") {
    const callee = node.callee as Node;
    const arg = (node.arguments as Node[])[0];
    const isJoin = callee.type === "MemberExpression" && (callee.property as Node).name === "join";
    if (isJoin && arg?.type === "Literal" && LIST_SEPARATOR.test(String(arg.value)))
      hits.push({ rule: "i18n-concat", node: arg, message: LIST });
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") jsxStitches(node, hits);
}

/** `{t(a)} {t(b)}`: two messages side by side in JSX with only spaces between them. */
function jsxStitches(node: Node, hits: RuleHit[]) {
  let previous: Node | undefined;
  for (const child of node.children as Node[]) {
    if (child.type === "JSXText" && !String(child.value).trim()) continue;
    const isMessage = child.type === "JSXExpressionContainer" && isT(child.expression);
    if (isMessage && previous) hits.push({ rule: "i18n-concat", node: child, message: CONCAT });
    previous = isMessage ? child : undefined;
  }
}

/** Every hit of the two rules in a parsed program. */
export function messageRuleHits(program: Node): RuleHit[] {
  const hits: RuleHit[] = [];
  const visit = (node: Node) => {
    check(node, hits);
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      if (Array.isArray(value)) {
        for (const v of value) if (isNode(v)) visit(v);
      } else if (isNode(value)) visit(value);
    }
  };
  visit(program);
  return hits;
}
