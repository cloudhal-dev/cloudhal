/**
 * RFC-0042 §4 and ADR-0044 "Mapping drift" for RFC-0041's field operations: what an operation
 * does to the fields other settings name.
 *
 * - `rename_field` renames them: the collection's list fields, expiry field and structured-data
 *   field sources in phase A's site write (`renameSettingsReferences` in `phaseASite`), and the
 *   `where`/`orderBy` of `contentList` sections in the same batch (`renamedPages`);
 * - `remove_field` refuses while settings or sections name the field (`list_field_in_use`);
 * - `change_field_type` refuses when the new type would break them: sections' queries that no
 *   longer check (`list_field_in_use`), or the settings' own checks (`invalid_expiry`,
 *   `structured_data_invalid`).
 *
 * A revert runs the same checks for its inverse operation.
 */
import type { Page, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { checkFieldQuery, fieldDefinitions } from "../fields/index.ts";
import { assertUnlocked } from "../holds.ts";
import { checkCollectionSettings, settingsUses } from "../store/collection-settings.ts";
import { pagesUsing, renameInSections, sectionUse } from "../store/section-uses.ts";
import { phaseASite, phaseCSite } from "./plan.ts";
import { type FieldOperation, type OperationContext, operationKey } from "./types.ts";

const END = "snap_fieldendstate";

/** The site as the operation leaves it: definitions and, for a rename, the settings' references. */
function endSite(site: Site, op: FieldOperation): Site {
  return phaseCSite(phaseASite(site, op, END), op.collection, END) ?? site;
}

function inUse(message: string, details: Record<string, unknown>): never {
  throw new InvariantError("list_field_in_use", message, details);
}

/** Settings that name the field: a removal refuses, a type change re-runs the settings checks. */
export function checkSettingsReferences(site: Site, op: FieldOperation): void {
  if (op.op === "remove_field") {
    const paths = settingsUses(site, op.collection, op.key);
    if (paths.length === 0) return;
    inUse(`${op.collection}.${op.key} is named by ${paths.join(", ")}; remove it there first`, {
      issues: paths.map((path) => ({
        path,
        code: "list_field_in_use",
        message: `names ${op.key}`,
      })),
    });
  }
  if (op.op === "change_field_type") checkCollectionSettings(endSite(site, op), op.collection);
}

const pageRef = (p: Page) => ({ id: p.id, path: p.path, locale: p.locale });

/** Problems of the pages' queries on the collection against `site`, at slash paths. */
function queryIssues(site: Site, collection: string, pages: readonly Page[]) {
  const defs = fieldDefinitions(site, collection);
  const listFields = site.collections?.[collection]?.listFields;
  return pages.flatMap((page) =>
    page.sections.flatMap((section, i) =>
      section.kind === "contentList" && section.collection === collection
        ? checkFieldQuery(defs, listFields, section).map((issue) => ({
            ...issue,
            code: "list_field_in_use",
            path: `pages/${page.id}/sections/${i}/${issue.path}`,
          }))
        : [],
    ),
  );
}

/**
 * Sections that filter or sort by the field: a removal refuses, a type change refuses when their
 * queries would not check against the new type, and a rename needs every such page unlocked
 * (RFC-0008 §6.2), since phase A rewrites them.
 */
export async function checkSectionReferences(
  ctx: OperationContext,
  site: Site,
  op: FieldOperation,
): Promise<void> {
  if (op.op === "set_field_localized") return;
  const key = operationKey(op);
  const pages = await pagesUsing(ctx.store.sql, sectionUse(site.id, op.collection, key));
  if (pages.length === 0) return;
  const named = pages.map((p) => p.path).join(", ");
  if (op.op === "rename_field")
    return assertUnlocked(
      ctx.store.sql,
      site.id,
      pages.map((p) => p.id),
    );
  if (op.op === "remove_field")
    inUse(`contentList sections on ${named} filter or sort by ${key}; change them first`, {
      issues: [],
      pages: pages.map(pageRef),
    });
  const issues = queryIssues(endSite(site, op), op.collection, pages);
  if (issues.length > 0)
    inUse(`as a ${op.type} field, ${key} would break contentList sections on ${named}`, {
      issues,
      pages: pages.map(pageRef),
    });
}

/** A page rewritten in the same batch as a site write (CAS from `prev.rev`). */
export interface PageRewrite {
  readonly prev: Page;
  readonly next: Page;
}

/** The pages whose sections name `from`, with it renamed to `to`. */
export async function renamedPages(
  ctx: OperationContext,
  site: Site,
  rename: { collection: string; from: string; to: string },
): Promise<PageRewrite[]> {
  const { collection, from, to } = rename;
  const pages = await pagesUsing(ctx.store.sql, sectionUse(site.id, collection, from));
  const stamp = ctx.stamp();
  return pages.flatMap((prev) => {
    const sections = renameInSections(prev, collection, from, to);
    return sections
      ? [{ prev, next: { ...prev, sections, rev: prev.rev + 1, updatedAt: stamp } }]
      : [];
  });
}
