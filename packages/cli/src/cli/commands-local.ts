import { isAgentMode, type Scope } from "@cloudhal/agent-runtime";
import { build, dev } from "../commands/astro.ts";
import { chromeGet, chromeSet } from "../commands/chrome.ts";
import { init } from "../commands/init.ts";
import { mcp } from "../commands/mcp.ts";
import { describeMotionAudit, motionAudit } from "../commands/motion.ts";
import { describeRender, render } from "../commands/render.ts";
import { snapshot } from "../commands/snapshot.ts";
import { studio } from "../commands/studio.ts";
import { tokensExport } from "../commands/tokens.ts";
import { type CliCommand, untilSignal } from "./types.ts";

/** `cloudhal init`, `dev`, `snapshot`, `build`, `studio`, `mcp`: the project on this machine. */

const initCommand: CliCommand = async (rest, values) => {
  const dir = rest[0];
  if (!dir) throw new Error("usage: cloudhal init <dir>");
  const r = await init({
    dir,
    ...(values.name ? { name: values.name } : {}),
    ...(values.starter ? { starter: values.starter } : {}),
    log: (l) => console.log(`  ${l}`),
  });
  console.log(`\nCreated ${r.projectDir}\n  cd ${dir}\n  pnpm install\n  cloudhal dev\n`);
  return 0;
};

const devCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const server = await dev({
    projectDir,
    ...(values.port ? { port: Number(values.port) } : {}),
    ...(values.host ? { host: true } : {}),
  });
  if (server.url) console.log(`cloudhal dev → ${server.url}`);
  await untilSignal();
  await server.stop();
  return 0;
};

const snapshotCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const snap = await snapshot({
    projectDir,
    ...(values.label ? { label: values.label } : {}),
    ...(values.publish ? { publish: true } : {}),
  });
  console.log(
    `${snap.id}  nodes=${snap.nodes.length}  +${snap.summary.added} ~${snap.summary.changed} -${snap.summary.removed}${values.publish ? "  (published)" : ""}`,
  );
  return 0;
};

const buildCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const r = await build({
    projectDir,
    ...(values.snapshot ? { snapshotId: values.snapshot } : {}),
  });
  console.log(`built ${r.outDir} from ${r.snapshotId}`);
  return 0;
};

const studioCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const s = await studio({
    projectDir,
    ...(values.port ? { port: Number(values.port) } : {}),
    ...(values["no-auth"] ? { noAuth: true } : {}),
  });
  console.log(`cloudhal studio → ${s.url}`);
  await untilSignal();
  await s.stop();
  return 0;
};

const mcpCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const server = await mcp({
    projectDir,
    ...(values.scopes ? { scopes: values.scopes.split(",").map((s) => s.trim()) as Scope[] } : {}),
    ...(values.skills ? { skillsDir: values.skills } : {}),
    ...(values["preview-url"] ? { previewUrl: values["preview-url"] } : {}),
    ...(values.mode
      ? (() => {
          if (!isAgentMode(values.mode)) throw new Error(`unknown --mode "${values.mode}"`);
          return { mode: values.mode };
        })()
      : {}),
  });
  await untilSignal((resolve) => process.stdin.once("close", () => resolve()));
  await server.stop();
  return 0;
};

/** `cloudhal render`, `motion`, `tokens`, `chrome`: the design and look of the local site. */

const renderCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [target] = rest;
  if (!target)
    throw new Error(
      "usage: cloudhal render <path|url> [--width 1440,390] [--scheme dark] [--motion full] [--frames 4]",
    );
  const report = await render({
    projectDir,
    target,
    ...(values.base ? { base: values.base } : {}),
    ...(values.width ? { widths: values.width.split(",").map(Number) } : {}),
    ...(values.scheme ? { scheme: values.scheme } : {}),
    ...(values.motion ? { motion: values.motion } : {}),
    ...(values.frames ? { frames: Number(values.frames) } : {}),
    ...(values.out ? { out: values.out } : {}),
  });
  console.log(describeRender(report));
  return report.checks.every((c) => c.ok) ? 0 : 2;
};

const motionCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [what] = rest;
  if (what !== "audit") throw new Error("usage: cloudhal motion audit [--path <p>]");
  const audit = await motionAudit({
    projectDir,
    ...(values.path ? { path: values.path } : {}),
  });
  console.log(describeMotionAudit(audit));
  return audit.pages.some((p) => p.warnings.length) ? 2 : 0;
};

const chromeCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [what] = rest;
  if (what === "get") {
    const json = await chromeGet({ projectDir, ...(values.file ? { file: values.file } : {}) });
    if (values.file) console.log(`wrote ${values.file}`);
    else process.stdout.write(json);
    return 0;
  }
  if (what === "set") {
    await chromeSet({ projectDir, ...(values.file ? { file: values.file } : {}) });
    console.log("chrome saved; publish to show it on the site");
    return 0;
  }
  throw new Error("usage: cloudhal chrome get [--file <f>] | set --file <f>");
};

const tokensCommand: CliCommand = async (rest, values, { projectDir }) => {
  const [what] = rest;
  if (what !== "export")
    throw new Error("usage: cloudhal tokens export [--format dtcg] [--out <file>]");
  const json = await tokensExport({
    projectDir,
    ...(values.format ? { format: values.format } : {}),
    ...(values.out ? { out: values.out } : {}),
  });
  if (values.out) console.log(`wrote ${values.out}`);
  else process.stdout.write(json);
  return 0;
};

export const LOCAL_COMMANDS = {
  init: initCommand,
  dev: devCommand,
  snapshot: snapshotCommand,
  build: buildCommand,
  studio: studioCommand,
  mcp: mcpCommand,
  render: renderCommand,
  motion: motionCommand,
  tokens: tokensCommand,
  chrome: chromeCommand,
} satisfies Record<string, CliCommand>;
