/**
 * The node-kind registry (RFC-0002 §4.1). Every row in `nodes` has an explicit `kind`; the kind, not
 * the body's shape, decides its contract schema, id prefix, uniqueness key and site. Worker-safe.
 */
import type {
  Asset,
  ContentEntry,
  Menu,
  NodeRef,
  Page,
  Redirect,
  RootSchemaName,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { ID_PREFIX } from "./ids.ts";

export const NODE_KINDS = [
  "site",
  "page",
  "contentEntry",
  "taxonomy",
  "term",
  "redirect",
  "menu",
  "asset",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Node kind → contract type. */
export interface NodeTypes {
  site: Site;
  page: Page;
  contentEntry: ContentEntry;
  taxonomy: Taxonomy;
  term: Term;
  redirect: Redirect;
  menu: Menu;
  asset: Asset;
}
export type SiteNode = NodeTypes[NodeKind];

// The registry and the snapshot contract must name the same kinds.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _kindsMatchContract: Same<NodeKind, NodeRef["kind"]> = true;
void _kindsMatchContract;

export interface NodeSpec<K extends NodeKind> {
  /** Contract schema the body must satisfy. */
  readonly schema: RootSchemaName;
  /** Id prefix of new nodes of this kind. */
  readonly prefix: string;
  /** Uniqueness key within (site, kind); backs the `nodes_site_kind_key` index. */
  key(node: NodeTypes[K]): string;
  siteId(node: NodeTypes[K]): string;
}

export const NODE_SPEC: { readonly [K in NodeKind]: NodeSpec<K> } = {
  site: { schema: "site", prefix: ID_PREFIX.site, key: () => "site", siteId: (n) => n.id },
  page: {
    schema: "page",
    prefix: ID_PREFIX.page,
    key: (n) => `${n.locale}:${n.path}`,
    siteId: (n) => n.siteId,
  },
  contentEntry: {
    schema: "content-entry",
    prefix: ID_PREFIX.contentEntry,
    key: (n) => `${n.collection}:${n.locale}:${n.slug}`,
    siteId: (n) => n.siteId,
  },
  taxonomy: {
    schema: "taxonomy",
    prefix: ID_PREFIX.taxonomy,
    key: (n) => n.key,
    siteId: (n) => n.siteId,
  },
  term: {
    schema: "term",
    prefix: ID_PREFIX.term,
    // A retired term gives its slug back to the index (it stays reserved through the slug guards
    // until a person reclaims it), so `reclaim` can reuse the slug of a merged or retired term.
    key: (n) => (n.status === "retired" ? `${n.taxonomyId}:~${n.id}` : `${n.taxonomyId}:${n.slug}`),
    siteId: (n) => n.siteId,
  },
  redirect: {
    schema: "redirect",
    prefix: ID_PREFIX.redirect,
    key: (n) => n.from,
    siteId: (n) => n.siteId,
  },
  // RFC-0003: one node per menu key; the key is immutable.
  menu: { schema: "menu", prefix: ID_PREFIX.menu, key: (n) => n.key, siteId: (n) => n.siteId },
  // RFC-0004: one asset per content per site (invariant 2).
  asset: {
    schema: "asset",
    prefix: ID_PREFIX.asset,
    key: (n) => n.sha256,
    siteId: (n) => n.siteId,
  },
};

export function isNodeKind(kind: string): kind is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(kind);
}

export function uniquenessKey<K extends NodeKind>(kind: K, node: NodeTypes[K]): string {
  return NODE_SPEC[kind].key(node);
}

export function siteIdOf<K extends NodeKind>(kind: K, node: NodeTypes[K]): string {
  return NODE_SPEC[kind].siteId(node);
}

/** Fields the store fills in on create (an explicit `id` is kept). */
export type Creatable<
  T extends { id: string; rev: number; createdAt: string; updatedAt: string; schemaVersion: 1 },
> = Omit<T, "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"> & { id?: string };
