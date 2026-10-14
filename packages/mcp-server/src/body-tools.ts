/**
 * Body tools (RFC-0014 §4, ADR-0028): read a markdown body as blocks, edit it by block, and see
 * what changed in one page or article between two versions.
 *
 * - `get_body` returns the blocks with their ids and hashes (and who last wrote each).
 * - `edit_body` applies up to 50 operations in one write. A stale `rev` is rebased when every
 *   block the operations name still exists and carries the `ifHash` the agent read; anything else
 *   is a conflict with the current blocks to read again. Every write is snapshotted. With
 *   `mode: "propose"` it files the operations for a person instead (any mode, `plan` included).
 * - `diff_node` compares a node across snapshots (or with its current draft), body block by block.
 */
import type { ContentEntry, Page, Snapshot } from "@cloudhal/core-contracts";
import { SnapshotSchema } from "@cloudhal/core-contracts";
import {
  applyBodyOps,
  type BlockWriter,
  type BodyOp,
  BodyOpError,
  bodyDiff,
  currentBlocks,
  type EditOp,
  expandBlockOps,
  MAX_BODY_OPS,
  opTargets,
  unknownBlockTypes,
} from "@cloudhal/core-ts";
import { directiveProps, parseDirective } from "@cloudhal/core-ts/directives";
import {
  autoSnapshot,
  entryLimitCheck,
  id,
  type JsonSchema,
  mapError,
  obj,
  quote,
  str,
  strip,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";

const SNAPSHOT = strip(SnapshotSchema);

/** Where a body lives: an article's, or one rich-text section of a page. */
const TARGET = {
  entryId: { ...id, description: "The article whose body to read or edit" },
  pageId: { ...id, description: "With sectionId: a page's rich-text section instead" },
  sectionId: { ...id, description: "The rich-text section of pageId" },
};

const BLOCK_ID = { type: "string", pattern: "^blk_[0-9A-Za-z]{8,24}$" };
const HASH = { type: "string", pattern: "^[0-9a-f]{64}$" };

const OPS: JsonSchema = {
  type: "array",
  minItems: 1,
  maxItems: MAX_BODY_OPS,
  description:
    "Applied in order. Ids come from get_body. `ifHash` (the block's hash from get_body) refuses the op if someone changed the block since, and lets the server rebase a stale rev.",
  items: {
    oneOf: [
      obj(
        {
          op: { type: "string", enum: ["replace"] },
          block: BLOCK_ID,
          ifHash: HASH,
          markdown: str("The block's new markdown (exactly one block)"),
        },
        ["op", "block", "markdown"],
      ),
      obj(
        {
          op: { type: "string", enum: ["replaceText"] },
          block: BLOCK_ID,
          ifHash: HASH,
          find: str("Text that occurs exactly once in the block", { minLength: 1 }),
          replace: str("What replaces it"),
        },
        ["op", "block", "find", "replace"],
      ),
      obj(
        {
          op: { type: "string", enum: ["insert"] },
          after: { ...BLOCK_ID, type: ["string", "null"], description: "null: at the start" },
          markdown: str("One or more new blocks"),
        },
        ["op", "after", "markdown"],
      ),
      obj(
        {
          op: { type: "string", enum: ["move"] },
          block: BLOCK_ID,
          ifHash: HASH,
          after: { ...BLOCK_ID, type: ["string", "null"], description: "null: to the start" },
        },
        ["op", "block", "after"],
      ),
      obj({ op: { type: "string", enum: ["delete"] }, block: BLOCK_ID, ifHash: HASH }, [
        "op",
        "block",
      ]),
      obj(
        {
          op: { type: "string", enum: ["insertBlock"] },
          after: { ...BLOCK_ID, type: ["string", "null"], description: "null: at the start" },
          type: str("A block type allowed in bodies (list_block_types)"),
          props: {
            type: "object",
            description:
              "The type's props (scalars only in bodies); written as the block's attributes for you",
          },
          markdown: str(
            "A container type's inner text (markdown); leave out for types without text",
          ),
        },
        ["op", "after", "type", "props"],
      ),
      obj(
        {
          op: { type: "string", enum: ["setProps"] },
          block: BLOCK_ID,
          ifHash: HASH,
          props: {
            type: "object",
            description:
              "Props to change, merged onto the block's (null removes one); its inner text stays",
          },
        },
        ["op", "block", "props"],
      ),
    ],
  },
};

const BLOCK_OUT: JsonSchema = obj(
  {
    id: { type: "string" },
    hash: { type: "string" },
    type: { type: "string" },
    markdown: { type: "string" },
    props: { type: "object", description: "A typed block's props (type directive:<name>)" },
    by: { type: "object" },
    via: { type: "string" },
    at: { type: "string" },
  },
  ["id", "hash", "type", "markdown"],
);

/** The body a call addresses, and how to write it back. */
interface Located {
  siteId: string;
  rev: number;
  markdown: string;
  index: ContentEntry["body"]["blocks"];
  title: string;
  kind: "article" | "page";
  entry?: ContentEntry;
  page?: Page;
  write: (markdown: string, writer: BlockWriter) => Promise<{ rev: number }>;
}

async function locate(a: Record<string, unknown>, ctx: ToolContext): Promise<Located> {
  if (typeof a.entryId === "string") {
    if (a.pageId !== undefined || a.sectionId !== undefined)
      throw new ToolError("invalid", "give entryId, or pageId with sectionId, not both");
    const entry = await ctx.store.getContentEntry(a.entryId);
    if (!entry || entry.siteId !== a.siteId)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    if (entry.body.format !== "markdown")
      throw new ToolError(
        "invalid",
        `entry ${entry.id} has an HTML body, which only a person can change in Studio; agents write markdown`,
      );
    return {
      siteId: entry.siteId,
      rev: entry.rev,
      markdown: entry.body.value,
      index: entry.body.blocks,
      title: entry.title,
      kind: "article",
      entry,
      write: async (markdown, writer) =>
        ctx.store.updateContentEntry(
          { ...entry, body: { ...entry.body, value: markdown } },
          { writer },
        ),
    };
  }
  if (typeof a.pageId !== "string" || typeof a.sectionId !== "string")
    throw new ToolError("invalid", "give entryId, or pageId with sectionId");
  const page = await ctx.store.getPage(a.pageId);
  if (!page || page.siteId !== a.siteId)
    throw new ToolError("not_found", `page ${a.pageId} not found`);
  const section = page.sections.find((s) => s.id === a.sectionId);
  if (!section) throw new ToolError("not_found", `section ${a.sectionId} not found on ${page.id}`);
  if (section.kind !== "richText" || section.format !== "markdown")
    throw new ToolError(
      "invalid",
      `section ${section.id} is not a markdown rich-text section; edit other sections with update_page`,
    );
  return {
    siteId: page.siteId,
    rev: page.rev,
    markdown: section.body,
    index: section.blocks,
    title: page.title,
    kind: "page",
    page,
    write: async (markdown, writer) =>
      ctx.store.updatePage(
        {
          ...page,
          sections: page.sections.map((s) =>
            s.id === section.id && s.kind === "richText" ? { ...s, body: markdown } : s,
          ),
        },
        { writer },
      ),
  };
}

const bodyError = (e: BodyOpError) =>
  new ToolError(
    e.code,
    `${e.op !== undefined ? `op ${e.op}: ` : ""}${e.message}${e.code === "conflict" || e.code === "not_found" ? "; read the body again (get_body)" : ""}`,
    e.op !== undefined ? { op: e.op } : {},
  );

/**
 * The new markdown for `ops`, rebasing a stale `rev` when that is safe: every block an op names
 * still exists, and every op that replaces, moves or deletes a block carries the `ifHash` it read.
 */
async function plan(body: Located, rev: number, edits: EditOp[], ctx: ToolContext) {
  const blocks = await currentBlocks(body.markdown, body.index);
  let ops: BodyOp[];
  try {
    ops = expandBlockOps(edits, blocks, ctx.store.blocks);
  } catch (e) {
    if (e instanceof BodyOpError) throw bodyError(e);
    throw e;
  }
  if (rev !== body.rev) {
    const ids = new Set(blocks.map((b) => b.id));
    const missing = ops.flatMap(opTargets).filter((t) => !ids.has(t));
    const unverified = ops.filter(
      (op) => op.op !== "insert" && op.op !== "replaceText" && op.ifHash === undefined,
    );
    if (missing.length || unverified.length)
      throw new ToolError(
        "conflict",
        `the ${body.kind} is at rev ${body.rev}, you sent ${rev}${missing.length ? `; blocks ${missing.join(", ")} are gone` : "; pass ifHash on replace, move and delete to let the server rebase"}. Read it again with get_body`,
        { rev: body.rev },
      );
  }
  try {
    return { blocks, ops, markdown: applyBodyOps(body.markdown, blocks, ops) };
  } catch (e) {
    if (e instanceof BodyOpError) throw bodyError(e);
    throw e;
  }
}

function summary(ops: readonly EditOp[]): string {
  const count = (kind: EditOp["op"]) => ops.filter((o) => o.op === kind).length;
  const parts = [
    [count("replace") + count("replaceText") + count("setProps"), "edit"],
    [count("insert") + count("insertBlock"), "insert"],
    [count("move"), "move"],
    [count("delete"), "delete"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, verb]) => `${verb} ${n} block${n === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** The body a call names, checked against the caller's own limit, and what `ops` make of it. */
async function prepare(a: Record<string, unknown>, ctx: ToolContext) {
  const body = await locate(a, ctx);
  if (ctx.limit) {
    if (!body.entry)
      throw new ToolError("denied", "pages are edited by Editors; you may edit your own articles");
    await entryLimitCheck(ctx, "update", body.entry);
  }
  const { blocks, ops, markdown } = await plan(body, a.rev as number, a.ops as EditOp[], ctx);
  if (markdown === body.markdown) throw new ToolError("invalid", "the operations change nothing");
  return { body, ops, blocks, markdown };
}

/** What a body edit wrote: the new `rev`, the block ids it changed, added and removed. */
export interface BodyEditResult {
  rev: number;
  changed: string[];
  added: string[];
  removed: string[];
  words: { added: number; removed: number };
  /** Block types the body uses that this site does not know (RFC-0015 §7). */
  unknownBlocks?: string[];
}

/**
 * Applies `a.ops` to the body `a` names (`entryId`, or `pageId` with `sectionId`) at `a.rev`, in
 * one write as `writer` (RFC-0014 §4): `edit_body` and REST `PATCH …/body` share it. Own limits
 * come from `ctx.limit`; snapshotting is the caller's.
 */
export async function editBody(
  a: Record<string, unknown>,
  ctx: ToolContext,
  writer: BlockWriter,
): Promise<BodyEditResult> {
  const { body, blocks, markdown } = await prepare(a, ctx);
  try {
    const saved = await body.write(markdown, writer);
    const located = await locate(a, ctx);
    const after = await currentBlocks(located.markdown, located.index);
    const before = new Map(blocks.map((b) => [b.id, b.hash]));
    const now = new Set(after.map((b) => b.id));
    return {
      rev: saved.rev,
      changed: after
        .filter((b) => before.has(b.id) && before.get(b.id) !== b.hash)
        .map((b) => b.id),
      added: after.filter((b) => !before.has(b.id)).map((b) => b.id),
      removed: blocks.filter((b) => !now.has(b.id)).map((b) => b.id),
      words: bodyDiff(body.markdown, markdown).words,
      ...(() => {
        const names = unknownBlockTypes(ctx.store.blocks, { markdown });
        return names.length ? { unknownBlocks: names } : {};
      })(),
    };
  } catch (e) {
    mapError(e);
  }
}

export function bodyTools(): ToolDefinition[] {
  return [
    {
      name: "get_theme_settings",
      title: "Read the design settings",
      description:
        "The theme's design settings (RFC-0017): their schema (colors as #rrggbb, enums, numbers; per-locale titles), the contrast rules colors must meet, and the site's current values. Change them with set_theme_settings; they show on the site after a publish.",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj(
        {
          theme: { type: "string" },
          schema: { type: ["object", "null"] },
          values: { type: "object" },
          rev: { type: "integer" },
        },
        ["theme", "schema", "values", "rev"],
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        if (!site) throw new ToolError("not_found", `site ${a.siteId} not found`);
        return {
          theme: site.theme.name,
          schema: ctx.store.themeSettings ?? null,
          values: site.theme.config ?? {},
          rev: site.rev,
        };
      },
    },
    {
      name: "set_theme_settings",
      title: "Change the design settings",
      description:
        "Change the site's design settings (colors, type, spacing: get_theme_settings lists them). Values are merged onto the current ones; null removes one. They are checked against the theme's schema and contrast rules, and show on the site after a publish. Always waits for a person.",
      inputSchema: obj(
        {
          siteId: id,
          rev: {
            type: "integer",
            minimum: 0,
            description: "The site's rev from get_theme_settings",
          },
          values: { type: "object", description: "Settings to change; null removes one" },
        },
        ["siteId", "rev", "values"],
      ),
      outputSchema: obj({ values: { type: "object" }, rev: { type: "integer" } }, [
        "values",
        "rev",
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a) => {
        const keys = Object.keys((a.values ?? {}) as Record<string, unknown>);
        return `Change the site's design settings (${keys.join(", ") || "none"})?`;
      },
      handler: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        if (!site) throw new ToolError("not_found", `site ${a.siteId} not found`);
        if (!ctx.store.themeSettings)
          throw new ToolError("invalid", "this theme declares no design settings");
        const values: Record<string, unknown> = { ...(site.theme.config ?? {}) };
        for (const [k, v] of Object.entries((a.values ?? {}) as Record<string, unknown>))
          if (v === null) delete values[k];
          else values[k] = v;
        try {
          const saved = await ctx.store.updateSite({
            ...site,
            rev: a.rev as number,
            theme: { ...site.theme, config: values },
          });
          return { values: saved.theme.config ?? {}, rev: saved.rev };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "list_block_types",
      title: "List block types",
      description:
        "The typed blocks this site can use (RFC-0015): callouts, buttons, video embeds, FAQs and the theme's own. Each has a name, where it may go (page sections with kind \"component\", or bodies through edit_body's insertBlock), its props as JSON Schema, whether it wraps text, and an example. Names are plain English and shared across themes.",
      inputSchema: obj(
        {
          siteId: id,
          where: {
            type: "string",
            enum: ["section", "body"],
            description: "Only the types allowed there",
          },
        },
        ["siteId"],
      ),
      outputSchema: obj({ types: { type: "array", items: { type: "object" } } }, ["types"]),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        if (!site) throw new ToolError("not_found", `site ${a.siteId} not found`);
        const where = a.where as "section" | "body" | undefined;
        return {
          types: ctx.store.blocks.list(where).map((t) => ({
            name: t.name,
            title: t.title,
            ...(t.description ? { description: t.description } : {}),
            where: t.where,
            content: t.content ?? "none",
            props: t.props,
            example: t.example,
          })),
        };
      },
    },
    {
      name: "get_body",
      title: "Read body by blocks",
      description:
        "Read a markdown body (an article's, or a page's rich-text section) as blocks: each with its id, hash, type, markdown and who last changed it. Use the ids and hashes with edit_body.",
      inputSchema: obj({ siteId: id, ...TARGET }, ["siteId"]),
      outputSchema: obj(
        {
          rev: { type: "integer" },
          profile: { type: "integer" },
          markdown: { type: "string" },
          blocks: { type: "array", items: BLOCK_OUT },
        },
        ["rev", "markdown", "blocks"],
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const body = await locate(a, ctx);
        return {
          rev: body.rev,
          profile: 1,
          markdown: body.markdown,
          blocks: (await currentBlocks(body.markdown, body.index)).map((b) => {
            // Typed blocks (RFC-0015 §2): their props, read for the agent.
            const d = b.type.startsWith("directive:") ? parseDirective(b.markdown) : undefined;
            return d ? { ...b, props: directiveProps(ctx.store.blocks.get(d.name), d.attrs) } : b;
          }),
        };
      },
    },
    {
      name: "edit_body",
      title: "Edit body by blocks",
      description: `Change a markdown body by block instead of rewriting it: replace a block, replace text inside one, insert, move or delete blocks, insert a typed block (insertBlock: a callout, a button, …; list_block_types) or change one's props (setProps) without writing its syntax (up to ${MAX_BODY_OPS} operations, applied in order, one write). Read the ids with get_body first. A stale rev is rebased when every named block still exists and carries ifHash; otherwise you get a conflict. Other blocks keep their bytes and their authors. Snapshots afterwards. With mode "propose" nothing is written: a person accepts or rejects the operations in Studio.`,
      inputSchema: obj(
        {
          siteId: id,
          ...TARGET,
          rev: { type: "integer", minimum: 0 },
          ops: OPS,
          mode: {
            type: "string",
            enum: ["apply", "propose"],
            description:
              "apply (default) writes now; propose files the operations for a person to accept or reject in Studio and changes nothing (allowed in plan mode)",
          },
          note: str("With propose: why, in a sentence the person will read", { maxLength: 1000 }),
        },
        ["siteId", "rev", "ops"],
      ),
      outputSchema: obj({
        rev: { type: "integer" },
        changed: { type: "array", items: { type: "string" } },
        added: { type: "array", items: { type: "string" } },
        removed: { type: "array", items: { type: "string" } },
        words: obj({ added: { type: "integer" }, removed: { type: "integer" } }),
        unknownBlocks: { type: "array", items: { type: "string" } },
        snapshot: SNAPSHOT,
        proposal: obj({ id: { type: "string" }, status: { type: "string" } }, ["id", "status"]),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      own: "entry",
      // A proposal changes nothing until a person accepts it: every mode may propose (ADR-0028).
      classify: (a) => (a.mode === "propose" ? "propose" : undefined),
      proposeScopes: ["content:read", "content:propose"],
      precheck: async (a, ctx) => {
        if (!ctx.limit) return;
        if (typeof a.entryId !== "string")
          throw new ToolError(
            "denied",
            "pages are edited by Editors; you may edit your own articles",
          );
        const entry = await ctx.store.getContentEntry(a.entryId);
        if (entry && entry.siteId === a.siteId) await entryLimitCheck(ctx, "update", entry);
      },
      approvalPrompt: async (a, ctx) => {
        const ops = (a.ops ?? []) as EditOp[];
        try {
          const body = await locate(a, ctx);
          const { markdown } = await plan(body, a.rev as number, ops, ctx);
          const d = bodyDiff(body.markdown, markdown);
          const what = body.kind === "article" ? "article" : "page";
          return `Edit the body of ${what} "${quote(body.title)}" (${summary(ops)}: +${d.words.added} / −${d.words.removed} words)?`;
        } catch {
          return `Edit a body (${summary(ops)})?`;
        }
      },
      handler: async (a, ctx) => {
        if (a.mode === "propose") {
          const { body, ops } = await prepare(a, ctx);
          try {
            const proposal = await ctx.store.proposals.create({
              siteId: body.siteId,
              nodeId: (a.entryId ?? a.pageId) as string,
              sectionId: a.sectionId as string | undefined,
              ops,
              actor: ctx.principal.actor,
              note: a.note as string | undefined,
            });
            return { proposal: { id: proposal.id, status: proposal.status } };
          } catch (e) {
            if (e instanceof BodyOpError) throw bodyError(e);
            mapError(e);
          }
        }
        const result = await editBody(a, ctx, { actor: ctx.principal.actor, via: "mcp" });
        try {
          return { ...result, snapshot: await autoSnapshot(ctx, a.siteId as string, "edit_body") };
        } catch (e) {
          mapError(e);
        }
      },
      changes: async (a, ctx) => {
        const { body, markdown } = await prepare(a, ctx);
        return {
          kind: "body",
          nodeId: (a.entryId ?? a.pageId) as string,
          ...(typeof a.sectionId === "string" ? { sectionId: a.sectionId } : {}),
          title: body.title,
          diff: bodyDiff(body.markdown, markdown),
        };
      },
    },
    {
      name: "diff_node",
      title: "What changed in a page or article",
      description:
        "Compare one page or article between two versions: the fields that changed, and its body (or each rich-text section) block by block, with the words that changed inside edited blocks. `from` defaults to the live (published) snapshot, `to` to the current draft.",
      inputSchema: obj(
        {
          siteId: id,
          nodeId: id,
          fromSnapshotId: { ...id, description: "Default: the live snapshot" },
          toSnapshotId: { ...id, description: "Default: the current draft" },
        },
        ["siteId", "nodeId"],
      ),
      outputSchema: obj(
        {
          from: { type: "string" },
          to: { type: "string" },
          fields: { type: "array", items: { type: "string" } },
          bodies: { type: "array" },
        },
        ["from", "to", "fields", "bodies"],
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const siteId = a.siteId as string;
        const nodeId = a.nodeId as string;
        const site = await ctx.store.getSite(siteId);
        if (!site) throw new ToolError("not_found", `site ${siteId} not found`);
        const at = async (snapshotId: string | undefined): Promise<Node | undefined> => {
          if (!snapshotId) {
            const node =
              (await ctx.store.getContentEntry(nodeId)) ?? (await ctx.store.getPage(nodeId));
            return node && node.siteId === siteId ? node : undefined;
          }
          const snap: Snapshot | undefined = await ctx.store.getSnapshot(snapshotId);
          if (!snap || snap.siteId !== siteId)
            throw new ToolError("not_found", `snapshot ${snapshotId} not found`);
          const ref = snap.nodes.find((n) => n.id === nodeId);
          return ref && (ref.kind === "contentEntry" || ref.kind === "page")
            ? await ctx.store.readSnapshotNode<Node>(ref)
            : undefined;
        };
        const fromId = (a.fromSnapshotId as string | undefined) ?? site.publishedSnapshotId;
        const toId = a.toSnapshotId as string | undefined;
        const [before, after] = await Promise.all([at(fromId), at(toId)]);
        if (!before && !after)
          throw new ToolError(
            "not_found",
            `${nodeId} is in neither version (pages and articles only)`,
          );
        return {
          from: fromId ?? "none",
          to: toId ?? "draft",
          ...nodeChanges(before, after),
        };
      },
    },
  ];
}

