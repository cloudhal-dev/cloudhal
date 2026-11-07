/** The model prompt generated from the catalog (RFC-0020 §2). */
import { BLOCK_LIMITS, localized, type PropSchema } from "../blocks.ts";
import { ICON_GROUPS } from "../icon-names.ts";
import { SURFACE_FUNCTIONS } from "./bindings/values.ts";
import { allowedInBody } from "./body.ts";
import { type Catalog, childRule } from "./catalog/index.ts";
import { MOTION_REVEALS, MOTION_STAGGER } from "./motion.ts";
import { SURFACE_LIMITS } from "./shared.ts";

// ── the model prompt (RFC-0020 §2) ───────────────────────────────────────────────────────────

export function describeProp(name: string, s: PropSchema, required: boolean): string {
  const req = required ? " (required)" : "";
  switch (s.type) {
    case "string": {
      const parts = s.enum ? s.enum.join("|") : s.format ? `${s.format}` : "text";
      const max = s.maxLength ? `, ≤${s.maxLength}` : "";
      return `${name}: ${parts}${s.enum ? "" : max}${req}`;
    }
    case "integer":
    case "number": {
      const range =
        s.minimum !== undefined || s.maximum !== undefined
          ? ` ${s.minimum ?? ""}..${s.maximum ?? ""}`
          : "";
      return `${name}: ${s.type}${range}${req}`;
    }
    case "boolean":
      return `${name}: true|false${req}`;
    case "array": {
      const item =
        s.items.type === "object"
          ? `{ ${Object.entries(s.items.properties)
              .map(([k, v]) =>
                describeProp(
                  k,
                  v,
                  (s.items as { required?: readonly string[] }).required?.includes(k) ?? false,
                ),
              )
              .join("; ")} }`
          : describeProp("item", s.items, false).replace(/^item: /, "");
      return `${name}: list of ${item}, ≤${s.maxItems ?? BLOCK_LIMITS.arrayItems}${req}`;
    }
    case "object":
      return `${name}: { ${Object.entries(s.properties)
        .map(([k, v]) => describeProp(k, v, s.required?.includes(k) ?? false))
        .join("; ")} }${req}`;
  }
}

/**
 * Instructions for a model writing surfaces against this catalog: the format, bindings, limits
 * and every component with its props and an example. The same catalog validates what it writes.
 */
/** Which blocks a body surface may use, when the theme has blocks it may not. */
function bodyBlockLines(catalog: Catalog): string[] {
  const blocks = catalog.entries().filter((e) => e.kind === "block");
  const pagesOnly = blocks.filter((e) => !allowedInBody(e)).map((e) => e.name);
  if (!pagesOnly.length) return ["Every component below may be used in a body surface."];
  const allowed = blocks.filter(allowedInBody).map((e) => e.name);
  return [
    `Every primitive may be used in a body surface, and these blocks: ${allowed.join(", ") || "none"}. These are page-section blocks only and are refused in bodies: ${pagesOnly.join(", ")}.`,
  ];
}

