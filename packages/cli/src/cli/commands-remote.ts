import { deploy } from "../commands/deploy.ts";
import { type DomainTarget, domain } from "../commands/domain.ts";
import { transferOwner } from "../commands/owner.ts";
import { pullSite, pushSite } from "../commands/sync.ts";
import { askJurisdiction, askYesNo } from "./prompts.ts";
import type { CliCommand, CliValues } from "./types.ts";

/** `cloudhal deploy`, `domain`, `push`, `pull`, `owner`: the site on Cloudflare. */

function deployFlags(values: CliValues): {
  where: "eu" | undefined;
  ticker: "cron" | "alarm" | undefined;
  plan: "free" | "paid" | undefined;
} {
  const where = values.jurisdiction;
  if (where !== undefined && where !== "eu")
    throw new Error(`--jurisdiction must be eu (got "${where}")`);
  const ticker = values.scheduler;
  if (ticker !== undefined && ticker !== "cron" && ticker !== "alarm")
    throw new Error(`--scheduler must be cron or alarm (got "${ticker}")`);
  const plan = values.plan;
  if (plan !== undefined && plan !== "free" && plan !== "paid")
    throw new Error(`--plan must be free or paid (got "${plan}")`);
  return { where, ticker, plan };
}

const deployCommand: CliCommand = async (_rest, values, { projectDir }) => {
  const { where, ticker, plan } = deployFlags(values);
  const tty = process.stdin.isTTY && process.stdout.isTTY;
  const r = await deploy({
    projectDir,
    ...(values.name ? { name: values.name } : {}),
    ...(values["dry-run"] ? { dryRun: true } : {}),
    ...(where ? { jurisdiction: where } : {}),
    ...(ticker ? { scheduler: ticker } : {}),
    ...(plan ? { plan } : {}),
    ...(values["force-downgrade"] ? { forceDowngrade: true } : {}),
    ...(values["no-build-studio"] ? { buildStudio: false } : {}),
    log: (l) => console.log(l),
    // The analytics and data-location questions need a person at a terminal.
    ...(tty ? { prompt: askYesNo, askJurisdiction } : {}),
  });
  if (r.dryRun) {
    console.log(`\nDry run OK. Workers: ${r.names.site}, ${r.names.admin}. Nothing was deployed.`);
    return 0;
  }
  console.log(
    `\nSite:   ${r.siteUrl ?? "(see wrangler output)"}\nStudio: ${r.adminUrl ?? "(see wrangler output)"}`,
  );
  if (r.customSiteUrl || r.customStudioUrl)
    console.log(
      `Custom: ${[r.customSiteUrl, r.customStudioUrl].filter(Boolean).join(" · ")} (DNS and certificate can take a few minutes)`,
    );
  if (r.setupUrl)
    console.log(`\nLocal site pushed. Create the owner account (once) at:\n  ${r.setupUrl}`);
  if (r.setupInstructions) console.log(`\nStarter site pushed. ${r.setupInstructions}`);
  return 0;
};

function changeDomain(rest: string[], values: CliValues, projectDir: string) {
  const [action, arg] = rest;
  if (action === "set") {
    const redirects = (values.redirect ?? []).flatMap((v) => v.split(","));
    if (!arg && !values.studio && redirects.length === 0)
      throw new Error(
        "usage: cloudhal domain set <hostname> [--studio <hostname>] [--redirect <hostname>]…",
      );
    return domain({
      projectDir,
      set: {
        ...(arg ? { site: arg } : {}),
        ...(values.studio ? { studio: values.studio } : {}),
        ...(redirects.length > 0 ? { redirects } : {}),
      },
    });
  }
  if (action === "remove") {
    const which = arg ?? "all";
    if (!["site", "studio", "redirects", "all"].includes(which))
      throw new Error("usage: cloudhal domain remove [site|studio|redirects|all]");
    return domain({
      projectDir,
      remove: which === "all" ? ["site", "studio", "redirects"] : [which as DomainTarget],
    });
  }
  if (action === undefined) return domain({ projectDir });
  throw new Error(`unknown domain action "${action}" (set, remove)`);
}

const domainCommand: CliCommand = async (rest, values, { projectDir }) => {
  const result = await changeDomain(rest, values, projectDir);
  console.log(
    result
      ? `site:   ${result.site ? `https://${result.site}` : "(workers.dev)"}\nstudio: ${result.studio ? `https://${result.studio}` : "(workers.dev)"}${result.redirects ? `\n301:    ${result.redirects.join(", ")} → https://${result.site}` : ""}`
      : "no custom domains; the Workers answer on workers.dev",
  );
  if (rest[0])
    console.log("run `cloudhal deploy` to apply (the zone must be in your Cloudflare account)");
  return 0;
};

/** `cloudhal push` and `cloudhal pull` take the same flags. */
function syncCommand(run: typeof pushSite | typeof pullSite): CliCommand {
  return async (_rest, values, { projectDir }) => {
    const opts = {
      projectDir,
      ...(values.replace ? { replace: true } : {}),
      ...(values["cancel-schedules"] ? { cancelSchedules: true } : {}),
      ...(values["admin-url"] ? { adminUrl: values["admin-url"] } : {}),
      log: (l: string) => console.log(l),
    };
    await run(opts);
    return 0;
  };
}

const ownerCommand: CliCommand = async (rest, values, { projectDir }) => {
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
};

export const REMOTE_COMMANDS = {
  deploy: deployCommand,
  domain: domainCommand,
  push: syncCommand(pushSite),
  pull: syncCommand(pullSite),
  owner: ownerCommand,
} satisfies Record<string, CliCommand>;
