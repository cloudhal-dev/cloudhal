/**
 * Body tools (RFC-0014 §4, ADR-0028): read a markdown body as blocks, edit it by block, and see
 * what changed in one page or article between two versions.
 *
 * - `get_body` returns the blocks with their ids and hashes (and who last wrote each).
 * - `edit_body` applies up to 50 operations in one write. A stale `rev` is rebased when every
 *   block the operations name still exists and carries the `ifHash` the agent read; anything else
 *   is a conflict with the current blocks to read again. Every write is snapshotted.
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
  MAX_BODY_OPS,
  opTargets,
} from "@cloudhal/core-ts";
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
    ],
  },
};

const BLOCK_OUT: JsonSchema = obj(
  {
    id: { type: "string" },
    hash: { type: "string" },
    type: { type: "string" },
    markdown: { type: "string" },
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
async function plan(body: Located, rev: number, ops: BodyOp[]) {
  const blocks = await currentBlocks(body.markdown, body.index);
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
    return { blocks, markdown: applyBodyOps(body.markdown, blocks, ops) };
  } catch (e) {
    if (e instanceof BodyOpError) throw bodyError(e);
    throw e;
  }
}

function summary(ops: readonly BodyOp[]): string {
  const count = (kind: BodyOp["op"]) => ops.filter((o) => o.op === kind).length;
  const parts = [
    [count("replace") + count("replaceText"), "edit"],
    [count("insert"), "insert"],
    [count("move"), "move"],
    [count("delete"), "delete"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, verb]) => `${verb} ${n} block${n === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function bodyTools(): ToolDefinition[] {
  return [
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
          blocks: await currentBlocks(body.markdown, body.index),
        };
      },
    },
    {
      name: "edit_body",
      title: "Edit body by blocks",
      description: `Change a markdown body by block instead of rewriting it: replace a block, replace text inside one, insert, move or delete blocks (up to ${MAX_BODY_OPS} operations, applied in order, one write). Read the ids with get_body first. A stale rev is rebased when every named block still exists and carries ifHash; otherwise you get a conflict. Other blocks keep their bytes and their authors. Snapshots afterwards.`,
      inputSchema: obj({ siteId: id, ...TARGET, rev: { type: "integer", minimum: 0 }, ops: OPS }, [
        "siteId",
        "rev",
        "ops",
      ]),
      outputSchema: obj(
        {
          rev: { type: "integer" },
          changed: { type: "array", items: { type: "string" } },
          added: { type: "array", items: { type: "string" } },
          removed: { type: "array", items: { type: "string" } },
          words: obj({ added: { type: "integer" }, removed: { type: "integer" } }),
          snapshot: SNAPSHOT,
        },
        ["rev", "changed", "added", "removed", "snapshot"],
      ),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["content:write"],
      own: "entry",
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
        const ops = (a.ops ?? []) as BodyOp[];
        try {
          const body = await locate(a, ctx);
          const { markdown } = await plan(body, a.rev as number, ops);
          const d = bodyDiff(body.markdown, markdown);
          const what = body.kind === "article" ? "article" : "page";
          return `Edit the body of ${what} "${quote(body.title)}" (${summary(ops)}: +${d.words.added} / −${d.words.removed} words)?`;
        } catch {
          return `Edit a body (${summary(ops)})?`;
        }
      },
      handler: async (a, ctx) => {
        const body = await locate(a, ctx);
        if (ctx.limit) {
          if (!body.entry)
            throw new ToolError(
              "denied",
              "pages are edited by Editors; you may edit your own articles",
            );
          await entryLimitCheck(ctx, "update", body.entry);
        }
        const ops = a.ops as BodyOp[];
        const { blocks, markdown } = await plan(body, a.rev as number, ops);
        if (markdown === body.markdown)
          throw new ToolError("invalid", "the operations change nothing");
        try {
          const saved = await body.write(markdown, { actor: ctx.principal.actor, via: "mcp" });
          const located = await locate(a, ctx);
          const after = await currentBlocks(located.markdown, located.index);
          const before = new Map(blocks.map((b) => [b.id, b.hash]));
          const now = new Set(after.map((b) => b.id));
          const d = bodyDiff(body.markdown, markdown);
          const snapshot = await autoSnapshot(ctx, body.siteId, "edit_body");
          return {
            rev: saved.rev,
            changed: after
              .filter((b) => before.has(b.id) && before.get(b.id) !== b.hash)
              .map((b) => b.id),
            added: after.filter((b) => !before.has(b.id)).map((b) => b.id),
            removed: blocks.filter((b) => !now.has(b.id)).map((b) => b.id),
            words: d.words,
            snapshot,
          };
        } catch (e) {
          mapError(e);
        }
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
