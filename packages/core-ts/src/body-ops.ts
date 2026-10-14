/**
 * Block-addressed edits of a markdown body (RFC-0014 §4): `edit_body`'s engine, pure and
 * Worker-safe. Operations apply in order to the body's blocks (ids from `currentBlocks`); the
 * result is checked against the profile's splitter, so an op can never silently merge with or
 * split its neighbours (invariant 3).
 *
 * Typed blocks (RFC-0015 §7) have two more operations, `insertBlock` and `setProps`, so agents
 * never write directive syntax by hand. `expandBlockOps` turns them into `insert` and `replace`
 * against the registry before anything applies, so proposals, approvals and Studio see the
 * ordinary operations.
 */
import type { BodyBlock } from "@cloudhal/core-contracts";
import type { BlockRegistry } from "./blocks.ts";
import { splitMarkdown } from "./body-blocks.ts";
import {
  checkDirective,
  type DirectiveAttrs,
  directiveProps,
  parseDirective,
  writeDirective,
} from "./directives.ts";

export type BodyOp =
  /** The block becomes `markdown` (exactly one block). `ifHash` refuses if it changed. */
  | { op: "replace"; block: string; ifHash?: string; markdown: string }
  /** `find` must occur exactly once in the block; the result must stay one block. */
  | { op: "replaceText"; block: string; ifHash?: string; find: string; replace: string }
  /** New blocks after `after` (null: at the start). */
  | { op: "insert"; after: string | null; markdown: string }
  | { op: "move"; block: string; after: string | null; ifHash?: string }
  | { op: "delete"; block: string; ifHash?: string };

/** Typed-block operations (RFC-0015 §7), expanded by `expandBlockOps`. */
export type BlockOp =
  /**
   * A new block of `type` after `after` (null: at the start). `markdown` is a container's inner
   * text (a container without it starts empty); a leaf takes none.
   */
  | {
      op: "insertBlock";
      after: string | null;
      type: string;
      props: Record<string, unknown>;
      markdown?: string;
    }
  /** Changes a block's props (merged; `null` removes one) and keeps its inner text. */
  | { op: "setProps"; block: string; ifHash?: string; props: Record<string, unknown> };

/** What `edit_body` and REST `PATCH …/body` accept. */
export type EditOp = BodyOp | BlockOp;

export const MAX_BODY_OPS = 50;

/** Why ops cannot apply: a block is gone or changed, or an op is malformed. */
export class BodyOpError extends Error {
  readonly code: "not_found" | "conflict" | "invalid";
  /** Index of the op that failed. */
  readonly op: number | undefined;
  constructor(code: BodyOpError["code"], message: string, op?: number) {
    super(message);
    this.code = code;
    this.op = op;
  }
}

const BLOCK_ID = /^blk_[0-9A-Za-z]{8,24}$/;
const HASH = /^[0-9a-f]{64}$/;

/**
 * Operations from outside a typed caller (REST `PATCH …/body`), checked for shape: known `op`,
 * block ids, hashes and strings where they belong. Unknown keys are dropped. Whether they apply is
 * `applyBodyOps`'s question.
 */
export function parseBodyOps(raw: unknown): EditOp[] {
  if (!Array.isArray(raw) || raw.length === 0)
    throw new BodyOpError("invalid", "ops: a list of operations");
  if (raw.length > MAX_BODY_OPS)
    throw new BodyOpError("invalid", `at most ${MAX_BODY_OPS} operations per call`);
  return raw.map((x, n) => {
    const bad = (what: string): never => {
      throw new BodyOpError("invalid", what, n);
    };
    if (typeof x !== "object" || x === null) return bad("an operation is an object");
    const o = x as Record<string, unknown>;
    const block = () =>
      typeof o.block === "string" && BLOCK_ID.test(o.block) ? o.block : bad("block: a block id");
    const text = (key: string) =>
      typeof o[key] === "string" ? (o[key] as string) : bad(`${key}: text`);
    const after = () =>
      o.after === null
        ? null
        : typeof o.after === "string" && BLOCK_ID.test(o.after)
          ? o.after
          : bad("after: a block id, or null for the start");
    const ifHash = () => {
      if (o.ifHash === undefined) return {};
      return typeof o.ifHash === "string" && HASH.test(o.ifHash)
        ? { ifHash: o.ifHash }
        : bad("ifHash: the block's hash");
    };
    switch (o.op) {
      case "replace":
        return { op: "replace", block: block(), ...ifHash(), markdown: text("markdown") };
      case "replaceText":
        return {
          op: "replaceText",
          block: block(),
          ...ifHash(),
          find: text("find"),
          replace: text("replace"),
        };
      case "insert":
        return { op: "insert", after: after(), markdown: text("markdown") };
      case "move":
        return { op: "move", block: block(), after: after(), ...ifHash() };
      case "delete":
        return { op: "delete", block: block(), ...ifHash() };
      case "insertBlock": {
        const props = isProps(o.props) ? o.props : bad("props: an object");
        const type = typeof o.type === "string" ? o.type : bad("type: a block type name");
        return {
          op: "insertBlock",
          after: after(),
          type,
          props,
          ...(o.markdown === undefined ? {} : { markdown: text("markdown") }),
        };
      }
      case "setProps":
        return {
          op: "setProps",
          block: block(),
          ...ifHash(),
          props: isProps(o.props) ? o.props : bad("props: an object"),
        };
      default:
        return bad("op: replace, replaceText, insert, move, delete, insertBlock or setProps");
    }
  });
}

