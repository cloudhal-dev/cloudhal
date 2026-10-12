import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { isAgentMode, type Scope } from "@cloudhal/agent-runtime";
import {
  analyticsExport,
  analyticsRollup,
  analyticsSeed,
  analyticsStatus,
  describeStatus,
} from "./commands/analytics.ts";
import { build, dev } from "./commands/astro.ts";
import {
  commentsExportCli,
  commentsImportCli,
  commentsStatusCli,
  describeCommentsStatus,
} from "./commands/comments.ts";
import { deploy } from "./commands/deploy.ts";
import { type DomainTarget, domain } from "./commands/domain.ts";
import { init } from "./commands/init.ts";
import { mcp } from "./commands/mcp.ts";
import { describeMediaImport, mediaGc, mediaImportUrls, mediaVerify } from "./commands/media.ts";
import { describeMigration, migrateTags } from "./commands/migrate.ts";
import { transferOwner } from "./commands/owner.ts";
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
  cloudhal deploy [--name <base>] [--dry-run] [--jurisdiction eu]
                                                          site + admin Workers on Cloudflare (uses wrangler login);
                                                          --jurisdiction eu keeps a newly created D1 database
                                                          in the EU (cannot be changed later)
  cloudhal domain [set <hostname>] [--studio <hostname>] | remove [site|studio|all]
                                                          custom domains for the next deploy
  cloudhal push [--replace] [--admin-url <url>]           local site → deployment
  cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
  cloudhal owner transfer --to <email> [--admin-url <url>]
                                                          make a member the deployment's Owner
                                                          (lockout recovery; uses the deployment token)
  cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]
                                                          move entry tags into tag terms (RFC-0002);
                                                          resumable; --revert <id> undoes a run
  cloudhal media import-urls [--dry-run] [--include-markdown] [--allow-host <host>]… | --revert <id>
                                                          copy linked images into the media library
                                                          (RFC-0004); revertible
  cloudhal media verify [<assetId>]                       recompute media checksums
  cloudhal media gc [--dry-run]                           delete unreferenced media bytes (> 24 h old)
  cloudhal analytics status [--remote]                    site analytics: settings, daily totals, budget
  cloudhal analytics rollup [--days <n>] [--remote] [--redo]
                                                          compute daily totals (--remote backfills the
                                                          deployment from WAE, up to 92 days)
  cloudhal analytics seed [--days <n>] [--views <n>]      demo traffic in the local SQLite only
  cloudhal analytics export [--from <date> --to <date>] [--remote] [--out <file>]
                                                          daily totals as CSV (default: 30 days)
  cloudhal comments status [--remote]                     reader comments: counts, pending, daily cap, purges
  cloudhal comments export [--remote] [--with-personal-data --out <file>]
                                                          comments as JSON lines (stdout or --out)
  cloudhal comments import --in <file> [--remote]         JSON lines back in; idempotent, safe to rerun
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
      studio: { type: "string" },
      revert: { type: "string" },
      to: { type: "string" },
      "include-markdown": { type: "boolean" },
      "allow-host": { type: "string", multiple: true },
      remote: { type: "boolean" },
      redo: { type: "boolean" },
      days: { type: "string" },
      views: { type: "string" },
      from: { type: "string" },
      out: { type: "string" },
      jurisdiction: { type: "string" },
      in: { type: "string" },
      "with-personal-data": { type: "boolean" },
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
      const where = values.jurisdiction;
      if (where !== undefined && where !== "eu")
        throw new Error(`--jurisdiction must be eu (got "${where}")`);
      const tty = process.stdin.isTTY && process.stdout.isTTY;
      const r = await deploy({
        projectDir,
        ...(values.name ? { name: values.name } : {}),
        ...(values["dry-run"] ? { dryRun: true } : {}),
        ...(where ? { jurisdiction: where } : {}),
        log: (l) => console.log(l),
        // The analytics and data-location questions need a person at a terminal.
        ...(tty ? { prompt: askYesNo, askJurisdiction } : {}),
      });
      if (r.dryRun) {
        console.log(
          `\nDry run OK. Workers: ${r.names.site}, ${r.names.admin}. Nothing was deployed.`,
        );
      } else {
        console.log(
          `\nSite:   ${r.siteUrl ?? "(see wrangler output)"}\nStudio: ${r.adminUrl ?? "(see wrangler output)"}`,
        );
        if (r.customSiteUrl || r.customStudioUrl)
          console.log(
            `Custom: ${[r.customSiteUrl, r.customStudioUrl].filter(Boolean).join(" · ")} (DNS and certificate can take a few minutes)`,
          );
        if (r.setupUrl)
          console.log(`\nLocal site pushed. Create the owner account (once) at:\n  ${r.setupUrl}`);
      }
      return 0;
    }
    case "domain": {
      const [action, arg] = rest;
      let result: Awaited<ReturnType<typeof domain>>;
      if (action === "set") {
        if (!arg && !values.studio)
          throw new Error("usage: cloudhal domain set <hostname> [--studio <hostname>]");
        result = await domain({
          projectDir,
          set: {
            ...(arg ? { site: arg } : {}),
            ...(values.studio ? { studio: values.studio } : {}),
          },
        });
      } else if (action === "remove") {
        const which = arg ?? "all";
        if (!["site", "studio", "all"].includes(which))
          throw new Error("usage: cloudhal domain remove [site|studio|all]");
        result = await domain({
          projectDir,
          remove: which === "all" ? ["site", "studio"] : [which as DomainTarget],
        });
      } else if (action === undefined) {
        result = await domain({ projectDir });
      } else {
        throw new Error(`unknown domain action "${action}" (set, remove)`);
      }
      console.log(
        result
          ? `site:   ${result.site ? `https://${result.site}` : "(workers.dev)"}\nstudio: ${result.studio ? `https://${result.studio}` : "(workers.dev)"}`
          : "no custom domains; the Workers answer on workers.dev",
      );
      if (action)
        console.log("run `cloudhal deploy` to apply (the zone must be in your Cloudflare account)");
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
    case "owner": {
      const [action] = rest;
      if (action !== "transfer" || !values.to)
        throw new Error("usage: cloudhal owner transfer --to <email> [--admin-url <url>]");
      await transferOwner({
        projectDir,
        to: values.to,
        ...(values["admin-url"] ? { adminUrl: values["admin-url"] } : {}),
        log: (l) => console.log(l),
      });
      return 0;
    }
    case "migrate": {
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
    }
    case "media": {
      const [what, arg] = rest;
      if (what === "import-urls") {
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
      }
      if (what === "verify") {
        const r = await mediaVerify({ projectDir, ...(arg ? { assetId: arg } : {}) });
        console.log(`checked ${r.checked}: ${r.ok.length} ok, ${r.problems.length} problem(s)`);
        for (const p of r.problems) console.log(`  ${p.assetId}: ${p.problem}`);
        return r.problems.length ? 1 : 0;
      }
      if (what === "gc") {
        const r = await mediaGc({ projectDir, ...(values["dry-run"] ? { dryRun: true } : {}) });
        console.log(
          `${r.dryRun ? "would delete" : "deleted"} ${r.collected.length} unreferenced file(s)`,
        );
        return 0;
      }
      throw new Error("usage: cloudhal media import-urls|verify|gc");
    }
    case "analytics": {
      const [what] = rest;
      const number = (v: string | undefined) => (v === undefined ? undefined : Number(v));
      const remote = values.remote ? { remote: true } : {};
      const adminUrl = values["admin-url"] ? { adminUrl: values["admin-url"] } : {};
      if (what === "status") {
        const s = await analyticsStatus({ projectDir, ...remote, ...adminUrl });
        for (const line of describeStatus(s)) console.log(line);
        return 0;
      }
      if (what === "rollup") {
        const days = number(values.days);
        const r = await analyticsRollup({
          projectDir,
          ...remote,
          ...adminUrl,
          ...(days !== undefined ? { days } : {}),
          ...(values.redo ? { redo: true } : {}),
          log: (l) => console.log(l),
        });
        console.log(
          `${r.done} day(s) rolled up, ${r.pending} pending${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.pruned ? `; ${r.pruned} old raw event(s) pruned` : ""}`,
        );
        for (const f of r.failed) console.log(`  ${f.day}: ${f.error}`);
        return r.failed.length ? 1 : 0;
      }
      if (what === "seed") {
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
      }
      if (what === "export") {
        const csv = await analyticsExport({
          projectDir,
          ...remote,
          ...adminUrl,
          ...(values.from ? { from: values.from } : {}),
          ...(values.to ? { to: values.to } : {}),
          ...(values.out ? { out: values.out } : {}),
        });
        if (values.out) console.log(`wrote ${values.out}`);
        else process.stdout.write(csv);
        return 0;
      }
      throw new Error("usage: cloudhal analytics status|rollup|seed|export");
    }
    case "comments": {
      const [what] = rest;
      const remote = values.remote ? { remote: true } : {};
      const adminUrl = values["admin-url"] ? { adminUrl: values["admin-url"] } : {};
      if (what === "status") {
        const s = await commentsStatusCli({ projectDir, ...remote, ...adminUrl });
        for (const line of describeCommentsStatus(s)) console.log(line);
        return 0;
      }
      if (what === "export") {
        const personal = values["with-personal-data"] === true;
        if (personal && !values.out)
          throw new Error(
            "--with-personal-data needs --out <file> (the file holds email addresses; it is written owner-only)",
          );
        const r = await commentsExportCli({
          projectDir,
          ...remote,
          ...adminUrl,
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
      }
      if (what === "import") {
        if (!values.in) throw new Error("usage: cloudhal comments import --in <file> [--remote]");
        const r = await commentsImportCli({
          projectDir,
          ...remote,
          ...adminUrl,
          file: values.in,
          log: (l) => console.log(l),
        });
        console.log(
          `${r.imported} imported, ${r.skipped} already there${r.commenters ? `, ${r.commenters} commenter email(s) stored` : ""}${r.invalid.length ? `, ${r.invalid.length} refused` : ""}`,
        );
        for (const p of r.invalid)
          console.log(`  line ${p.line}${p.id ? ` (${p.id})` : ""}: ${p.error}`);
        return r.invalid.length ? 1 : 0;
      }
      throw new Error("usage: cloudhal comments status|export|import");
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

/**
 * Where a new D1 database should live (RFC-0007 D7), asked only when `cloudhal deploy` is about to
 * create it. Enter keeps the automatic location.
 */
async function askJurisdiction(): Promise<"auto" | "eu"> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question(
          "Where should the D1 database live?\n  1) Automatic: Cloudflare picks the location (default)\n  2) EU jurisdiction: the data stays inside the EU\nA location cannot be changed after the database is created. Choose [1/2]: ",
        )
      )
        .trim()
        .toLowerCase();
      if (answer === "" || answer === "1" || answer === "automatic") return "auto";
      if (answer === "2" || answer === "eu") return "eu";
    }
  } finally {
    rl.close();
  }
}

/** A yes/no question at the terminal; Enter means yes. */
async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
