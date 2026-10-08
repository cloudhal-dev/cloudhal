import path from "node:path";
import type { TagsMigrationResult, TagsRevertResult } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";

export interface MigrateTagsOptions {
  readonly projectDir: string;
  /** Report what would change; write nothing. */
  readonly dryRun?: boolean;
  /** Undo the run with this migration id (the id of its `before tags-to-terms` snapshot). */
  readonly revert?: string;
}

const CLI_ACTOR = { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" } as const;

/**
 * `cloudhal migrate tags-to-terms`: moves `ContentEntry.tags` into tag terms on the local site
 * (RFC-0002). Resumable and idempotent; `--revert <id>` restores the tags of entries nobody edited
 * since. Nothing goes live until a person publishes.
 */
export async function migrateTags(
  options: MigrateTagsOptions,
): Promise<TagsMigrationResult | TagsRevertResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    if (options.revert !== undefined)
      return await local.store.revertTagsToTerms(cfg.siteId, options.revert, { actor: CLI_ACTOR });
    return await local.store.migrateTagsToTerms(cfg.siteId, CLI_ACTOR, {
      ...(options.dryRun ? { dryRun: true } : {}),
    });
  } finally {
    await local.close();
  }
}

/** Human-readable summary lines for the terminal. */
export function describeMigration(result: TagsMigrationResult | TagsRevertResult): string[] {
  if ("restored" in result)
    return [
      `reverted ${result.migrationId}: ${result.restored} entries got their tags back`,
      ...(result.edited.length
        ? [`left untouched (edited since the migration): ${result.edited.join(", ")}`]
        : []),
      `deleted ${result.termsDeleted} unused terms${result.taxonomiesDeleted.length ? ` and the empty taxonomies ${result.taxonomiesDeleted.join(", ")}` : ""}`,
      `snapshot ${result.snapshotId}`,
    ];
  if (result.upToDate) return ["nothing to migrate: no entry has tags and the taxonomies exist"];
  const lines = [
    `${result.dryRun ? "would migrate" : "migrated"} ${result.entries} entries: ${result.tags.length} distinct tags, ${result.termsCreated} new terms, ${result.termsReused} reused${result.resumed ? " (resumed)" : ""}`,
  ];
  if (result.taxonomiesCreated.length)
    lines.push(
      `${result.dryRun ? "would create" : "created"} taxonomies: ${result.taxonomiesCreated.join(", ")} (category not required on existing sites)`,
    );
  for (const s of result.skipped) lines.push(`skipped ${s.entryId}: ${s.reason}`);
  if (!result.dryRun)
    lines.push(
      `migration id ${result.migrationId} (undo: cloudhal migrate tags-to-terms --revert ${result.migrationId})`,
      "nothing is live yet: review the snapshot diff and publish",
    );
  return lines;
}