type Node = ContentEntry | Page;
const IGNORED = new Set(["rev", "updatedAt", "createdAt", "schemaVersion"]);

/** Changed fields, and each markdown body's block diff (unchanged blocks without their text). */
export function nodeChanges(before: Node | undefined, after: Node | undefined) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const get = (n: Node | undefined, k: string) => (n as Record<string, unknown> | undefined)?.[k];
  const fields = [...keys]
    .filter(
      (k) => !IGNORED.has(k) && JSON.stringify(get(before, k)) !== JSON.stringify(get(after, k)),
    )
    .sort();
  const bodies: { field: string; counts: unknown; words: unknown; blocks: unknown[] }[] = [];
  const add = (field: string, a: string, b: string) => {
    if (a === b) return;
    const d = bodyDiff(a, b);
    bodies.push({
      field,
      counts: d.counts,
      words: d.words,
      blocks: d.blocks.map((x) => (x.kind === "same" ? { kind: "same" } : x)),
    });
  };
  const text = (n: Node | undefined) =>
    n && "body" in n && n.body.format === "markdown" ? n.body.value : "";
  if ((before && "collection" in before) || (after && "collection" in after))
    add("body", text(before), text(after));
  else {
    const sections = (n: Node | undefined) =>
      new Map(
        ((n as Page | undefined)?.sections ?? []).flatMap((s) =>
          s.kind === "richText" && s.format === "markdown" ? [[s.id, s.body] as const] : [],
        ),
      );
    const a = sections(before);
    const b = sections(after);
    for (const id of new Set([...a.keys(), ...b.keys()]))
      add(`sections.${id}.body`, a.get(id) ?? "", b.get(id) ?? "");
  }
  return { fields, bodies };
}
