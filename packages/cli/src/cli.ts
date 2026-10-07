import { parseArgs } from "node:util";
import { build, dev } from "./commands/astro.ts";
import { init } from "./commands/init.ts";
import { snapshot } from "./commands/snapshot.ts";

const HELP = `cloudhal — agent-native sites

Usage:
  cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
  cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
  cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
  cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
  cloudhal --help
`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      name: { type: "string" },
      starter: { type: "string" },
      port: { type: "string" },
      host: { type: "boolean" },
      label: { type: "string" },
      publish: { type: "boolean" },
      snapshot: { type: "string" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command ? 0 : 1;
  }
  const projectDir = process.cwd();
  switch (command) {
    case "init": {
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
    }
    case "dev": {
      const server = await dev({
        projectDir,
        ...(values.port ? { port: Number(values.port) } : {}),
        ...(values.host ? { host: true } : {}),
      });
      if (server.url) console.log(`cloudhal dev → ${server.url}`);
      await new Promise<void>((resolve) => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => resolve());
      });
      await server.stop();
      return 0;
    }
    case "snapshot": {
      const snap = await snapshot({
        projectDir,
        ...(values.label ? { label: values.label } : {}),
        ...(values.publish ? { publish: true } : {}),
      });
      console.log(
        `${snap.id}  nodes=${snap.nodes.length}  +${snap.summary.added} ~${snap.summary.changed} -${snap.summary.removed}${values.publish ? "  (published)" : ""}`,
      );
      return 0;
    }
    case "build": {
      const r = await build({
        projectDir,
        ...(values.snapshot ? { snapshotId: values.snapshot } : {}),
      });
      console.log(`built ${r.outDir} from ${r.snapshotId}`);
      return 0;
    }
    default:
      process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
      return 1;
  }
}
