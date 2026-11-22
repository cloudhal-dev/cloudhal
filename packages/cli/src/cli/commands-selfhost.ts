import path from "node:path";
import { checkBundle, fetchBundle, readBundleManifest } from "../selfhost/bundle.ts";
import { secretsEnv } from "../selfhost/secrets.ts";
import { readSettings, resolveSecretFiles } from "../selfhost/settings.ts";
import { startSelfhost } from "../selfhost/start.ts";
import { workerdConfig } from "../selfhost/workerd-config.ts";
import { type CliCommand, subcommands } from "./types.ts";

/** `cloudhal selfhost`: the workerd self-host image's own commands (RFC-0047). */

const DEFAULT_BUNDLE = "/opt/cloudhal/bundle";
const bundleDir = (v: string | undefined) =>
  path.resolve(v ?? process.env.CLOUDHAL_BUNDLE ?? DEFAULT_BUNDLE);

const fetchCommand: CliCommand = async ([version], values) => {
  if (!version || !values.out)
    throw new Error("usage: cloudhal selfhost fetch <version> --out <dir> [--from <dir>]");
  await fetchBundle({
    version,
    out: path.resolve(values.out),
    from: values.from,
    log: (l) => console.log(l),
  });
  return 0;
};

const checkCommand: CliCommand = async (_rest, values) => {
  const m = await checkBundle(bundleDir(values.in));
  console.log(`ok: Cloudhal ${m.version} (commit ${m.commit.slice(0, 12)})`);
  return 0;
};

const configCommand: CliCommand = async (_rest, values) => {
  const dir = bundleDir(values.in);
  const settings = readSettings(resolveSecretFiles(process.env));
  const configDir = path.resolve(values.out ? path.dirname(values.out) : process.cwd());
  process.stdout.write(
    workerdConfig({ manifest: await readBundleManifest(dir), bundleDir: dir, configDir, settings }),
  );
  return 0;
};

const secretsCommand: CliCommand = async () => {
  process.stdout.write(secretsEnv());
  return 0;
};

const startCommand: CliCommand = async (_rest, values) =>
  startSelfhost({
    bundleDir: bundleDir(values.in),
    ...(process.env.CLOUDHAL_WORKERD ? { workerd: process.env.CLOUDHAL_WORKERD } : {}),
  });

export const SELFHOST_COMMANDS = {
  selfhost: subcommands(
    {
      fetch: fetchCommand,
      check: checkCommand,
      config: configCommand,
      secrets: secretsCommand,
      start: startCommand,
    },
    "usage: cloudhal selfhost fetch|check|config|secrets|start",
  ),
} satisfies Record<string, CliCommand>;
