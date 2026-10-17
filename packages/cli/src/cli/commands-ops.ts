import { buildEval, describeJudgeRow, describeRun, judgeCheckCommand } from "../commands/ai.ts";
import {
  analyticsExport,
  analyticsRollup,
  analyticsSeed,
  analyticsStatus,
  describeStatus,
} from "../commands/analytics.ts";
import {
  describeRelease,
  describeSchedulesStatus,
  describeTick,
  schedulesList,
  schedulesRunDue,
  schedulesStatus,
} from "../commands/schedules.ts";
import { type CliCommand, type CliValues, remoteFlags, subcommands } from "./types.ts";

/** `cloudhal analytics`, `schedules`, `ai`: running the deployed (or local) site. */

const number = (v: string | undefined) => (v === undefined ? undefined : Number(v));

const analyticsStatusCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const s = await analyticsStatus({ projectDir, ...remoteFlags(values) });
  for (const line of describeStatus(s)) console.log(line);
  return 0;
};

const analyticsRollupCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const days = number(values.days);
  const r = await analyticsRollup({
    projectDir,
    ...remoteFlags(values),
    ...(days !== undefined ? { days } : {}),
    ...(values.redo ? { redo: true } : {}),
    log: (l) => console.log(l),
  });
  console.log(
    `${r.done} day(s) rolled up, ${r.pending} pending${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.pruned ? `; ${r.pruned} old raw event(s) pruned` : ""}`,
  );
  for (const f of r.failed) console.log(`  ${f.day}: ${f.error}`);
  return r.failed.length ? 1 : 0;
};

const analyticsSeedCommand: CliCommand = async (_rest, values, { projectDir }) => {
  if (values.remote) throw new Error("seed writes demo data to the local SQLite only");
  const days = number(values.days);
  const views = number(values.views);
  await analyticsSeed({
    projectDir,
    ...(days !== undefined ? { days } : {}),
    ...(views !== undefined ? { views } : {}),
    log: (l) => console.log(l),
  });
  return 0;
};

const analyticsExportCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const csv = await analyticsExport({
    projectDir,
    ...remoteFlags(values),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
    ...(values.out ? { out: values.out } : {}),
  });
  if (values.out) console.log(`wrote ${values.out}`);
  else process.stdout.write(csv);
  return 0;
};

const schedulesStatusCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const s = await schedulesStatus({ projectDir, ...remoteFlags(values) });
  for (const line of describeSchedulesStatus(s)) console.log(line);
  return 0;
};

const schedulesListCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200))
    throw new Error("--limit must be 1–200");
  const list = await schedulesList({
    projectDir,
    ...remoteFlags(values),
    ...(limit ? { limit } : {}),
  });
  if (list.length === 0) console.log("no releases");
  for (const r of list) console.log(describeRelease(r));
  return 0;
};

const schedulesRunDueCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const r = await schedulesRunDue({ projectDir, ...remoteFlags(values) });
  console.log(describeTick(r));
  return r.failed > 0 ? 1 : 0;
};

// RFC-0021 21c: is the design judge worth using? It scores the reference pages.
const judgeCheck: CliCommand = async (_rest, values, { projectDir }) => {
  const result = await judgeCheckCommand({
    projectDir,
    ...remoteFlags(values),
    ...(values.judge ? { judge: values.judge } : {}),
    onRow: (r) => console.log(describeJudgeRow(r)),
  });
  console.log(`\n${result.table}`);
  console.log(
    result.ordered
      ? "\nThe judge ranks the references in order."
      : "\nThe judge does not rank the references in order: do not compare models with it.",
  );
  return result.ordered ? 0 : 1;
};

const split = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

/** RFC-0021 21c: the design pass (--look and --judge imply it). */
function designPass(values: CliValues): { design?: { look?: true; judge?: string | false } } {
  if (!(values.design || values.look || values.judge)) return {};
  return {
    design: {
      ...(values.look ? { look: true } : {}),
      ...(values.judge ? { judge: values.judge === "none" ? false : values.judge } : {}),
    },
  };
}

const buildEvalCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const models = split(values.models);
  const briefs = split(values.briefs);
  const report = await buildEval({
    projectDir,
    ...remoteFlags(values),
    ...(models ? { models } : {}),
    ...(briefs ? { briefs } : {}),
    ...designPass(values),
    onRun: (r) => console.log(describeRun(r)),
  });
  console.log(`\n${report.table}`);
  if (values.out) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nwrote ${values.out}`);
  }
  return 0;
};

export const OPS_COMMANDS = {
  analytics: subcommands(
    {
      status: analyticsStatusCommand,
      rollup: analyticsRollupCommand,
      seed: analyticsSeedCommand,
      export: analyticsExportCommand,
    },
    "usage: cloudhal analytics status|rollup|seed|export",
  ),
  schedules: subcommands(
    {
      status: schedulesStatusCommand,
      list: schedulesListCommand,
      "run-due": schedulesRunDueCommand,
    },
    "usage: cloudhal schedules status|list|run-due [--remote]",
  ),
  ai: subcommands(
    { "judge-check": judgeCheck, "build-eval": buildEvalCommand },
    "usage: cloudhal ai build-eval [--remote] [--models a,b] [--briefs x,y] | cloudhal ai judge-check [--remote] [--judge <model>]",
  ),
} satisfies Record<string, CliCommand>;
