import {
  commentsExportCli,
  commentsImportCli,
  commentsStatusCli,
  describeCommentsStatus,
} from "../commands/comments.ts";
import { describeExport, exportArchive } from "../commands/export.ts";
import { fieldsCommand } from "../commands/fields.ts";
import { ImportInterruptedError, importArchive } from "../commands/import.ts";
import { describeImport } from "../commands/import-describe.ts";
import { describeMediaImport, mediaGc, mediaImportUrls, mediaVerify } from "../commands/media.ts";
import { describePlaceholders, mediaPlaceholders } from "../commands/media-placeholders.ts";
import { describeMigration, migrateTags } from "../commands/migrate.ts";
import { describeReindex, searchReindex } from "../commands/search.ts";
import { abortOnSignal, type CliCommand, remoteFlags, subcommands } from "./types.ts";

/**
 * `cloudhal migrate`, `fields`, `media`, `search`, `comments`, `export`, `import`: the site's
 * content and its stores.
 */

const migrateCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [what] = rest;
  if (what !== "tags-to-terms")
    throw new Error("usage: cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]");
  if (values.revert !== undefined && values["dry-run"])
    throw new Error("--dry-run and --revert cannot be combined");
  const result = await migrateTags({
    projectDir,
    ...(values["dry-run"] ? { dryRun: true } : {}),
    ...(values.revert !== undefined ? { revert: values.revert } : {}),
  });
  for (const line of describeMigration(result)) console.log(line);
  return 0;
};

const mediaImportUrlsCommand: CliCommand = async (_rest, values, { projectDir }) => {
  if (values.revert !== undefined && values["dry-run"])
    throw new Error("--dry-run and --revert cannot be combined");
  const result = await mediaImportUrls({
    projectDir,
    ...(values["dry-run"] ? { dryRun: true } : {}),
    ...(values["include-markdown"] ? { includeMarkdown: true } : {}),
    ...(values.revert !== undefined ? { revert: values.revert } : {}),
    ...(values["allow-host"]?.length ? { allowHosts: values["allow-host"] } : {}),
  });
  for (const line of describeMediaImport(result)) console.log(line);
  return 0;
};

const mediaVerifyCommand: CliCommand = async (rest, _values, { projectDir }) => {
  const [assetId] = rest;
  const r = await mediaVerify({ projectDir, ...(assetId ? { assetId } : {}) });
  console.log(`checked ${r.checked}: ${r.ok.length} ok, ${r.problems.length} problem(s)`);
  for (const p of r.problems) console.log(`  ${p.assetId}: ${p.problem}`);
  return r.problems.length ? 1 : 0;
};

const mediaGcCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const r = await mediaGc({ projectDir, ...(values["dry-run"] ? { dryRun: true } : {}) });
  console.log(
    `${r.dryRun ? "would delete" : "deleted"} ${r.collected.length} unreferenced file(s)`,
  );
  return 0;
};

const mediaPlaceholdersCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const r = await mediaPlaceholders({
    projectDir,
    ...remoteFlags(values),
    ...(values.all ? { all: true } : {}),
    ...(values["dry-run"] ? { dryRun: true } : {}),
  });
  console.log(describePlaceholders(r));
  return r.failed.length ? 1 : 0;
};

const mediaCommand = subcommands(
  {
    "import-urls": mediaImportUrlsCommand,
    verify: mediaVerifyCommand,
    gc: mediaGcCommand,
    placeholders: mediaPlaceholdersCommand,
  },
  "usage: cloudhal media import-urls|verify|gc|placeholders",
);

const searchCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [what] = rest;
  if (what !== "reindex") throw new Error("usage: cloudhal search reindex [--remote]");
  const report = await searchReindex({ projectDir, ...remoteFlags(values) });
  console.log(describeReindex(report));
  return 0;
};

const commentsStatusCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const s = await commentsStatusCli({ projectDir, ...remoteFlags(values) });
  for (const line of describeCommentsStatus(s)) console.log(line);
  return 0;
};

const commentsExportCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const personal = values["with-personal-data"] === true;
  if (personal && !values.out)
    throw new Error(
      "--with-personal-data needs --out <file> (the file holds email addresses; it is written owner-only)",
    );
  const r = await commentsExportCli({
    projectDir,
    ...remoteFlags(values),
    ...(personal ? { personal: true } : {}),
    ...(values.out ? { out: values.out } : {}),
    log: (l) => process.stderr.write(`${l}\n`),
  });
  if (values.out)
    console.log(
      `wrote ${values.out}: ${r.comments} comment(s)${personal ? `, ${r.commenters} commenter(s) with their email` : ""}`,
    );
  else process.stdout.write(r.text);
  return 0;
};

const commentsImportCommand: CliCommand = async (_rest, values, { projectDir }) => {
  if (!values.in) throw new Error("usage: cloudhal comments import --in <file> [--remote]");
  const r = await commentsImportCli({
    projectDir,
    ...remoteFlags(values),
    file: values.in,
    log: (l) => console.log(l),
  });
  console.log(
    `${r.imported} imported, ${r.skipped} already there${r.commenters ? `, ${r.commenters} commenter email(s) stored` : ""}${r.invalid.length ? `, ${r.invalid.length} refused` : ""}`,
  );
  for (const p of r.invalid) console.log(`  line ${p.line}${p.id ? ` (${p.id})` : ""}: ${p.error}`);
  return r.invalid.length ? 1 : 0;
};

const commentsCommand = subcommands(
  {
    status: commentsStatusCommand,
    export: commentsExportCommand,
    import: commentsImportCommand,
  },
  "usage: cloudhal comments status|export|import",
);

/** Ctrl-C or SIGTERM stops the export: no file is written, an existing one stays (exit 130/143). */
const exportCommand: CliCommand = async (rest, values, { projectDir }) => {
  if (rest.length > 0)
    throw new Error(
      "usage: cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]",
    );
  const interrupt = abortOnSignal();
  try {
    const result = await exportArchive({
      projectDir,
      ...(values.out !== undefined ? { out: values.out } : {}),
      ...(values.site !== undefined ? { siteId: values.site } : {}),
      ...(values["no-media"] ? { noMedia: true } : {}),
      ...(values["latest-only"] ? { latestOnly: true } : {}),
      signal: interrupt.signal,
    });
    for (const line of describeExport(result, projectDir)) console.log(line);
    return 0;
  } catch (e) {
    if (!interrupt.signal.aborted) throw e;
    console.error("cloudhal: export interrupted; no file written, an existing one left as it was");
    return interrupt.exitCode();
  } finally {
    interrupt.dispose();
  }
};

/**
 * `cloudhal import <file> [--dry-run]` (bootstrap only; `--replace` is RFC-0039 step 4). Ctrl-C or
 * SIGTERM before the graph is written stops it (exit 130/143); a dry run that would be refused
 * exits 1.
 */
const importCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [file] = rest;
  if (file === undefined || rest.length !== 1)
    throw new Error("usage: cloudhal import <file> [--dry-run]");
  if (values.replace)
    throw new Error(
      "cloudhal import --replace is not available yet; this version imports in bootstrap mode only",
    );
  const interrupt = abortOnSignal();
  try {
    const result = await importArchive({
      projectDir,
      file,
      dryRun: values["dry-run"] === true,
      signal: interrupt.signal,
      log: (l) => process.stderr.write(`${l}\n`),
    });
    for (const line of describeImport(result)) console.log(line);
    return result.refusals.length > 0 ? 1 : 0;
  } catch (e) {
    if (!(e instanceof ImportInterruptedError)) throw e;
    console.error(`cloudhal: ${e.message}`);
    return interrupt.exitCode();
  } finally {
    interrupt.dispose();
  }
};

export const CONTENT_COMMANDS = {
  migrate: migrateCommand,
  fields: fieldsCommand,
  media: mediaCommand,
  search: searchCommand,
  comments: commentsCommand,
  export: exportCommand,
  import: importCommand,
} satisfies Record<string, CliCommand>;
