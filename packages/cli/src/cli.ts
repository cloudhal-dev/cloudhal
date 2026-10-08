import { parseArgs } from "node:util";
import { isAgentMode, type Scope } from "@cloudhal/agent-runtime";
import { build, dev } from "./commands/astro.ts";
import { deploy } from "./commands/deploy.ts";
import { init } from "./commands/init.ts";
import { mcp } from "./commands/mcp.ts";
import { snapshot } from "./commands/snapshot.ts";
import { studio } from "./commands/studio.ts";
import { pullSite, pushSite } from "./commands/sync.ts";

const HELP = `cloudhal — agent-native sites

Usage:
  cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
  cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
  cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
  cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
  cloudhal studio [--port <n>] [--no-auth]                API + Studio UI for this project (default :8787)
  cloudhal mcp [--mode plan|manual|edits|auto|bypass] [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                          MCP server over stdio for this project
  cloudhal deploy [--name <base>] [--dry-run]             site + admin Workers on Cloudflare (uses wrangler login)
  cloudhal push [--replace] [--admin-url <url>]           local site → deployment
  cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
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
      "no-auth": { type: "boolean" },
      scopes: { type: "string" },
      skills: { type: "string" },
      "preview-url": { type: "string" },
      mode: { type: "string" },
      "dry-run": { type: "boolean" },
      replace: { type: "boolean" },
      "admin-url": { type: "string" },
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
    case "studio": {
      const s = await studio({
        projectDir,
        ...(values.port ? { port: Number(values.port) } : {}),
        ...(values["no-auth"] ? { noAuth: true } : {}),
      });
      console.log(`cloudhal studio → ${s.url}`);
      await new Promise<void>((resolve) => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => resolve());
      });
      await s.stop();
      return 0;
    }
    case "deploy": {
      const r = await deploy({
        projectDir,
        ...(values.name ? { name: values.name } : {}),
        ...(values["dry-run"] ? { dryRun: true } : {}),
        log: (l) => console.log(l),
      });
      if (r.dryRun) {
        console.log(
          `\nDry run OK. Workers: ${r.names.site}, ${r.names.admin}. Nothing was deployed.`,
        );
      } else {
        console.log(
          `\nSite:   ${r.siteUrl ?? "(see wrangler output)"}\nStudio: ${r.adminUrl ?? "(see wrangler output)"}`,
        );
        if (r.setupUrl)
          console.log(`\nLocal site pushed. Create the owner account (once) at:\n  ${r.setupUrl}`);
      }
      return 0;
    }
    case "push":
    case "pull": {
      const opts = {
        projectDir,
        ...(values.replace ? { replace: true } : {}),
        ...(values["admin-url"] ? { adminUrl: values["admin-url"] } : {}),
        log: (l: string) => console.log(l),
      };
      if (command === "push") await pushSite(opts);
      else await pullSite(opts);
      return 0;
    }
    case "mcp": {
      const server = await mcp({
        projectDir,
        ...(values.scopes
          ? { scopes: values.scopes.split(",").map((s) => s.trim()) as Scope[] }
          : {}),
        ...(values.skills ? { skillsDir: values.skills } : {}),
        ...(values["preview-url"] ? { previewUrl: values["preview-url"] } : {}),
        ...(values.mode
          ? (() => {
              if (!isAgentMode(values.mode)) throw new Error(`unknown --mode "${values.mode}"`);
              return { mode: values.mode };
            })()
          : {}),
      });
      await new Promise<void>((resolve) => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => resolve());
        process.stdin.once("close", () => resolve());
      });
      await server.stop();
      return 0;
    }
    default:
      process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
      return 1;
  }
}
