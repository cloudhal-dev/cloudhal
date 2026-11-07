/**
 * The checks a site bundle passes before anything of it is written (`planImport`): the format, the
 * site node, rows of this site only, every row a valid contract document whose columns agree with
 * its body (precompiled validators only, AGENTS.md rule 6), rows the node batch's keys accept,
 * gates, the time zone, the media and takedowns the bundle lists, and every node body a snapshot
 * references. Worker-safe; not exported from the package (`planImport` is the public surface).
 */
import { type Asset, assertValid, type NodeRef } from "@cloudhal/core-contracts";
import {
  checkAvailability,
  checkTimeZone,
  EXPIRY_GATES_VERSION,
  type GateSupport,
  isTimeZone,
} from "./availability.ts";
import { InvariantError } from "./errors.ts";
import { nodeHash } from "./hash.ts";
import { validateMenuTree } from "./menu.ts";
import { isNodeKind, NODE_SPEC, type NodeKind, type NodeTypes } from "./nodes.ts";
import {
  type BundleMedia,
  type NodeRow,
  SITE_BUNDLE_FORMAT,
  type SiteBundle,
  type SnapshotRow,
  type StoragePair,
} from "./sync-bundle.ts";

const SHA256 = /^[0-9a-f]{64}$/;

/** A node kind's spec with its node type widened, for rows whose kind is only known at run time. */
type AnySpec = {
  schema: (typeof NODE_SPEC)[NodeKind]["schema"];
  key(n: NodeTypes[NodeKind]): string;
  siteId(n: NodeTypes[NodeKind]): string;
};
const specOf = (kind: NodeKind) => NODE_SPEC[kind] as AnySpec;

/** Gates in a bundle follow the write rules (§4.1) and the writer guard (S15). */
async function assertGates(
  siteId: string,
  bundle: SiteBundle,
  gates: GateSupport | undefined,
): Promise<void> {
  let gated = false;
  for (const row of bundle.nodes) {
    if (row.kind !== "page" && row.kind !== "contentEntry") continue;
    const availability = (JSON.parse(row.body) as { availability?: { from?: string } })
      .availability;
    if (!availability) continue;
    checkAvailability(availability);
    gated = true;
  }
  if (gated && gates && !(await gates.enforced(siteId)))
    throw new InvariantError(
      "gates_unsupported",
      "the bundle has time gates (availability) and this site's renderer has not confirmed it enforces them",
      { siteId },
    );
  // RFC-0042 §3.6: a collection's `expiry` needs a renderer with derived gates.
  const site = bundle.nodes.find((r) => r.kind === "site");
  const collections = site
    ? (JSON.parse(site.body) as { collections?: Record<string, { expiry?: unknown }> }).collections
    : undefined;
  const expiring = Object.values(collections ?? {}).some((c) => c?.expiry !== undefined);
  if (expiring && gates && !(await gates.enforced(siteId, EXPIRY_GATES_VERSION)))
    throw new InvariantError(
      "gates_unsupported",
      "the bundle has a collection expiry and this site's renderer has not confirmed it enforces derived gates",
      { siteId },
    );
}

/**
 * `Site.timeZone` must be a zone this runtime knows (RFC-0008 §4.1), as on every other write; the
 * zone the target already stores for the site is accepted unchanged.
 */
export async function assertTimeZone(
  to: StoragePair,
  siteId: string,
  bundle: SiteBundle,
): Promise<void> {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
  const zone = row ? (JSON.parse(row.body) as { timeZone?: string }).timeZone : undefined;
  if (zone === undefined || isTimeZone(zone)) return;
  const stored = await to.sql.get<{ body: string }>(
    "SELECT body FROM nodes WHERE id = ? AND kind = 'site'",
    [siteId],
  );
  checkTimeZone(
    zone,
    stored ? (JSON.parse(stored.body) as { timeZone?: string }).timeZone : undefined,
  );
}

/**
 * The project row is inserted as given when the target lacks it, so it must be the site node's
 * project (`projectId`), a valid Project whose `id` and `rev` agree with its columns. Its id is
 * echoed only once it equals the validated site node's.
 */
function assertProjectRow(siteId: string, bundle: SiteBundle): void {
  const p = bundle.project;
  if (!p) return;
  const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
  const projectId = siteRow
    ? (JSON.parse(siteRow.body) as { projectId?: unknown }).projectId
    : undefined;
  if (p.id !== projectId) throw new Error("the bundle's project is not its site's project");
  let body: { id?: unknown; rev?: unknown };
  try {
    body = JSON.parse(p.body) as { id?: unknown; rev?: unknown };
  } catch {
    throw new Error(`project ${p.id}: body is not JSON`);
  }
  try {
    assertValid("project", body);
  } catch {
    throw new Error(`project ${p.id}: not a valid project`);
  }
  if (body.id !== p.id || body.rev !== p.rev)
    throw new Error(`project ${p.id}: columns do not match its body`);
}

