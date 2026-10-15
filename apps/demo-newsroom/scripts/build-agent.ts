/**
 * A scripted builder agent (RFC-0020 §6, the Build view demo): connects to Cloudhal over MCP like
 * any agent, reads the catalog, then builds a landing page on a draft step by step with
 * `patch_draft`. On purpose it makes one mistake and one typo, so the Build view shows Cloudhal
 * refusing the first (VALIDATION_FAILED, fixed on the next call) and repairing the second.
 *
 *   CLOUDHAL_API_KEY=<key> node apps/demo-newsroom/scripts/build-agent.ts \
 *     --url http://localhost:8787/mcp --site <siteId> --page <pageId> [--delay 900]
 *
 * The key needs `content:read` and `content:write`. Nothing is published: a person reviews the
 * draft in Studio and publishes it.
 */
import { parseArgs } from "node:util";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

interface ToolResult {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
}

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    site: { type: "string" },
    page: { type: "string" },
    delay: { type: "string", default: "900" },
  },
});
const key = process.env.CLOUDHAL_API_KEY;
if (!values.url || !values.site || !values.page || !key) {
  console.error("usage: CLOUDHAL_API_KEY=… build-agent.ts --url <mcp url> --site <id> --page <id>");
  process.exit(2);
}
const siteId = values.site;
const pageId = values.page;
const pause = () => new Promise((r) => setTimeout(r, Number(values.delay)));

const client = new Client({ name: "cloudhal-build-agent", version: "0.0.1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(values.url), {
    requestInit: { headers: { "x-api-key": key } },
  }),
);

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}
const text = (r: ToolResult) => r.content?.map((c) => c.text ?? "").join("\n") ?? "";

const catalog = await call("get_catalog", { siteId });
const components = (catalog.structuredContent?.components as string[] | undefined) ?? [];
console.log(`catalog ${catalog.structuredContent?.catalog}: ${components.length} components`);

const page = (await call("get_page", { siteId, pageId })).structuredContent?.page as {
  rev: number;
  sections: unknown[];
};
let rev = page.rev;
const at = page.sections.length; // the surface goes after the page's sections
const base = `/sections/${at}/components`;

/** Sends one step; on VALIDATION_FAILED, prints the issues and returns false. */
async function step(label: string, ops: unknown[]): Promise<boolean> {
  const r = await call("patch_draft", { siteId, pageId, rev, ops });
  if (r.isError) {
    console.log(`✗ ${label}\n  ${text(r).split("\n")[0]}`);
    return false;
  }
  const out = r.structuredContent as { page: { rev: number }; repairs: string[] };
  rev = out.page.rev;
  console.log(`✓ ${label}${out.repairs.length ? `  (repaired: ${out.repairs.join("; ")})` : ""}`);
  await pause();
  return true;
}
const C = (id: string, component: string, props?: object, children?: string[]) => ({
  id,
  component,
  ...(props ? { props } : {}),
  ...(children ? { children } : {}),
});
/** Adds components and links the first under a parent. */
const add = (parent: number, ...items: ReturnType<typeof C>[]) => [
  ...items.map((value) => ({ op: "add", path: `${base}/-`, value })),
  ...items
    .filter((c, i) => i === 0 || !items.some((p) => p.children?.includes(c.id)))
    .map((c) => ({ op: "add", path: `${base}/${parent}/children/-`, value: c.id })),
];

await step("start a surface", [
  {
    op: "add",
    path: "/sections/-",
    value: {
      id: "sec_buildlanding1",
      kind: "surface",
      catalog: catalog.structuredContent?.catalog,
      // A typo the catalog repairs: "stack" → "Stack".
      components: [C("root", "stack", { gap: "xl" }, [])],
      data: { headline: "Built live by an agent", pages: 128 },
    },
  },
]);
await step(
  "hero band",
  add(0, C("hero", "Band", { tone: "inverse", width: "narrow", spacing: "xl" }, [])),
);
// Component 1 is the band; its stack holds the hero's text.
await step("hero stack", [
  {
    op: "add",
    path: `${base}/-`,
    value: C("hero-stack", "Stack", { gap: "m", align: "center" }, []),
  },
  { op: "add", path: `${base}/1/children/-`, value: "hero-stack" },
]);
// A mistake: headings go up to level 4. Cloudhal refuses it with a JSON Pointer…
const heading = (level: number) => [
  {
    op: "add",
    path: `${base}/-`,
    value: C("title", "Heading", { text: { path: "/headline" }, level, align: "center" }),
  },
  { op: "add", path: `${base}/2/children/-`, value: "title" },
];
if (!(await step("headline", heading(7)))) await step("headline, fixed", heading(1));
await step("lede and call to action", [
  {
    op: "add",
    path: `${base}/-`,
    value: C("lede", "Text", {
      text: "Every step was **checked against the theme's catalog** as it landed.",
      size: "l",
      align: "center",
    }),
  },
  { op: "add", path: `${base}/2/children/-`, value: "lede" },
  {
    op: "add",
    path: `${base}/-`,
    value: C("cta", "Button", { label: "Publish when ready", href: "/about", variant: "primary" }),
  },
  { op: "add", path: `${base}/2/children/-`, value: "cta" },
]);
await step("stats", [
  ...add(
    0,
    C("stats", "Grid", { columns: 3, gap: "l" }, ["s1", "s2", "s3"]),
    C("s1", "Stat", {
      value: { call: "formatNumber", args: { value: { path: "/pages" } } },
      label: "Operations validated",
    }),
    C("s2", "Stat", { value: "0", label: "Lines of code written" }),
    C("s3", "Stat", { value: "1", label: "Person who publishes" }),
  ),
]);
await step("questions", [
  ...add(
    0,
    C("faq", "Accordion", undefined, ["q1", "q2"]),
    C("q1", "Disclosure", { summary: "What did the agent write?" }, ["a1"]),
    C("a1", "Text", { text: "Components from the catalog, as data. Cloudhal rendered them." }),
    C("q2", "Disclosure", { summary: "Is it live?" }, ["a2"]),
    C("a2", "callout", { tone: "info", content: "Not yet — it is a draft until you publish it." }),
  ),
]);
console.log(`done at rev ${rev}; review and publish the draft in Studio`);
await client.close();
