/**
 * SVG: validate and reject, never sanitise (RFC-0004 §5.4). A small XML tokenizer with no DTD or
 * entity support walks the file; anything outside an allowlist of presentation elements and
 * attributes is reported, and the upload is refused with the list. SVG is served under a CSP
 * sandbox as well (§7.2), and only people may upload it in v1 (answer 2). Worker-safe.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
/** Namespaces whose elements a browser would treat as active content. */
const ACTIVE_NS =
  /^(?:http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1998\/Math\/MathML|1999\/XSL\/Transform|2001\/XInclude|2001\/xml-events)|https?:\/\/www\.w3\.org\/\d{4}\/xml-events)$/i;

const ELEMENTS = new Set(
  [
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "title",
    "desc",
    "metadata",
    "style",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "linearGradient",
    "radialGradient",
    "stop",
    "pattern",
    "clipPath",
    "mask",
    "marker",
    "image",
    "filter",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
  ].map((e) => e.toLowerCase()),
);

/** Elements that are refused with a specific word in the message. */
const SCRIPTY = new Set([
  "script",
  "foreignobject",
  "iframe",
  "handler",
  "listener",
  "embed",
  "object",
]);
const ANIMATION = new Set(["animate", "animatemotion", "animatetransform", "set", "discard"]);

const ATTRIBUTES = new Set(
  `id class style transform viewbox preserveaspectratio width height x y x1 y1 x2 y2 cx cy r rx ry d
  points pathlength fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap
  stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display
  visibility clip-path clip-rule clippathunits mask maskunits maskcontentunits filter filterunits
  primitiveunits marker-start marker-mid marker-end markerwidth markerheight markerunits refx refy
  orient font-family font-size font-weight font-style font-variant font-stretch font-size-adjust
  text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing word-spacing
  text-decoration writing-mode direction unicode-bidi dx dy rotate textlength lengthadjust
  startoffset method spacing side offset stop-color stop-opacity gradientunits gradienttransform
  spreadmethod fx fy fr patternunits patterncontentunits patterntransform href version baseprofile
  xmlns overflow shape-rendering text-rendering image-rendering color-interpolation
  color-interpolation-filters color-rendering flood-color flood-opacity lighting-color in in2
  result stddeviation mode type values tablevalues slope intercept amplitude exponent k k1 k2 k3 k4
  operator radius scale xchannelselector ychannelselector basefrequency numoctaves seed stitchtiles
  surfacescale diffuseconstant specularconstant specularexponent kernelmatrix kernelunitlength
  order divisor bias targetx targety edgemode preservealpha azimuth elevation pointsatx pointsaty
  pointsatz limitingconeangle z vector-effect paint-order mix-blend-mode isolation enable-background
  role lang media focusable xml:space xml:lang`
    .split(/\s+/)
    .filter(Boolean),
);

const FRAGMENT = /^#[A-Za-z_][\w.:-]*$/;
const RASTER_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/;

export interface SvgCheck {
  ok: boolean;
  /** One line per kind of problem, with counts ("script elements (1)", "event handlers (2)"). */
  problems: string[];
  /** Intrinsic size from width/height or the viewBox (300×150, the browser default, otherwise). */
  width: number;
  height: number;
}

function decodeEntities(value: string, problems: Map<string, number>): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, ref: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const n = Number.parseInt(ref.slice(2), 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    if (ref.startsWith("#")) {
      const n = Number.parseInt(ref.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    const v = named[ref.toLowerCase()];
    if (v === undefined || !m.endsWith(";")) {
      bump(problems, "entity references (only &lt; &gt; &amp; &quot; &apos; are allowed)");
      return "";
    }
    return v;
  });
}

function bump(problems: Map<string, number>, what: string, n = 1): void {
  problems.set(what, (problems.get(what) ?? 0) + n);
}