export function catalogPrompt(catalog: Catalog, locale = "en"): string {
  const lines: string[] = [
    `# Cloudhal surfaces — catalog ${catalog.id}`,
    "",
    "A surface is a page section that describes UI as data, never code:",
    `{"id":"sec_<6-32 letters or digits>","kind":"surface","catalog":"${catalog.id}","components":[…],"data":{…}}`,
    "",
    "## Rules",
    '- `components` is a flat list. One component has id "root". Ids match [a-z][a-z0-9-]{0,40} and are unique in the surface.',
    "- `children` lists ids of other components in the same surface; each component has at most one parent. Nest at most " +
      `${SURFACE_LIMITS.depth} deep; at most ${SURFACE_LIMITS.components} components.`,
    "- `props` follow the component's props below. Any prop may instead be bound to the data model: " +
      '{"path":"/json/pointer"}, or computed by a named function: {"call":"formatDate","args":{"value":{"path":"/d"},"style":"long"}}.',
    `- Functions: ${SURFACE_FUNCTIONS.join(", ")}.`,
    '- Inputs (NumberField, TextField, Checkbox, RadioGroup) write only to the surface\'s data in the reader\'s browser: bind value (checked for Checkbox) with {"path"}, start it in `data` ("" for an empty number), give every input a label, and show the computed result next to it. Buttons may `append` text to a value (keypads) or `set` a computed value, e.g. {"action":"set","path":"/display","value":{"call":"calculate","args":{"expression":{"path":"/display"}}}}.',
    '- Charts: a Chart draws rows from the surface\'s data, e.g. {"id":"c","component":"Chart","props":{"kind":"bar","title":"Readers per month","data":{"path":"/months"},"x":"month","series":[{"field":"readers","label":"Readers"}]}} with "data":{"months":[{"month":"Jan","readers":1200},…]}. Use one only when the numbers are the point; bar for comparing, line or area for change over time, donut for parts of a whole (one series, at most six parts).',
    '- Tables: a Table shows rows from the surface\'s data, e.g. {"id":"t","component":"Table","props":{"caption":"Plans compared","rows":{"path":"/plans"},"columns":[{"field":"name","label":"Plan"},{"field":"price","label":"Price","align":"end","format":"currency","currency":"USD"}],"highlight":{"field":"name","equals":"Pro"}}}. Formats: text, number, currency, percent, date. At most 8 columns; on phones each row becomes a card of every column, so with more than four give the ones a phone reader can skip "hideOnPhone":true (the first column always shows: it names the row).',
    "- Compute, don't promise: a total, a price for N seats or a result from the reader's choices is a call, never text such as \"calculated at checkout\". " +
      "For any result with more than one step, write the formula with `calculate` and name its inputs in `vars` (paths into the data, numbers, or a `choose`): " +
      '{"call":"calculate","args":{"expression":"seats * price * (1 + vat)","vars":{"seats":{"path":"/seats"},"price":{"call":"choose","args":{"value":{"path":"/plan"},"cases":{"basic":9,"pro":19}}},"vat":0.2}}}. ' +
      "Formulas use + - * / % ^ and parentheses; names are letters, digits and _. Wrap the result in formatNumber or formatCurrency to show it: " +
      '{"call":"formatCurrency","args":{"currency":"USD","value":{"call":"calculate","args":{…}}}}. A price without a currency keeps its cents with minDigits: {"call":"formatNumber","args":{"digits":2,"minDigits":2,"value":{"path":"/price"}}} shows 9.60, not 9.6. A blank input leaves the result empty until it is filled. ' +
      'A whole calculator: data {"kg":"","cm":""}; NumberFields {"label":"Weight","value":{"path":"/kg"},"unit":"kg"} and {"label":"Height","value":{"path":"/cm"},"unit":"cm"}; ' +
      'a Stat {"label":"BMI","value":{"call":"formatNumber","args":{"digits":1,"value":{"call":"calculate","args":{"expression":"kg / (cm/100)^2","vars":{"kg":{"path":"/kg"},"cm":{"path":"/cm"}}}}}}}. ' +
      "Other functions: formatNumber {value,digits,minDigits}, add/multiply/min/max {values}, subtract/divide {a,b}, round/floor/ceil {value,digits}, power {base,exponent}, if {cond,ifTrue,ifFalse}, sum/average/count {list,field}.",
    '- `visible` (optional) shows a component only when a condition holds: {"path":"/x"}, {"eq":[a,b]}, {"ne":[a,b]}, {"gt":[a,b]}, {"lt":[a,b]}, {"gte":[a,b]}, {"lte":[a,b]}, {"and":[…]}, {"or":[…]}, {"not":…}. An operand may be a value, a {path} or a call, so computed results compare directly: a Text "Paying monthly is cheaper" with visible {"lt":[{"call":"calculate","args":{"expression":"a * 12","vars":{"a":{"path":"/monthly"}}}},{"path":"/yearly"}]}. if takes the same conditions.',
    // RFC-0024 §2: motion as presets, next to `visible`.
    `- \`motion\` (optional, next to \`visible\`) animates a component with presets, never CSS: {"reveal":"rise","speed":"normal","delay":1}. "reveal" plays once as it scrolls into view: ${MOTION_REVEALS.join(", ")}. "hover": lift, scale, glow; underline (Link, Button, Card, Heading); zoom-media (Card, Image); tilt (Card, Image); magnetic (Button, Link); spotlight (Card, Band). "stagger": true on ${MOTION_STAGGER.join("/")} reveals its children one after another. "delay" 0–4 stagger steps; "speed" fast|normal|slow; "replay": true reveals again on re-entry. "scroll" moves it with the page instead (not with "reveal"): parallax or pan with "depth" -3…3 (negative moves the other way), fade-through, scale-through, rotate-through — for images, cards and decorative parts, never for text people read. split-words, split-chars and split-lines reveal a Heading or a short Text piece by piece (once, as kinetic type). "loop" (alone, decorative only): float (Image, Badge, Stat, Card), pulse (Badge, Button, Stat), gradient-shift (Card, Band), spin-slow (Image, Badge).`,
    'Kinetic headings: Heading "effect" highlight (marks the words *between asterisks*, else the last word), gradient-text, or rotate-words with "words" (2–6) taking turns where {words} stands in the text ("Invoices that {words}" with ["chase themselves","never get lost"]). Marquee scrolls a row of 3+ children by itself (logos, quotes); Counter counts up to "value" once as it comes into view. Anything that loops gets a pause control from the renderer; use at most two per page.',
    'Ambient backgrounds: Band (or Card, CSS kinds only) "ambient": {"kind":"aurora"|"gradient-shift"|"grain"|"beams"|"particles","preset":"dots"|"links"|"stars"|"snow"|"bubbles"|"fireflies" (particles only),"density":"low"|"medium"|"high","colors":"brand"|"accent"|"brand-accent"|"neutral","interactive":true}. One per section, best on the hero; text keeps its contrast, and readers who pause motion or ask for less see a still version.',
    'Page transitions: when the site\'s pageTransition is morph, give the same "morph" key (motion {"morph":"plan-pro"}) to an element on two pages, a card image and the article cover, a pricing card and its plan page heading, and it moves from one to the other as the reader navigates. One key per element on a page.',
    'Scroll story: a Scrolly holds one child that stays in view (a Chart, a Stat, an Image or a Stack of them), then 2–12 Step children with the text; the step being read (1, 2, …) is written to its "step" binding, so the first child changes with it: {"visible":{"eq":[{"path":"/step"},2]}} or {"call":"choose","args":{"value":{"path":"/step"},"cases":{"1":…,"2":…}}}. Put the starting step in the data ({"step":1}). ScrollProgress shows how far the reader is (placement page or section).',
    "Carousel (RFC-0027): each child is a slide; give it a label naming what it shows. variant hero (2–5 full-width slides, aspect required, slide 1 matters most), rail (2–12 cards or logos, perView 1–4 or itemWidth, peek s so readers see there is more), gallery (up to 24 slides each with an Image, aspect required, markers thumbs) or testimonials (2–12 Quote slides, centred). Prefer a static hero (a Band); use a hero carousel only for 2–5 equally important messages; every slide's content must also be reachable elsewhere. A hero may loop; autoplay (slow 8 s, normal 6 s) stays off unless the owner asks — it then plays only where motion allows, stops for good when the reader touches it, and one per page.",
    `Icons (RFC-0026), by name only: an Icon component ({"name","size","tone","label" only when it stands alone}), "icon" on Button (with "iconPosition"), Badge and Stat, and List "marker". Interface: ${ICON_GROUPS.interface.join(", ")}. Actions: ${ICON_GROUPS.actions.join(", ")}. Content: ${ICON_GROUPS.content.join(", ")}. Social: ${ICON_GROUPS.social.join(", ")}. Icons decorate text; never use one as the only way to say something.`,
    'Overlays (Dialog, Drawer, Popover: at most 3 per section; and Lightbox) open only when the reader asks: a Button with "onClick":{"action":"open","target":"<overlay id>"}; a Button inside one with {"action":"close"} closes it. Never open one on load, on a timer or on leaving; content people read or link to belongs on a page. Dialog and Drawer need a title; give a Dialog a fallbackHref page when its content matters. A Tooltip ({"text","for":"<Button or Link id>"}) repeats what is on the page, never replaces it. A Lightbox shows images from items (asset and alt each).',
    "- Motion guides the eye: one entrance per section (a hero heading with rise and its buttons after it, a grid with stagger), hover on things people click, never on body text people are reading. The site's motion level and the reader's reduced-motion setting decide how much actually moves, and pages are complete without it.",
    `- \`data\` is JSON (≤ ${SURFACE_LIMITS.dataBytes / 1024} KB). A key may load entries: {"$source":"entries","query":{"collection":"posts","filter":"category:news","sort":"newest","limit":6}}.`,
    "- Images only from the media library: `asset:<id>`. Links: https, mailto, tel, /site-paths or #anchors.",
    "- Text props take markdown where marked `markdown`; never HTML.",
    "",
    "## In article bodies",
    'Inside markdown, write a surface as a fenced block: the info string holds its id and catalog, every line one component, or a {"data":{…}} line:',
    '```surface {"id":"pricing","catalog":"' + catalog.id + '"}',
    '{"data":{"billing":"monthly"}}',
    '{"id":"root","component":"Stack","children":["t"]}',
    '{"id":"t","component":"Text","props":{"text":"Hello"}}',
    "```",
    "Body surfaces cannot load entries ($source); page surfaces can.",
    ...bodyBlockLines(catalog),
    "",
    "## Editing",
    "Change a page with RFC 6902 JSON Patch operations on /title, /sections and /seo, e.g.",
    '{"op":"add","path":"/sections/-","value":{…surface…}} or {"op":"add","path":"/sections/0/components/-","value":{…component…}} then add its id to a parent\'s children.',
    "Failed operations come back as VALIDATION_FAILED with a JSON Pointer; fix that part and send again.",
    "",
    "## Components",
  ];
  for (const e of catalog.entries()) {
    const rule = childRule(e);
    const kids =
      rule === "none"
        ? "no children"
        : rule === "any"
          ? "children: any"
          : `children: ${rule.join(", ")}`;
    const desc = localized(e.type.description, locale);
    lines.push(
      `### ${e.name} (${e.kind === "primitive" ? e.type.category : "block"}; ${kids})${desc ? ` — ${desc}` : ""}`,
    );
    const props = Object.entries(e.schema.properties).map(([k, v]) =>
      describeProp(k, v, e.schema.required?.includes(k) ?? false),
    );
    lines.push(props.length ? `props: ${props.join("; ")}` : "props: none");
    lines.push(
      `example: ${JSON.stringify({ id: e.name.toLowerCase(), component: e.name, props: e.type.example.props })}`,
    );
  }
  return lines.join("\n");
}
