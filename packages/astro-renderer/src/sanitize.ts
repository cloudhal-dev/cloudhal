/**
 * HTML bodies, sanitized at render time (RFC-0012, ADR-0026). An `html` body may come from any
 * writer — agent keys over REST, `cloudhal push`, the least trusted roles — so it reaches a page,
 * a preview, a feed or a static build only through this allowlist.
 *
 * 1. **Parse** the body as a fragment in a `<div>` context with parse5, the way a browser parses
 *    `innerHTML`: a sanitizer that parses differently from the browser can be bypassed (mutation
 *    XSS).
 * 2. **Walk** the tree: allowlisted elements and attributes stay; other elements are unwrapped
 *    (their children kept); the drop set goes with its content; comments go.
 * 3. **Serialize** ourselves: only allowlisted names are written as they are, every attribute
 *    value and text is escaped. Stored bodies are never modified.
 */
import { type DefaultTreeAdapterMap, defaultTreeAdapter, parseFragment } from "parse5";
import { safeHref, safeSrc } from "./safe-urls.ts";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Attributes any kept element may carry (`id` is rewritten to `user-content-<id>`). */
const GLOBAL = ["title", "lang", "dir", "class"] as const;

/** Kept elements and the attributes each may carry besides `GLOBAL` and `id` (RFC-0012 v1). */
const ELEMENTS: Record<string, readonly string[]> = {
  // text and structure
  p: [],
  br: [],
  hr: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  blockquote: [],
  pre: [],
  code: [],
  kbd: [],
  samp: [],
  var: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  del: [],
  ins: [],
  mark: [],
  small: [],
  sub: [],
  sup: [],
  q: [],
  cite: [],
  abbr: [],
  dfn: [],
  time: ["datetime"],
  span: [],
  div: [],
  section: [],
  aside: [],
  figure: [],
  figcaption: [],
  details: ["open"],
  summary: [],
  // lists and tables
  ul: [],
  ol: ["start", "reversed", "type"],
  li: [],
  dl: [],
  dt: [],
  dd: [],
  table: [],
  caption: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ["colspan", "rowspan", "scope", "headers"],
  td: ["colspan", "rowspan", "scope", "headers"],
  colgroup: [],
  col: [],
  // links and media
  a: ["href", "target"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  picture: [],
  source: ["src", "type", "kind", "srclang", "label"],
  audio: ["src", "poster", "controls", "preload", "muted", "loop", "playsinline"],
  video: ["src", "poster", "controls", "preload", "muted", "loop", "playsinline"],
  track: ["src", "type", "kind", "srclang", "label"],
};

/** Removed with everything inside them. */
const DROP = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "select",
  "option",
  "optgroup",
  "textarea",
  "datalist",
  "output",
  "meta",
  "link",
  "base",
  "title",
  "head",
  "noembed",
  "noframes",
  "dialog",
  "slot",
  "portal",
]);

/** Elements with no end tag. */
const VOID = new Set(["br", "hr", "img", "source", "track", "col"]);

/** Attributes whose value is a URL, and the rule each is checked by. */
const URL_ATTRS: Record<string, (value: string, element: string) => string | undefined> = {
  href: (v) => safeHref(v),
  src: (v, element) => (element === "img" ? safeSrc(v) : mediaUrl(v)),
  poster: (v) => safeSrc(v),
};

/** Other media: `http`, `https` or relative only (no `data:`, `mailto:`, `tel:`). */
function mediaUrl(value: string): string | undefined {
  const safe = safeHref(value);
  return safe && !/^(mailto|tel):/i.test(safe) ? safe : undefined;
}

/** What survives, for docs and tests. */
export const HTML_ALLOWLIST: {
  readonly elements: Readonly<Record<string, readonly string[]>>;
  readonly global: readonly string[];
} = { elements: ELEMENTS, global: [...GLOBAL, "id"] };

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

/** The sanitized HTML of a stored `html` body. */
export function sanitizeHtml(html: string): string {
  const context = defaultTreeAdapter.createElement("div", HTML_NS as never, []);
  const fragment = parseFragment(context, html, {});
  return serializeChildren(fragment.childNodes);
}

function serializeChildren(nodes: readonly Node[]): string {
  let out = "";
  for (const node of nodes) out += serializeNode(node);
  return out;
}

function serializeNode(node: Node): string {
  if (node.nodeName === "#text") return escapeText((node as { value: string }).value);
  if (node.nodeName === "#comment" || node.nodeName === "#documentType") return "";
  const element = node as Element;
  const name = element.tagName;
  // Foreign content (SVG, MathML) never reaches the page, even where the parser put it.
  if (element.namespaceURI !== HTML_NS || DROP.has(name)) return "";
  const allowed = ELEMENTS[name];
  if (!allowed) return serializeChildren(element.childNodes); // unwrap
  const attrs = attributes(element, allowed);
  if (attrs === undefined) return ""; // an image without a usable source
  if (VOID.has(name)) return `<${name}${attrs}>`;
  let inner = serializeChildren(element.childNodes);
  // A browser drops one newline right after <pre>: keep a leading one that was really there.
  if (name === "pre" && inner.startsWith("\n")) inner = `\n${inner}`;
  return `<${name}${attrs}>${inner}</${name}>`;
}

/** The kept attributes, serialized; `undefined` when the element must go (an `img` with no src). */
function attributes(element: Element, allowed: readonly string[]): string | undefined {
  const name = element.tagName;
  let out = "";
  let blank = false;
  let src = false;
  for (const attr of element.attrs) {
    if (attr.namespace) continue; // xlink:, xml:, xmlns:
    const key = attr.name;
    let value: string | undefined = attr.value;
    if (key === "id") {
      value = attr.value.startsWith("user-content-") ? attr.value : `user-content-${attr.value}`;
    } else if (!(GLOBAL as readonly string[]).includes(key) && !allowed.includes(key)) {
      continue;
    }
    const checkUrl = URL_ATTRS[key];
    if (checkUrl) {
      value = checkUrl(attr.value, name);
      if (value === undefined) continue;
      if (key === "src") src = true;
    }
    if (key === "target") {
      if (attr.value !== "_blank") continue;
      blank = true;
    }
    out += ` ${key}="${escapeAttr(value)}"`;
  }
  if (name === "img" && !src) return undefined;
  if (blank) out += ' rel="noopener noreferrer"';
  return out;
}
