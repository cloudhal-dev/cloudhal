/**
 * Design lint for admin UIs (docs/design/DESIGN.md §7). One rule set, three entry points:
 * - `apps/studio/test/design-rules.test.ts` runs it over every screen in CI (`pnpm check`);
 * - `pnpm design:lint [files…]` runs it by hand;
 * - the Claude Code hook in `.claude/settings.json` runs it on every file an agent writes
 *   (`--hook`), so a violation is reported back to the agent the moment it is made.
 *
 * Rules are per file and mechanical. Each message says what to use instead and where it is
 * documented, because the reader is often an agent that will fix it right away.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, "../../..");
export const STUDIO_SRC = path.join(REPO, "apps/studio/src");
export const UI_BLOCKS = path.join(REPO, "packages/ui/src/blocks");

export interface Violation {
  rule: string;
  message: string;
  line?: number;
}

/** Where a file sits decides which rules apply. */
export type Scope = "screen" | "kit" | "none";

export function scopeOf(absPath: string): Scope {
  const p = path.resolve(absPath);
  if (!p.endsWith(".tsx")) return "none";
  if (p.startsWith(path.join(STUDIO_SRC, "routes") + path.sep)) return "screen";
  if (p.startsWith(path.join(STUDIO_SRC, "components") + path.sep)) return "screen";
  // Kumo blocks copied with `kumo add` stay upstream-shaped; our own blocks follow the rules.
  if (p.startsWith(path.join(UI_BLOCKS, "kumo") + path.sep)) return "none";
  if (p.startsWith(UI_BLOCKS + path.sep)) return "kit";
  return "none";
}

/**
 * The page template of every route file (DESIGN.md §2). A new screen fails the lint until it is
 * registered here, which forces the author to pick a template — and with it the Kumo blocks the
 * screen must be built from.
 */
export const ROUTE_TEMPLATES: Record<string, Template> = {
  "routes/SitesPage.tsx": "list",
  "routes/PagesPage.tsx": "list",
  "routes/ArticlesPage.tsx": "list",
  "routes/SnapshotsPage.tsx": "list",
  "routes/ActivityPage.tsx": "list",
  "routes/ApprovalsPage.tsx": "queue",
  "routes/AgentsPage.tsx": "list",
  "routes/SkillsPage.tsx": "list",
  "routes/SiteOverviewPage.tsx": "dashboard",
  "routes/AnalyticsPage.tsx": "dashboard",
  "routes/SiteSettingsPage.tsx": "settings",
  "routes/AccountPage.tsx": "settings",
  "routes/PageEditorPage.tsx": "editor",
  "routes/ArticleEditorPage.tsx": "editor",
  "routes/TaxonomyPage.tsx": "list",
  "routes/TermEditorPage.tsx": "editor",
  "routes/RedirectsPage.tsx": "list",
  "routes/NavigationPage.tsx": "editor",
  "routes/MediaPage.tsx": "list",
  "routes/CommentsPage.tsx": "moderation",
  "routes/CommentThreadPage.tsx": "editor",
  "routes/CommenterPage.tsx": "editor",
  "routes/AssetPage.tsx": "editor",
  "routes/LoginPage.tsx": "auth",
  "routes/MembersPage.tsx": "list",
  "routes/InvitePage.tsx": "token",
  "routes/ResetPasswordPage.tsx": "token",
  // Schedules (RFC-0008 §15.1, DESIGN.md §2x): the calendar, its two list tabs and a release.
  "routes/SchedulesPage.tsx": "calendar",
  "routes/AutomationsPage.tsx": "list",
  "routes/ScheduleHistoryPage.tsx": "list",
  "routes/ReleasePage.tsx": "editor",
  "routes/SiteShell.tsx": "shell",
  "routes/AccountShell.tsx": "shell",
};

export type Template =
  | "calendar"
  | "list"
  | "moderation"
  | "queue"
  | "dashboard"
  | "settings"
  | "editor"
  | "auth"
  | "token"
  | "shell";

