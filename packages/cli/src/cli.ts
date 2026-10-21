import { parseArgs } from "node:util";
import { CONTENT_COMMANDS } from "./cli/commands-content.ts";
import { LOCAL_COMMANDS } from "./cli/commands-local.ts";
import { OPS_COMMANDS } from "./cli/commands-ops.ts";
import { REMOTE_COMMANDS } from "./cli/commands-remote.ts";
import { SITE_COMMANDS } from "./cli/commands-site.ts";
import { HELP } from "./cli/help.ts";
import type { CliCommand } from "./cli/types.ts";

/** Every flag any command takes; `CliValues` (cli/types.ts) is inferred from it. */
export const OPTIONS = {
  help: { type: "boolean", short: "h" },
  name: { type: "string" },
  starter: { type: "string" },
  port: { type: "string" },
  host: { type: "boolean" },
  label: { type: "string" },
  publish: { type: "boolean" },
  snapshot: { type: "string" },
  "no-auth": { type: "boolean" },
  scopes: { type: "string" },
  skills: { type: "string" },
  "preview-url": { type: "string" },
  mode: { type: "string" },
  "dry-run": { type: "boolean" },
  replace: { type: "boolean" },
  "admin-url": { type: "string" },
  studio: { type: "string" },
  redirect: { type: "string", multiple: true },
  revert: { type: "string" },
  to: { type: "string" },
  "include-markdown": { type: "boolean" },
  "allow-host": { type: "string", multiple: true },
  remote: { type: "boolean" },
  all: { type: "boolean" },
  redo: { type: "boolean" },
  days: { type: "string" },
  views: { type: "string" },
  from: { type: "string" },
  out: { type: "string" },
  jurisdiction: { type: "string" },
  in: { type: "string" },
  file: { type: "string" },
  "with-personal-data": { type: "boolean" },
  scheduler: { type: "string" },
  plan: { type: "string" },
  "force-downgrade": { type: "boolean" },
  "no-build-studio": { type: "boolean" },
  "cancel-schedules": { type: "boolean" },
  limit: { type: "string" },
  models: { type: "string" },
  briefs: { type: "string" },
  design: { type: "boolean" },
  look: { type: "boolean" },
  judge: { type: "string" },
  format: { type: "string" },
  width: { type: "string" },
  scheme: { type: "string" },
  motion: { type: "string" },
  frames: { type: "string" },
  base: { type: "string" },
  path: { type: "string" },
  slug: { type: "string" },
  locale: { type: "string" },
  project: { type: "string" },
  theme: { type: "string" },
  confirm: { type: "string" },
} as const;

/** `cloudhal <command>` → its handler. */
export const COMMANDS: Record<string, CliCommand> = {
  ...LOCAL_COMMANDS,
  ...REMOTE_COMMANDS,
  ...CONTENT_COMMANDS,
  ...OPS_COMMANDS,
  ...SITE_COMMANDS,
};

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: OPTIONS,
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command ? 0 : 1;
  }
  const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!run) {
    process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
    return 1;
  }
  return run(rest, values, { projectDir: process.cwd() });
}
