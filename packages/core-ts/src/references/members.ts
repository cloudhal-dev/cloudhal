/**
 * RFC-0045 §2 "Membership" and §3 "The locale rule": which node of this site a reference to a
 * translation group shows. One function, `pickMember`, for the renderer, Studio's preview and
 * `referenceIssues`. Pure; callers pass the members their view shows (gates applied).
 */
import type { ContentEntry, Localization } from "@cloudhal/core-contracts";

/** What membership and the locale rule read of a node. */
export type MemberLike = Pick<ContentEntry, "id" | "collection" | "locale"> & {
  translation?: Pick<NonNullable<ContentEntry["translation"]>, "group"> | undefined;
};

/** A node's translation group: `COALESCE(translation.group, id)`, the one rule every probe uses. */
export const memberGroup = (node: Pick<MemberLike, "id" | "translation">): string =>
  node.translation?.group ?? node.id;

/** True when `node` is a member of group `groupId`. */
export const isMemberOf = (
  node: Pick<MemberLike, "id" | "translation">,
  groupId: string,
): boolean => memberGroup(node) === groupId;

export interface PickMemberOptions {
  /** The page's locale. */
  locale: string;
  /** The site's default locale. */
  defaultLocale: string;
  /** `Site.localization.fallback`; absent reads as `none`. */
  fallback?: Localization["fallback"] | undefined;
  /** The field's `collections`: only members in one of them count. */
  collections: readonly string[];
}

export interface PickedMember<T> {
  member: T;
  /** The member is the default locale's, shown under `default-with-notice`; themes set `lang`. */
  fromFallbackLocale: boolean;
}

/**
 * The member of `groupId` a reference shows: among `members` of the group in an allowed
 * collection, the one in the page's locale; else, under `default-with-notice`, the default
 * locale's (flagged); else none. The first such member wins (a group has one node per locale).
 */
export function pickMember<T extends MemberLike>(
  groupId: string,
  members: Iterable<T>,
  options: PickMemberOptions,
): PickedMember<T> | undefined {
  const allowed = new Set(options.collections);
  let fallback: T | undefined;
  for (const m of members) {
    if (!isMemberOf(m, groupId) || !allowed.has(m.collection)) continue;
    if (m.locale === options.locale) return { member: m, fromFallbackLocale: false };
    if (fallback === undefined && m.locale === options.defaultLocale) fallback = m;
  }
  return fallback !== undefined && options.fallback === "default-with-notice"
    ? { member: fallback, fromFallbackLocale: true }
    : undefined;
}

/** Members by group, for repeated `pickMember` calls over one view. */
export function membersByGroup<T extends MemberLike>(members: Iterable<T>): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const m of members) {
    const g = memberGroup(m);
    const list = out.get(g);
    if (list) list.push(m);
    else out.set(g, [m]);
  }
  return out;
}