/** What each template must be composed from (names must appear in the file). DESIGN.md §2a–2f. */
export const TEMPLATE_REQUIRES: Record<Template, string[]> = {
  // Schedules (RFC-0008 §15.1, DESIGN.md §2x): the toolbar with the schedule filters over a
  // `LayerCard` holding the agenda or the month grid; `Empty` when the server has no schedules.
  calendar: [
    "PageLayout",
    "crumbs=",
    "title=",
    "ListToolbar",
    "ScheduleFilters",
    "LayerCard",
    "Empty",
    "CalendarMonth|AgendaList",
  ],
  list: ["PageLayout", "crumbs=", "title=", "Table", "Empty", "LayerCard"],
  queue: ["PageLayout", "crumbs=", "title=", "SectionCard", "SectionEmpty", "Table"],
  // Reader comments (DESIGN.md §2w): a list whose rows are `CommentRow`s (not table cells, so the
  // untrusted-text panel and labels fit at 390 px), with selection and the bulk bar.
  moderation: [
    "PageLayout",
    "crumbs=",
    "title=",
    "ListToolbar",
    "BulkActionBar",
    "CommentRow",
    "LayerCard",
    "Empty",
    "Pagination",
  ],
  dashboard: ["PageLayout", "crumbs=", "title=", "Columns", "SectionCard"],
  settings: ["PageLayout", "crumbs=", "title=", "SettingsLayout", "SettingsSection"],
  editor: ["PageLayout", "crumbs=", "title=", "EditorLayout", "SectionCard"],
  auth: ["AuthLayout", "Tabs", "Input", "Button"],
  // Public token pages (`/invite`, `/reset-password`, DESIGN.md §2r): the auth frame without tabs,
  // the link's state as a Banner, skeleton lines while it is inspected, a new-password field.
  token: ["AuthLayout", "takeHashToken", "Banner", "Button", "Input", "LinkSkeleton|SkeletonLine"],
  shell: ["AppFrame", "Sidebar.Group", "Sidebar.MenuButton", "SidebarSwitcher"],
};

/** Raw elements that always have a Kumo equivalent. `div`, `span`, `dl/dt/dd`, `form`, `main`, `kbd` stay allowed as glue. */
const FORBIDDEN_ELEMENTS: Record<string, string> = {
  table: "Table",
  thead: "Table.Header",
  tbody: "Table.Body",
  tr: "Table.Row",
  td: "Table.Cell",
  th: "Table.Head",
  h1: 'PageLayout title / Text variant="heading" as="h1"',
  h2: 'SectionCard title / Text variant="heading" as="h2"',
  h3: 'Text variant="heading" as="h3"',
  h4: 'Text variant="heading" as="h4"',
  button: "Button / Toolbar.Button",
  input: "Input / Checkbox / Radio / Switch",
  select: "Select",
  textarea: "InputArea",
  label: "Label or the control's own label prop",
  a: "Link / LinkButton",
  nav: "Sidebar / Breadcrumbs / Tabs",
  aside: "PageLayout aside",
  ul: 'Table / dl / Text as="li" inside a div',
  ol: "Table / dl",
  li: 'Text as="li"',
  p: "Text",
  img: "an icon from @phosphor-icons/react",
  iframe: "PreviewPanel (@cloudhal/ui)",
  hr: "border-t border-kumo-hairline on the next block",
};

interface ClassRule {
  re: RegExp;
  rule: string;
  message: string;
  scopes: Scope[];
}

