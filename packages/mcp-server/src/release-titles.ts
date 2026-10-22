/**
 * The title and path a release item shows for a node version (§12 `get_release`): whatever name
 * the node kind has, and its page path, entry permalink (RFC-0038) or redirect source.
 */
import { entryPath, type PermalinkSite } from "@cloudhal/core-ts";

export function titleOf(
  site: PermalinkSite | undefined,
  node: unknown,
): { title: string | null; path: string | null } {
  const n = node as {
    title?: string;
    path?: string;
    name?: unknown;
    key?: string;
    from?: string;
    to?: string;
    filename?: string;
    slug?: string;
    collection?: string;
  };
  if (!n) return { title: null, path: null };
  const name =
    typeof n.name === "string"
      ? n.name
      : n.name && typeof n.name === "object"
        ? (Object.values(n.name as Record<string, string>)[0] ?? null)
        : null;
  const title =
    n.title ?? name ?? n.key ?? (n.from ? `${n.from} → ${n.to}` : null) ?? n.filename ?? null;
  const entry = n.collection && n.slug ? { collection: n.collection, slug: n.slug } : undefined;
  const path = n.path ?? (entry ? entryPath(site, entry) : null) ?? n.from ?? null;
  return { title: title ? String(title).slice(0, 200) : null, path };
}
