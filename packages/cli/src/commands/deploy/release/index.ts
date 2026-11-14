/**
 * `cloudhal deploy --release` (RFC-0046 §11b): installs this CLI version's signed release into
 * the project's Cloudflare account instead of building the project. The site and admin code come
 * from the bundle; the project contributes its content (the first push), config and secrets.
 *
 *   0. refusals: another installation, several sites, Workers Builds, a version with no bundle;
 *   1. the signed key and yank lists (online every run, or `--from`), checked against the memory;
 *   2. the release's statement, signature and manifest (published, not a draft, with a bundle);
 *   3. the theme check, the config build keys and the wrangler version, on that manifest;
 *   4. the tarball, then `verifyRelease` (§2 steps 1–5, keys reduced by both lists, yanks);
 *   5. the build-provenance attestation (`--allow-single-factor` when `gh` is unavailable);
 *   6. extraction into a fresh directory, and the wrangler configs for exactly those bytes;
 *   7. as every deploy: resources, secrets, the downgrade guard (the manifest's schedules level),
 *      both Workers, state, the first push and the cache purge.
 *
 * Nothing is written outside `.cloudhal/deploy/`, and nothing is uploaded, before step 5 passes.
 * `--dry-run` stops after step 6.
 */
import path from "node:path";
import {
  mergeTrust,
  PINNED_KEYS,
  type ReleaseManifest,
  type VerifiedRelease,
  verifyRelease,
} from "@cloudhal/release-verify";
import { cliVersion } from "../../../assets.ts";
import {
  adminWorkerConfig,
  readExistingIds,
  type SchedulerTicker,
} from "../../../cloudflare/config.ts";
import { readProjectConfig } from "../../../config.ts";
import type { DeployContext } from "../context.ts";
import { deploySecrets, finishDeploy } from "../finish.ts";
import type { DeployOptions, DeployResult } from "../options.ts";
import {
  analyticsAndComments,
  deploySettings,
  loadDeploy,
  provision,
  siteConfigFor,
} from "../prepare.ts";
import { downgradeGuard } from "../schedules-guard.ts";
import { attachedWorkers } from "../served-sites.ts";
import { commentsResult } from "../settings.ts";
import { shipWorkers } from "../ship.ts";
import { checkBuildKeys, checkProjectShape, checkTheme, checkWrangler } from "./checks.ts";
import { writeReleaseConfigs } from "./configs.ts";
import { type ReleaseDeployCode, refuseDeploy } from "./errors.ts";
import { type Extracted, extractRelease } from "./extract.ts";
import {
  checkBundledVersion,
  fetchRelease,
  fetchTarball,
  type ReleaseSource,
} from "./fetch-release.ts";
import type { ReleaseResult } from "./options.ts";
import { loadTrust } from "./trust.ts";

/** The manifest's facts the checks need, before it is verified (verification follows before any use). */
function unverifiedFacts(bytes: Uint8Array): {
  features: Record<string, boolean>;
  wrangler: string | undefined;
} {
  try {
    const m = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ReleaseManifest>;
    const wrangler = m.toolchain?.wrangler;
    return {
      features: Object.fromEntries(
        Object.entries(m.features ?? {}).filter(
          (e): e is [string, boolean] => typeof e[1] === "boolean",
        ),
      ),
      wrangler: typeof wrangler === "string" ? wrangler : undefined,
    };
  } catch {
    return { features: {}, wrangler: undefined }; // verifyRelease refuses it next
  }
}

async function attestation(
  options: DeployOptions,
  input: { dir: string; version: string; commit: string },
  log: (line: string) => void,
): Promise<ReleaseResult["attestation"]> {
  const attest =
    options.attest ??
    (async (o: typeof input) =>
      (await import("@cloudhal/release-verify/attestation")).verifyAttestation(o));
  const r = await attest(input);
  if (r.status === "verified") return "verified";
  if (r.status === "failed")
    return refuseDeploy(
      "attestation-failed" satisfies ReleaseDeployCode,
      `the build-provenance attestation of ${r.file} failed (${r.reason}): these files were not built by this repository's bundle-build.yml. Nothing was deployed.`,
    );
  if (!options.allowSingleFactor)
    return refuseDeploy(
      "attestation-unavailable",
      `the build-provenance attestation cannot be checked: ${r.reason}. Install the GitHub CLI 2.68 or newer (https://cli.github.com) and run \`gh auth login\`, or add --allow-single-factor to rely on the release key alone.`,
    );
  log(
    `--allow-single-factor: the attestation is not checked (${r.reason}); this install relies on the release key alone`,
  );
  return "single-factor";
}