const isProps = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `ops` with `insertBlock` and `setProps` turned into `insert` and `replace` (the directive
 * written for the agent), checked against `registry`: a known body type, props that fit. `blocks`
 * are the body's current blocks (`currentBlocks`). A `setProps` without `ifHash` is pinned to the
 * block as it is now, since its props merge onto what is there.
 */
export function expandBlockOps(
  ops: readonly EditOp[],
  blocks: readonly { id: string; hash: string; markdown: string }[],
  registry: BlockRegistry,
): BodyOp[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const known = (name: string, n: number) => {
    const type = registry.get(name);
    if (!type)
      throw new BodyOpError("invalid", `unknown block type "${name}"; call list_block_types`, n);
    return type;
  };
  const check = (
    name: string,
    attrs: Record<string, unknown>,
    content: string | undefined,
    n: number,
  ) => {
    const issues = checkDirective(registry, {
      name,
      attrs: attrs as DirectiveAttrs,
      fence: 3,
      ...(content === undefined ? {} : { content }),
    });
    if (issues?.length)
      throw new BodyOpError(
        "invalid",
        `${name}: ${issues.map((i) => `${i.path || "props"} ${i.message}`).join("; ")}`,
        n,
      );
  };
  return ops.map((op, n): BodyOp => {
    if (op.op === "insertBlock") {
      const type = known(op.type, n);
      const container = type.content === "markdown";
      if (!container && op.markdown !== undefined)
        throw new BodyOpError("invalid", `${op.type} wraps no text: leave markdown out`, n);
      const content = container ? (op.markdown ?? "") : undefined;
      check(op.type, op.props, content, n);
      return {
        op: "insert",
        after: op.after,
        markdown: writeDirective(op.type, op.props, content),
      };
    }
    if (op.op === "setProps") {
      const block = byId.get(op.block);
      if (!block) throw new BodyOpError("not_found", `block ${op.block} not found`, n);
      if (op.ifHash !== undefined && op.ifHash !== block.hash)
        throw new BodyOpError("conflict", `block ${op.block} changed since you read it`, n);
      const d = parseDirective(block.markdown);
      if (!d) throw new BodyOpError("invalid", `block ${op.block} is not a typed block`, n);
      const type = known(d.name, n);
      const props: Record<string, unknown> = directiveProps(type, d.attrs);
      for (const [key, value] of Object.entries(op.props))
        if (value === null) delete props[key];
        else props[key] = value;
      check(d.name, props, d.content, n);
      return {
        op: "replace",
        block: op.block,
        ifHash: block.hash,
        markdown: writeDirective(d.name, props, d.content),
      };
    }
    return op;
  });
}

interface Item {
  id?: string;
  markdown: string;
  /** Position in the original body, while the block is untouched (keeps its spacing). */
  origin?: number;
}

const blocksOf = (markdown: string) => splitMarkdown(markdown).units.map((u) => u.raw.trimEnd());

/** Ids an op refers to (for rebasing and approval prompts). */
export function opTargets(op: BodyOp): string[] {
  if (op.op === "insert") return op.after ? [op.after] : [];
  if (op.op === "move") return [op.block, ...(op.after ? [op.after] : [])];
  return [op.block];
}

/**
 * Applies `ops` to a body whose blocks are `blocks` (in order, from `currentBlocks`). Returns the
 * new markdown; untouched neighbours keep their original spacing.
 */
