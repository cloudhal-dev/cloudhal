/**
 * The self-host image's runtime entry (RFC-0047 §9): `start`, `check`, `config` and `secrets`
 * without the rest of the CLI. The image's last stage carries only this folder (as compiled into
 * `@cloudhal/cli/dist/src/selfhost`), Node, workerd and the release bundle; everything imported
 * from here is a Node built-in or a sibling file. `cloudhal selfhost …` runs the same functions.
 *
 *   node main.js start|check|config|secrets [--in <bundle>]
 */
import path from "node:path";
import { checkBundle, readBundleManifest } from "./bundle-check.ts";
import { secretsEnv } from "./secrets.ts";
import { readSettings, resolveSecretFiles } from "./settings.ts";
import { startSelfhost } from "./start.ts";
import { workerdConfig } from "./workerd-config.ts";

const USAGE = "usage: cloudhal-selfhost start|check|config|secrets [--in <bundle>]";

function bundleDir(args: string[]): string {
  const i = args.indexOf("--in");
  const value = i === -1 ? undefined : args[i + 1];
  return path.resolve(value ?? process.env.CLOUDHAL_BUNDLE ?? "/opt/cloudhal/bundle");
}

async function run(command: string | undefined, args: string[]): Promise<number> {
  switch (command) {
    case "start":
      return startSelfhost({ bundleDir: bundleDir(args) });
    case "check": {
      const m = await checkBundle(bundleDir(args));
      console.log(`ok: Cloudhal ${m.version} (commit ${m.commit.slice(0, 12)})`);
      return 0;
    }
    case "config": {
      const dir = bundleDir(args);
      const settings = readSettings(resolveSecretFiles(process.env));
      const manifest = await readBundleManifest(dir);
      process.stdout.write(
        workerdConfig({ manifest, bundleDir: dir, configDir: process.cwd(), settings }),
      );
      return 0;
    }
    case "secrets":
      process.stdout.write(secretsEnv());
      return 0;
    default:
      console.error(USAGE);
      return 2;
  }
}

const [command, ...args] = process.argv.slice(2);
run(command, args).then(
  (code) => {
    process.exitCode = code;
  },
  (e: Error) => {
    console.error(e.message);
    process.exitCode = 1;
  },
);