/**
 * A bundle is untrusted input (whoever holds the deployment token): every row must be a valid
 * contract document of the kind its `kind` column declares (RFC-0002 §4.1: the node schemas are
 * mutually exclusive, so a body cannot pass as another kind), whose columns agree with its body,
 * for this site only; the project row too (`assertProjectRow`).
 */
async function assertValidRows(siteId: string, bundle: SiteBundle): Promise<void> {
  for (const row of bundle.nodes) {
    if (!isNodeKind(row.kind)) throw new Error(`node ${row.id}: unknown kind ${row.kind}`);
    const kind: NodeKind = row.kind;
    const spec = specOf(kind);
    const schema = spec.schema;
    let body: NodeTypes[NodeKind];
    try {
      body = JSON.parse(row.body) as NodeTypes[NodeKind];
    } catch {
      throw new Error(`node ${row.id}: body is not JSON`);
    }
    try {
      assertValid(schema, body);
    } catch (e) {
      throw new Error(
        `node ${row.id}: not a valid ${schema} (${e instanceof Error ? e.message.slice(0, 200) : e})`,
      );
    }
    if (
      body.id !== row.id ||
      body.rev !== row.rev ||
      spec.siteId(body) !== row.site_id ||
      row.site_id !== siteId ||
      spec.key(body) !== row.key
    )
      throw new Error(`node ${row.id}: columns do not match its body`);
    if ((await nodeHash(body)) !== row.hash)
      throw new Error(`node ${row.id}: hash does not match its body`);
    if (kind === "menu") {
      // RFC-0003 §4.2: the tree rules the schema cannot express; targets are not checked (hidden
      // items are a legal state), and labels of a locale the site dropped are kept.
      const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
      const menu = body as NodeTypes["menu"];
      try {
        if (siteRow) validateMenuTree(menu, JSON.parse(siteRow.body), menu);
      } catch (e) {
        throw new Error(`node ${row.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  for (const row of bundle.snapshots) {
    let body: { id?: string; siteId?: string };
    try {
      body = JSON.parse(row.body) as { id?: string; siteId?: string };
    } catch {
      throw new Error(`snapshot ${row.id}: body is not JSON`);
    }
    try {
      assertValid("snapshot", body);
    } catch {
      throw new Error(`snapshot ${row.id}: not a valid snapshot`);
    }
    if (body.id !== row.id || body.siteId !== siteId || row.site_id !== siteId)
      throw new Error(`snapshot ${row.id}: columns do not match its body`);
  }
  assertProjectRow(siteId, bundle);
}

/** A page's or entry's translation group and locale, as `nodes_translation_locale` indexes them. */
function translationSlot(row: NodeRow): string | undefined {
  if (row.kind !== "page" && row.kind !== "contentEntry") return undefined;
  const body = JSON.parse(row.body) as { translation?: { group?: unknown }; locale?: unknown };
  const group = body.translation?.group;
  return typeof group === "string" && typeof body.locale === "string"
    ? `t\u0000${row.kind}\u0000${group}\u0000${body.locale}`
    : undefined;
}

/**
 * What the node batch's unique keys would refuse after the node bodies and snapshots landed,
 * checked on the validated rows first: each node and snapshot id once, one node per kind and key
 * (`nodes_site_kind_key`), one page or entry per translation group and locale
 * (`nodes_translation_locale`). Echoes only validated ids and kinds.
 */
function assertDistinctRows(bundle: SiteBundle): void {
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const row of bundle.nodes) {
    if (ids.has(row.id)) throw new Error(`node ${row.id} appears twice`);
    ids.add(row.id);
    const key = `k\u0000${row.kind}\u0000${row.key}`;
    if (slots.has(key)) throw new Error(`node ${row.id}: another ${row.kind} has its key`);
    slots.add(key);
    const translation = translationSlot(row);
    if (translation === undefined) continue;
    if (slots.has(translation))
      throw new Error(
        `node ${row.id}: another ${row.kind} of its translation group has its locale`,
      );
    slots.add(translation);
  }
  const snapshots = new Set<string>();
  for (const row of bundle.snapshots) {
    if (snapshots.has(row.id)) throw new Error(`snapshot ${row.id} appears twice`);
    snapshots.add(row.id);
  }
}

/**
 * Node and snapshot ids are keys of the whole installation (one store may hold several sites), so
 * none of the bundle's may be another site's in the target. Ids go 500 to a query, as one JSON
 * parameter.
 */
export async function assertIdsFree(to: StoragePair, bundle: SiteBundle): Promise<void> {
  const tables = [
    ["nodes", "node", bundle.nodes],
    ["snapshots", "snapshot", bundle.snapshots],
  ] as const;
  for (const [table, what, rows] of tables)
    for (let i = 0; i < rows.length; i += 500) {
      const taken = await to.sql.get<{ id: string }>(
        `SELECT id FROM ${table} WHERE site_id <> ? AND id IN (SELECT value FROM json_each(?)) LIMIT 1`,
        [bundle.siteId, JSON.stringify(rows.slice(i, i + 500).map((r) => r.id))],
      );
      if (taken)
        throw new Error(`${what} ${taken.id} belongs to another site of this installation`);
    }
}

/**
 * The checks that need no target, in `importSite`'s order: the format, the site node, rows of this
 * site only, valid rows (`assertValidRows`), distinct rows (`assertDistinctRows`) and gates.
 * Returns the validated site row.
 */
export async function checkBundle(
  bundle: SiteBundle,
  gates: GateSupport | undefined,
): Promise<NodeRow> {
  if (bundle.format !== SITE_BUNDLE_FORMAT)
    throw new Error(`unsupported bundle format ${bundle.format}`);
  const { siteId } = bundle;
  const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
  if (!siteRow) throw new Error(`bundle has no site node for ${siteId}`);
  if (
    bundle.nodes.some((n) => n.site_id !== siteId) ||
    bundle.snapshots.some((s) => s.site_id !== siteId)
  )
    throw new Error("bundle contains rows of another site");
  await assertValidRows(siteId, bundle);
  assertDistinctRows(bundle);
  await assertGates(siteId, bundle, gates);
  return siteRow;
}

/**
 * RFC-0004 §4.7, the part that needs no target: the bundle's media entries (each content once, in
 * bundle order) and takedowns are well formed (every field the ledger writes, so writing it cannot
 * fail on them), and every current blob asset's content is listed or taken down; otherwise
 * `missing_media`. The target must then hold every listed content that is not taken down
 * (`planImport`).
 */
export function listedMedia(bundle: SiteBundle): {
  listed: BundleMedia[];
  purged: ReadonlySet<string>;
} {
  const listed = new Map<string, BundleMedia>();
  for (const m of bundle.media ?? []) {
    if (
      typeof m?.sha256 !== "string" ||
      !SHA256.test(m.sha256) ||
      !Number.isInteger(m.bytes) ||
      m.bytes < 0 ||
      typeof m.mediaType !== "string" ||
      m.mediaType.length > 255
    )
      throw new Error("bundle media entry is malformed");
    if (!listed.has(m.sha256)) listed.set(m.sha256, m);
  }
  const purged = new Set<string>();
  for (const p of bundle.purged ?? []) {
    if (
      typeof p?.sha256 !== "string" ||
      !SHA256.test(p.sha256) ||
      typeof p.reason !== "string" ||
      typeof p.legal !== "boolean" ||
      typeof p.by !== "string" ||
      typeof p.at !== "string"
    )
      throw new Error("bundle takedown entry is malformed");
    purged.add(p.sha256);
  }
  for (const n of bundle.nodes)
    if (n.kind === "asset") {
      const a = JSON.parse(n.body) as Asset;
      if (a.storage.kind === "blob" && !listed.has(a.sha256) && !purged.has(a.sha256))
        throw new InvariantError(
          "missing_media",
          `asset ${a.id} needs content the bundle does not list`,
          {
            sha256: a.sha256,
          },
        );
    }
  return { listed: [...listed.values()], purged };
}

/** A snapshot row's node refs; its body was validated as a snapshot (`checkBundle`). */
export function snapshotRefs(row: SnapshotRow): NodeRef[] {
  return (JSON.parse(row.body) as { nodes: NodeRef[] }).nodes;
}

/**
 * Invariant 2 for the node bodies (RFC-0039): a body the target lacks is written as given and read
 * back as published content (the renderer reads a snapshot's nodes from these bodies), so it must
 * be a valid contract document of the kind of every snapshot ref that points to it, with the ref's
 * id and rev, of this site. A body no snapshot references is refused. Names only the validated
 * hash and the ref's kind.
 */
export function assertNodeBody(
  siteId: string,
  hash: string,
  body: unknown,
  refs: readonly NodeRef[] | undefined,
): void {
  if (!refs || refs.length === 0) throw new Error(`blob ${hash} is not referenced by any snapshot`);
  for (const ref of refs) {
    if (!isNodeKind(ref.kind)) throw new Error(`blob ${hash}: unknown kind`);
    const spec = specOf(ref.kind);
    try {
      assertValid(spec.schema, body);
    } catch {
      throw new Error(`blob ${hash} is not a valid ${ref.kind}`);
    }
    const node = body as NodeTypes[NodeKind];
    if (node.id !== ref.id || node.rev !== ref.rev || spec.siteId(node) !== siteId)
      throw new Error(`blob ${hash} is not the ${ref.kind} its snapshot ref names`);
  }
}