/** CSS (a `style` attribute or element) without imports, expressions or non-fragment URLs. */
function checkCss(css: string, problems: Map<string, number>): void {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\\/.test(flat)) bump(problems, "CSS escapes");
  if (/@import/i.test(flat)) bump(problems, "CSS @import rules");
  if (/expression\s*\(|behavior\s*:|-moz-binding|javascript:/i.test(flat))
    bump(problems, "CSS expressions or script URLs");
  for (const m of flat.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi))
    if (!FRAGMENT.test((m[2] ?? "").trim())) bump(problems, "external references");
  if (/@font-face|@namespace/i.test(flat)) bump(problems, "CSS @font-face or @namespace rules");
}

function checkValue(name: string, value: string, problems: Map<string, number>): void {
  if (/javascript:|vbscript:|data:text\/html/i.test(value.replace(/\s+/g, "")))
    bump(problems, "script URLs");
  for (const m of value.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi))
    if (!FRAGMENT.test((m[2] ?? "").trim())) bump(problems, "external references");
  if (name === "style") checkCss(value, problems);
}

function length(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  return m ? Number(m[1]) : undefined;
}

/** Validates an SVG document. Never throws on bad input; read `ok` and `problems`. */
export function checkSvg(source: string): SvgCheck {
  const problems = new Map<string, number>();
  const text = source.replace(/^﻿/, "");
  const stack: { name: string; inMetadata: boolean; isStyle: boolean }[] = [];
  const ns = new Map<string, string>([["xml", "http://www.w3.org/XML/1998/namespace"]]);
  let size: { width?: number; height?: number; viewBox?: [number, number] } | undefined;
  let rootSeen = false;
  let elements = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    const chunk = lt < 0 ? text.slice(i) : text.slice(i, lt);
    const top = stack.at(-1);
    if (chunk.trim()) {
      if (!top) bump(problems, "text outside the root element");
      else if (top.isStyle) checkCss(decodeEntities(chunk, problems), problems);
      else decodeEntities(chunk, problems);
    }
    if (lt < 0) break;
    i = lt;
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) {
        bump(problems, "unterminated comments");
        break;
      }
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      if (end < 0) {
        bump(problems, "unterminated CDATA sections");
        break;
      }
      if (top?.isStyle) checkCss(text.slice(i + 9, end), problems);
      else if (!top) bump(problems, "text outside the root element");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<!", i)) {
      // <!DOCTYPE …> and <!ENTITY …>: no DTDs, no entities (XXE, billion laughs).
      bump(problems, "DTD declarations (<!DOCTYPE> or <!ENTITY>)");
      break;
    }
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end < 0) {
        bump(problems, "unterminated processing instructions");
        break;
      }
      const pi = text.slice(i + 2, end);
      if (!/^xml\s/i.test(pi) || rootSeen || i > 0) bump(problems, "processing instructions");
      i = end + 2;
      continue;
    }
    if (text.startsWith("</", i)) {
      const end = text.indexOf(">", i);
      if (end < 0) {
        bump(problems, "unterminated tags");
        break;
      }
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        bump(problems, "mismatched tags");
        break;
      }
      i = end + 1;
      continue;
    }
    // A start tag: name, attributes (quoted values only), optional "/".
    const tag = /^<([A-Za-z_][\w.:-]*)/.exec(text.slice(i, i + 256));
    if (!tag) {
      bump(problems, "malformed markup");
      break;
    }
    const qname = tag[1] as string;
    let k = i + tag[0].length;
    const attrs: [string, string][] = [];
    let selfClosing = false;
    let closed = false;
    while (k < n) {
      while (k < n && /\s/.test(text[k] as string)) k++;
      if (text.startsWith("/>", k)) {
        selfClosing = true;
        k += 2;
        closed = true;
        break;
      }
      if (text[k] === ">") {
        k += 1;
        closed = true;
        break;
      }
      const am = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(text.slice(k, k + 65_536));
      if (!am) break;
      attrs.push([am[1] as string, am[3] ?? am[4] ?? ""]);
      k += am[0].length;
    }
    if (!closed) {
      bump(problems, "malformed markup");
      break;
    }
    i = k;
    if (++elements > 50_000 || stack.length > 256) {
      bump(problems, "too many or too deeply nested elements");
      break;
    }
    if (rootSeen && stack.length === 0) {
      bump(problems, "content after the root element");
      break;
    }
    const inMetadata = top?.inMetadata ?? false;
    // Namespace declarations first: they decide what the element names mean.
    for (const [name, value] of attrs) {
      if (name === "xmlns") {
        if (value !== SVG_NS) bump(problems, "foreign default namespaces");
      } else if (name.startsWith("xmlns:")) {
        const prefix = name.slice(6);
        if (prefix === "xlink" ? value !== XLINK_NS : ACTIVE_NS.test(value))
          bump(problems, "namespace declarations that redefine SVG, XHTML or XLink");
        ns.set(prefix, value);
      }
    }
    const [prefix, local] = qname.includes(":")
      ? (qname.split(":", 2) as [string, string])
      : [undefined, qname];
    const lower = local.toLowerCase();
    if (!rootSeen && lower !== "svg") bump(problems, "a root element other than <svg>");
    if (SCRIPTY.has(lower))
      bump(problems, lower === "script" ? "script elements" : `<${local}> elements`);
    else if (ANIMATION.has(lower)) bump(problems, "animation elements");
    else if (prefix !== undefined) {
      // Editor metadata (RDF, Dublin Core) may sit inside <metadata>, in non-active namespaces.
      const uri = ns.get(prefix);
      if (!inMetadata || !uri || ACTIVE_NS.test(uri)) bump(problems, `<${qname}> elements`);
    } else if (inMetadata) {
      bump(problems, "SVG elements inside <metadata>");
    } else if (!ELEMENTS.has(lower)) bump(problems, `<${local}> elements`);
    for (const [name, raw] of attrs) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const value = decodeEntities(raw, problems);
      const lname = name.toLowerCase();
      const localName = lname.includes(":") ? (lname.split(":", 2)[1] as string) : lname;
      if (localName.startsWith("on")) {
        bump(problems, "event handlers");
        continue;
      }
      if (localName === "href") {
        const ok =
          (lname === "href" || lname === "xlink:href") &&
          (FRAGMENT.test(value.trim()) || (lower === "image" && RASTER_DATA.test(value.trim())));
        if (!ok) bump(problems, "external references");
        continue;
      }
      if (lname.includes(":")) {
        if (lname === "xml:space" || lname === "xml:lang") continue;
        const p = lname.split(":", 1)[0] as string;
        const uri = ns.get(p);
        if (!uri || ACTIVE_NS.test(uri) || uri === XLINK_NS) bump(problems, `${name} attributes`);
        else checkValue(lname, value, problems);
        continue;
      }
      if (!ATTRIBUTES.has(lname) && !/^(?:data|aria)-[\w.-]+$/.test(lname)) {
        bump(problems, `${name} attributes`);
        continue;
      }
      checkValue(lname, value, problems);
    }
    if (!rootSeen) {
      rootSeen = true;
      const get = (a: string) => attrs.find(([k2]) => k2 === a)?.[1];
      const vb = get("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      size = {
        ...(length(get("width")) !== undefined ? { width: length(get("width")) as number } : {}),
        ...(length(get("height")) !== undefined ? { height: length(get("height")) as number } : {}),
        ...(vb && vb.length === 4 && vb.every(Number.isFinite)
          ? { viewBox: [vb[2] as number, vb[3] as number] as [number, number] }
          : {}),
      };
    }
    if (!selfClosing)
      stack.push({
        name: qname,
        inMetadata: inMetadata || lower === "metadata",
        isStyle: lower === "style",
      });
  }
  if (!rootSeen) bump(problems, "a missing <svg> root element");
  else if (stack.length > 0 && problems.size === 0) bump(problems, "unclosed elements");
  const width = Math.max(1, Math.round(size?.width ?? size?.viewBox?.[0] ?? 300));
  const height = Math.max(1, Math.round(size?.height ?? size?.viewBox?.[1] ?? 150));
  return {
    ok: problems.size === 0,
    problems: [...problems].map(([what, count]) => `${what} (${count})`),
    width: Math.min(width, 100_000),
    height: Math.min(height, 100_000),
  };
}