const CLASS_RULES: ClassRule[] = [
  {
    re: /\bfont-bold\b/,
    rule: "font-weight",
    message: "never font-bold — use <Text bold> or font-semibold (kumo-design font-weight)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\btracking-/,
    rule: "font-tracking",
    message: "never change tracking (kumo-design font-tracking)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\btransition-colors\b|\btransition-all\b|\bduration-\d+/,
    rule: "hover-color-transitions",
    message: "no colour/hover transitions (kumo-design hover-color-transitions)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\bdark:/,
    rule: "no-dark-variant",
    message: "no dark: variants — Kumo themes through light-dark()",
    scopes: ["screen", "kit"],
  },
  {
    re: /\b(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via)-(?:red|blue|green|zinc|gray|slate|stone|neutral|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d+)?\b/,
    rule: "semantic-tokens",
    message:
      "raw Tailwind colour — use kumo tokens (bg-kumo-base, text-kumo-subtle, ring-kumo-hairline …)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\bshadow-(?:xs|sm|md|lg|xl|2xl)\b/,
    rule: "shadow-borders",
    message: "no drop shadows in screens — LayerCard/Surface carry the elevation",
    scopes: ["screen"],
  },
  {
    re: /\buppercase\b/,
    rule: "heading-case",
    message: "never uppercase — sentence case (kumo-design heading-case)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\btext-(?:lg|xl|2xl|3xl|4xl|5xl)\b/,
    rule: "content-text-size",
    message:
      'content text is 14px — page titles come from PageLayout, section titles from SectionCard/Text variant="heading"',
    scopes: ["screen"],
  },
  {
    re: /\bp-5\b/,
    rule: "text-spacing",
    message: "optically balance padding around text: px-5 py-4, not p-5 (kumo-design text-spacing)",
    scopes: ["screen", "kit"],
  },
  {
    re: /\b(?:mx-auto|max-w-\[\d+px\]|max-w-(?:screen|[4-7]xl))\b/,
    rule: "page-container",
    message:
      'screens never size the page — PageLayout owns the container (width="narrow" for forms)',
    scopes: ["screen"],
  },
  {
    re: /(?:^|[\s"'`])-?[a-z-]+-\[\d+(?:\.\d+)?px\]/,
    rule: "arbitrary-values",
    message: "no arbitrary pixel values in screens — use the spacing scale or a @cloudhal/ui block",
    scopes: ["screen"],
  },
];

const SURFACE_RE =
  /className=(?:"|\{`|\{cn\()[^>]*?\brounded-(?:sm|md|lg|xl|2xl)\b[^>]*?\b(?:ring|border|shadow-)/;

/** The attributes of the JSX opening tag at `index`, with `{…}` expressions blanked out. */
function topLevelAttributes(text: string, index: number): string {
  let depth = 0;
  let out = "";
  for (let i = index; i < text.length; i++) {
    const c = text[i] as string;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && c === ">") break;
    if (depth === 0 && c !== "}") out += c;
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Lints one file's source. `rel` is the path relative to `apps/studio/src` (screens) or the repo. */
export function lintSource(rel: string, text: string, scope: Scope): Violation[] {
  if (scope === "none") return [];
  const out: Violation[] = [];
  const add = (rule: string, message: string, index?: number) =>
    out.push({ rule, message, ...(index !== undefined ? { line: lineOf(text, index) } : {}) });

  // Class names (also catches cn(...) arguments and template strings).
  for (const r of CLASS_RULES) {
    if (!r.scopes.includes(scope)) continue;
    const m = r.re.exec(text);
    if (m) add(r.rule, r.message, m.index);
  }

  if (/DANGEROUS_className/.test(text))
    add(
      "no-dangerous-classname",
      "DANGEROUS_className restyles Kumo — use the component's props or a @cloudhal/ui block",
      text.indexOf("DANGEROUS_className"),
    );
  if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(text))
    add("no-html-injection", "never inject HTML — agent/server text is always plain <Text>");
  // Kumo's chart and map tooltip hooks insert their return value as raw HTML (RFC-0006 §10.1):
  // country names and paths come from data, so the escaping default tooltip is the only one.
  const htmlTooltip = /\b(?:tooltipFormatter|dangerousHtmlFormatter)\s*[=:]/.exec(text);
  if (htmlTooltip)
    add(
      "no-html-tooltip",
      "chart/map tooltip formatters are injected as HTML — keep Kumo's default (escaped) tooltip; name regions through the data (CountryMap does) and put details in the table",
      htmlTooltip.index,
    );
  for (const m of text.matchAll(
    /from\s+["'](lucide-react|@heroicons\/[^"']+|react-icons[^"']*|@tabler\/icons-react|@radix-ui\/react-icons)["']/g,
  ))
    add("icons", `icons come from @phosphor-icons/react, not ${m[1]}`, m.index);

  if (scope === "kit") return out;

  // ---- screens only ----
  for (const [el, use] of Object.entries(FORBIDDEN_ELEMENTS)) {
    const m = new RegExp(`<${el}(?=[\\s>/])`).exec(text);
    if (m) add("kumo-elements", `raw <${el}> — use ${use}`, m.index);
  }
  const kumo = /from\s+["']@cloudflare\/kumo(?:\/[^"']*)?["']/.exec(text);
  if (kumo)
    add(
      "ui-entry",
      "import UI from @cloudhal/ui (or @cloudhal/ui/code), never @cloudflare/kumo directly",
      kumo.index,
    );
  const base = /from\s+["']@base-ui\/react[^"']*["']/.exec(text);
  if (base) add("ui-entry", "import UI from @cloudhal/ui, never @base-ui/react", base.index);

  const surface = SURFACE_RE.exec(text);
  if (surface)
    add(
      "no-ad-hoc-surface",
      "hand-made card/panel (rounded + ring/border) — use SectionCard, LayerCard, Surface or InsetPanel from @cloudhal/ui; if none fits, add a block to packages/ui",
      surface.index,
    );

  // Page anatomy: one header, one container, crumbs in the top bar.
  if (rel !== "components/Crumbs.tsx") {
    const crumbs = /<Breadcrumbs[\s>.]/.exec(text);
    if (crumbs)
      add(
        "page-anatomy",
        "breadcrumbs are built with <Crumbs>/<SiteCrumbs> and passed to PageLayout crumbs",
        crumbs.index,
      );
  }
  for (const name of ["PageHeader", "ResourceListPage"]) {
    const m = new RegExp(`<${name}[\\s>]`).exec(text);
    if (m)
      add("page-anatomy", `screens render <PageLayout>, which composes Kumo's ${name}`, m.index);
  }
  const framed = /<LayerCard[^>]*>\s*<Empty\b/.exec(text);
  if (framed)
    add(
      "empty-frame",
      "Kumo Empty draws its own frame — on the page use a bare <Empty> in place of the table; inside a card or cell use <SectionEmpty>",
      framed.index,
    );
  for (const m of text.matchAll(/<Empty\b/g)) {
    if (/\sclassName=/.test(topLevelAttributes(text, m.index ?? 0)))
      add(
        "empty-frame",
        "don't restyle Kumo Empty — use <SectionEmpty> (frameless, for cards/cells) from @cloudhal/ui",
        m.index,
      );
  }
  const tipTrigger = /<\w+\.Trigger\b[^>]*render=\{\s*<Tooltip\b/.exec(text);
  if (tipTrigger)
    add(
      "trigger-tooltip",
      "a Tooltip as a menu/popover trigger swallows the trigger's props (the menu never opens) — nest the other way: <Tooltip render={<DropdownMenu.Trigger render={<Button …/>} />} />",
      tipTrigger.index,
    );
  const split = /<Grid[^>]*variant="(?:2-1|1-2|side-by-side)"/.exec(text);
  if (split)
    add(
      "page-anatomy",
      "page splits use <Columns> (container-aware) — Kumo Grid's 2-1/1-2 switch at the viewport and squeeze next to the sidebar; keep Grid for evenly sized tiles",
      split.index,
    );
  const content = /<Content[\s>]/.exec(text);
  if (content)
    add("page-anatomy", "<Content> is gone — PageLayout owns the container", content.index);

  // Dialogs are always rendered and controlled by `open` (kumo-design dialog-rendering).
  const cond =
    /\{[^{}]*?&&\s*\(?\s*<(Dialog|LayerDialog|DeleteResource|ApprovalDialog|ConfirmDialog|\w+Dialog)\b/.exec(
      text,
    );
  if (cond)
    add(
      "dialog-rendering",
      `never render <${cond[1]}> conditionally — always render it and control open`,
      cond.index,
    );

  // LayerDialog.Content takes its parts directly (Kumo throws on fragments/conditionals).
  const ldc = /<LayerDialog\.Content[^>]*>\s*(?:\{|<>)/.exec(text);
  if (ldc)
    add(
      "layer-dialog-parts",
      "LayerDialog.Content children must be Title/Description/Body/Actions directly — branch inside each part",
      ldc.index,
    );

  // Never stack LayerCard on LayerCard (SectionCard is a LayerCard).
  const stack: { name: string; index: number }[] = [];
  for (const m of text.matchAll(
    /<(\/?)(LayerCard|SectionCard|SettingsSection)(?=[\s>/])([^>]*?)(\/?)>/g,
  )) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) {
      stack.pop();
    } else {
      if (stack.length > 0) {
        add(
          "layer-card-nesting",
          `<${name}> inside <${stack.at(-1)?.name}> — never stack cards; use InsetPanel or a divided list inside`,
          m.index,
        );
      }
      stack.push({ name: name as string, index: m.index ?? 0 });
    }
  }

  // Every user-facing string goes through useT() (JSX text nodes with letters).
  for (const m of text.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)) {
    if (/ID$/.test(m[1] ?? "")) continue;
    add("i18n", `hard-coded text "${m[1]}" — use t("…") with keys in en.ts and tr.ts`, m.index);
  }

  // Route files: registered template and its blocks.
  if (rel.startsWith("routes/")) {
    const template = ROUTE_TEMPLATES[rel];
    if (!template) {
      add(
        "route-template",
        `new route file — register it in ROUTE_TEMPLATES (apps/studio/scripts/design-lint.ts) with one of: ${Object.keys(TEMPLATE_REQUIRES).join(", ")} (DESIGN.md §2)`,
      );
    } else {
      const missing = TEMPLATE_REQUIRES[template].filter((n) =>
        n.endsWith("=")
          ? !text.includes(n)
          : !new RegExp(`\\b${n.replace(".", "\\.")}\\b`).test(text),
      );
      if (missing.length)
        add(
          "route-template",
          `"${template}" template must be built from ${missing.join(", ")} (DESIGN.md §2)`,
        );
    }
  }
  return out;
}

export function lintFile(absPath: string): Violation[] {
  const scope = scopeOf(absPath);
  if (scope === "none") return [];
  const rel = path.relative(scope === "screen" ? STUDIO_SRC : REPO, absPath);
  return lintSource(rel, readFileSync(absPath, "utf8"), scope);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Every file the lint covers. */
export function allFiles(): string[] {
  return [
    ...walk(path.join(STUDIO_SRC, "routes")),
    ...walk(path.join(STUDIO_SRC, "components")),
    ...walk(UI_BLOCKS),
  ].filter((f) => scopeOf(f) !== "none");
}

export function format(file: string, violations: Violation[]): string {
  const rel = path.relative(REPO, file);
  return violations
    .map((v) => `${rel}${v.line ? `:${v.line}` : ""}  [${v.rule}] ${v.message}`)
    .join("\n");
}

const FOOTER =
  "Fix with Kumo via @cloudhal/ui: `pnpm kumo ls`, `pnpm kumo doc <Component>`, `pnpm kumo blocks`. Rules: docs/design/DESIGN.md §7, .agents/skills/studio-ui.";

async function main(argv: string[]) {
  if (argv.includes("--hook")) {
    // Claude Code PostToolUse: {"tool_input": {"file_path": …}}. Exit 2 sends stderr back to the agent.
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    let file: string | undefined;
    try {
      const data = JSON.parse(input) as { tool_input?: { file_path?: string } };
      file = data.tool_input?.file_path;
    } catch {
      return;
    }
    if (!file || scopeOf(file) === "none") return;
    let violations: Violation[];
    try {
      violations = lintFile(file);
    } catch {
      return; // deleted or unreadable: nothing to say
    }
    if (violations.length === 0) return;
    process.stderr.write(
      `Design lint failed (Kumo design system):\n${format(file, violations)}\n${FOOTER}\n`,
    );
    process.exit(2);
  }
  const files = argv.filter((a) => !a.startsWith("--"));
  const targets = files.length ? files.map((f) => path.resolve(f)) : allFiles();
  let failed = 0;
  for (const f of targets) {
    const v = lintFile(f);
    if (v.length) {
      failed += v.length;
      console.error(format(f, v));
    }
  }
  if (failed) {
    console.error(`\n${failed} design violation(s). ${FOOTER}`);
    process.exit(1);
  }
  console.log(`design lint: ${targets.length} file(s) clean`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