export function applyBodyOps(
  markdown: string,
  blocks: readonly Pick<BodyBlock, "id" | "hash">[],
  ops: readonly BodyOp[],
): string {
  if (ops.length === 0) throw new BodyOpError("invalid", "no operations");
  if (ops.length > MAX_BODY_OPS)
    throw new BodyOpError("invalid", `at most ${MAX_BODY_OPS} operations per call`);
  const split = splitMarkdown(markdown);
  if (split.units.length !== blocks.length)
    throw new BodyOpError("conflict", "the body changed since its blocks were read");
  const hashOf = new Map(blocks.map((b) => [b.id, b.hash]));
  const spacing = split.units.map((u) => u.text.slice(u.raw.trimEnd().length));
  let items: Item[] = split.units.map((u, i) => ({
    id: (blocks[i] as BodyBlock).id,
    markdown: u.raw.trimEnd(),
    origin: i,
  }));
  const find = (id: string, n: number) => {
    const at = items.findIndex((it) => it.id === id);
    if (at < 0) throw new BodyOpError("not_found", `block ${id} not found`, n);
    return at;
  };
  const checkHash = (id: string, ifHash: string | undefined, n: number) => {
    if (ifHash !== undefined && hashOf.get(id) !== ifHash)
      throw new BodyOpError("conflict", `block ${id} changed since you read it`, n);
  };
  const one = (text: string, n: number) => {
    const parts = blocksOf(text);
    if (parts.length !== 1)
      throw new BodyOpError(
        "invalid",
        `the markdown must be exactly one block (it is ${parts.length}); use insert for more`,
        n,
      );
    return parts[0] as string;
  };
  ops.forEach((op, n) => {
    switch (op.op) {
      case "replace": {
        const at = find(op.block, n);
        checkHash(op.block, op.ifHash, n);
        // Same place: the spacing after it stays.
        items[at] = { ...(items[at] as Item), markdown: one(op.markdown, n) };
        break;
      }
      case "replaceText": {
        const at = find(op.block, n);
        checkHash(op.block, op.ifHash, n);
        if (!op.find) throw new BodyOpError("invalid", "find must not be empty", n);
        const text = (items[at] as Item).markdown;
        const count = text.split(op.find).length - 1;
        if (count !== 1)
          throw new BodyOpError(
            "invalid",
            `find occurs ${count} times in block ${op.block}; it must occur exactly once`,
            n,
          );
        items[at] = {
          ...(items[at] as Item),
          markdown: one(
            text.replace(op.find, () => op.replace),
            n,
          ),
        };
        break;
      }
      case "insert": {
        const parts = blocksOf(op.markdown);
        if (parts.length === 0) throw new BodyOpError("invalid", "nothing to insert", n);
        const at = op.after === null ? 0 : find(op.after, n) + 1;
        items = [
          ...items.slice(0, at),
          ...parts.map((markdown) => ({ markdown })),
          ...items.slice(at),
        ];
        break;
      }
      case "move": {
        checkHash(op.block, op.ifHash, n);
        if (op.after === op.block)
          throw new BodyOpError("invalid", "a block cannot follow itself", n);
        const from = find(op.block, n);
        const [item] = items.splice(from, 1);
        const at = op.after === null ? 0 : find(op.after, n) + 1;
        const { origin: _origin, ...moved } = item as Item;
        items.splice(at, 0, moved);
        break;
      }
      case "delete": {
        const at = find(op.block, n);
        checkHash(op.block, op.ifHash, n);
        items.splice(at, 1);
        break;
      }
      default:
        throw new BodyOpError("invalid", `unknown op ${(op as { op: string }).op}`, n);
    }
  });
  // Neighbours that were already neighbours keep the spacing between them; anything else gets one
  // blank line. A body that still ends with its original last block keeps its original ending.
  const last = split.units.length - 1;
  const out = items
    .map((it, k) => {
      const next = items[k + 1];
      if (!next) return it.markdown + (it.origin === last ? (spacing[last] as string) : "\n");
      const kept = it.origin !== undefined && next.origin === it.origin + 1;
      return it.markdown + (kept ? (spacing[it.origin as number] as string) : "\n\n");
    })
    .join("");
  const result = items.length ? out : "";
  const check = blocksOf(result);
  if (check.length !== items.length || check.some((b, k) => b !== (items[k] as Item).markdown))
    throw new BodyOpError(
      "invalid",
      "the result reads differently than the operations say (a new block merges with its neighbour, e.g. a list item after a list); write the neighbours together with replace",
    );
  return result;
}