/** Steps 1–6 (see the file comment): the verified, extracted release. */
async function verifiedRelease(ctx: DeployContext, version: string) {
  const { options, log } = ctx;
  const trust = await loadTrust({
    from: options.from,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.trustRoots ? { roots: options.trustRoots } : {}),
    ...(options.trustStateFile ? { stateFile: options.trustStateFile } : {}),
  });
  log(
    `trust: keys.json ${trust.keys.sha256.slice(0, 12)}, yanked.json serial ${trust.yanked.document.serial}`,
  );
  const source: ReleaseSource = {
    version,
    from: options.from,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    dir: path.join(ctx.dir, "release-download", version),
  };
  const files = await fetchRelease(source);
  const facts = unverifiedFacts(files.manifest);
  const notDeployed = await checkTheme(options.projectDir, options.discardLocalTheme, log);
  await checkBuildKeys(options.projectDir, facts.features);
  await checkWrangler(options.projectDir, facts.wrangler, options.wranglerVersion);
  const tarball = await fetchTarball(source);
  const release: VerifiedRelease = await verifyRelease({
    request: { version },
    statement: files.statement,
    signature: files.signature,
    manifest: files.manifest,
    tarball,
    planVersion: 1,
    keys: mergeTrust(options.pinnedKeys ?? PINNED_KEYS, trust),
    yanked: trust.yanked,
  });
  log(
    `verified v${version} (commit ${release.statement.commit.slice(0, 12)}, key ${release.statement.signing.keyId})`,
  );
  const attested = await attestation(
    options,
    { dir: files.dir, version, commit: release.statement.commit },
    log,
  );
  const extracted = await extractRelease(release, path.join(ctx.dir, "release", version));
  log(
    `extracted ${extracted.files} verified files into ${path.relative(options.projectDir, extracted.dir)}`,
  );
  return { release, extracted, attested, notDeployed };
}

export async function deployRelease(options: DeployOptions): Promise<DeployResult> {
  const cfg = await readProjectConfig(options.projectDir);
  checkProjectShape(cfg, options.workersBuilds);
  const version = options.cliVersion ?? (await cliVersion());
  checkBundledVersion(version);
  const ctx = await loadDeploy(options);
  const { release, extracted, attested, notDeployed } = await verifiedRelease(ctx, version);
  const manifest = release.manifest;

  const { analytics, comments } = await analyticsAndComments(ctx);
  const { withIds, databaseCreated } = await provision(ctx);
  const secrets = await deploySecrets(ctx);
  const previous = ctx.previous;
  if (!options.dryRun && previous?.adminUrl)
    await downgradeGuard(
      options,
      {
        adminUrl: previous.adminUrl,
        token: secrets.known.CLOUDHAL_DEPLOY_TOKEN as string,
        localLevel: manifest.levels.schedules,
      },
      ctx.log,
    );
  const settings = await deploySettings(ctx);
  const { plan, schedules, observability } = settings;
  const siteConfig = await siteConfigFor(ctx, { withIds, analytics, comments, observability });
  const siteWorkers = await attachedWorkers(ctx);
  const existing = await readExistingIds(
    path.join(ctx.dir, "release-config", "admin", "wrangler.jsonc"),
  );
  const adminConfig = (scheduler: SchedulerTicker) =>
    adminWorkerConfig({
      ...existing,
      ...withIds,
      siteId: cfg.siteId,
      ...(siteWorkers.length ? { siteWorkers } : {}),
      main: "(release)",
      studioDir: extracted.admin.assetsDir,
      ...(cfg.domains?.studio ? { domain: cfg.domains.studio } : {}),
      ...(analytics ? { analytics } : {}),
      comments,
      scheduler,
      schedules,
      ...(cfg.mail ? { mail: cfg.mail } : {}),
      ...(cfg.ai ? { ai: true } : {}),
      ...(cfg.render !== false ? { browser: true } : {}),
      observability,
      ...(cfg.placement ? { placement: cfg.placement } : {}),
    });
  const write = (scheduler: SchedulerTicker) =>
    writeReleaseConfigs({
      deployDir: ctx.dir,
      manifest,
      site: { config: siteConfig, worker: extracted.site },
      admin: { config: adminConfig(scheduler), worker: extracted.admin },
    });
  const configs = await write(settings.scheduler);
  const result: ReleaseResult = {
    version,
    commit: release.statement.commit,
    attestation: attested,
    files: extracted.files,
    ...(notDeployed.length > 0 ? { notDeployed: notDeployed.map((d) => d.path) } : {}),
  };
  if (options.dryRun) {
    ctx.log(
      "dry run complete: the verified release and its configs are in .cloudhal/deploy (nothing was deployed)",
    );
    return {
      dryRun: true,
      names: ctx.names,
      siteConfig: configs.site.configPath,
      adminConfig: configs.admin.configPath,
      scheduler: settings.scheduler,
      schedules,
      analytics: analytics
        ? { enabled: true, dataset: analytics.dataset, cron: settings.scheduler === "cron" }
        : { enabled: false },
      comments: commentsResult(comments, settings.scheduler),
      release: result,
    };
  }
  const shipped = await shipWorkers(ctx, {
    siteSecrets: secrets.site,
    adminSecrets: secrets.admin,
    site: configs.site,
    admin: configs.admin,
    prepareAdmin: async (ticker) => (await write(ticker)).admin,
    scheduler: settings.scheduler,
  });
  const done = await finishDeploy(ctx, {
    shipped,
    known: secrets.known,
    analytics,
    comments,
    databaseCreated,
    plan,
    schedules,
    siteConfig: configs.site.configPath,
    adminConfig: configs.admin.configPath,
  });
  return { ...done, release: result };
}

export type { Extracted };
