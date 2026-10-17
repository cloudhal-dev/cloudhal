import {
  commentsExportCli,
  commentsImportCli,
  commentsStatusCli,
  describeCommentsStatus,
} from "../commands/comments.ts";
import { describeMediaImport, mediaGc, mediaImportUrls, mediaVerify } from "../commands/media.ts";
import { describePlaceholders, mediaPlaceholders } from "../commands/media-placeholders.ts";
import { describeMigration, migrateTags } from "../commands/migrate.ts";
import { describeReindex, searchReindex } from "../commands/search.ts";
import { type CliCommand, remoteFlags, subcommands } from "./types.ts";

/** `cloudhal migrate`, `media`, `search`, `comments`: the site's content and its stores. */

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

export const CONTENT_COMMANDS = {
  migrate: migrateCommand,
  media: mediaCommand,
  search: searchCommand,
  comments: commentsCommand,
} satisfies Record<string, CliCommand>;
