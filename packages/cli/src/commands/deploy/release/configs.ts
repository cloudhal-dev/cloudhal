/**
 * The wrangler configs that deploy a verified bundle's bytes unchanged (RFC-0046 §11b): the same
 * configs `cloudhal deploy` generates today (`siteWorkerConfig`, `adminWorkerConfig`), with
 *
 * - `main` the extracted main module and `no_bundle: true`;
 * - one `rules` entry per module type whose globs are exactly that type's module paths, with
 *   `fallthrough: false`, and `preserve_file_names`, so wrangler uploads exactly the listed
 *   modules under the names the bundle's code imports;
 * - the compatibility date and flags of the manifest;
 * - `assets.directory` the extracted assets, with the manifest's routing config.
 *
 * They live in `.cloudhal/deploy/release-config/{site,admin}/wrangler.jsonc`, next to nothing else.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ReleaseManifest } from "@cloudhal/release-verify";
import {
  type adminWorkerConfig,
  type siteWorkerConfig,
  writeWranglerConfig,
} from "../../../cloudflare/config.ts";
import type { ExtractedWorker, WorkerRole } from "./extract.ts";

/** Manifest module types → wrangler rule types. */
export const RULE_TYPES: Readonly<Record<string, string>> = {
  esm: "ESModule",
  cjs: "CommonJS",
  wasm: "CompiledWasm",
  text: "Text",
  data: "Data",
};

type GeneratedConfig = ReturnType<typeof siteWorkerConfig> | ReturnType<typeof adminWorkerConfig>;

const posix = (p: string) => p.split(path.sep).join("/");

/** `config` changed to upload `worker`'s extracted bytes as they are (see the file comment). */
export function releaseConfig(
  config: GeneratedConfig,
  input: {
    role: WorkerRole;
    worker: ExtractedWorker;
    manifest: ReleaseManifest;
    /** The directory the config is written to; every path in it is relative to that. */
    configDir: string;
  },
): Record<string, unknown> {
  const { $schema: _schema, ...rest } = config as Record<string, unknown> & { $schema?: unknown };
  const w = input.worker;
  const rel = (p: string) => posix(path.relative(input.configDir, p)) || ".";
  const rules = Object.entries(w.modulesByType).map(([type, paths]) => {
    const rule = RULE_TYPES[type];
    if (!rule) throw new Error(`the bundle lists a module of unknown type ${type}`);
    return { type: rule, globs: [...paths].sort(), fallthrough: false };
  });
  const generatedAssets =
    typeof rest.assets === "object" && rest.assets ? (rest.assets as Record<string, unknown>) : {};
  const runtime = input.manifest.runtime;
  return {
    ...rest,
    main: rel(path.join(w.modulesDir, w.mainModule)),
    base_dir: rel(w.modulesDir),
    no_bundle: true,
    find_additional_modules: true,
    preserve_file_names: true,
    rules,
    compatibility_date: runtime.compatibilityDate,
    compatibility_flags: [...runtime.compatibilityFlags],
    assets: {
      ...generatedAssets,
      binding: "ASSETS",
      directory: rel(w.assetsDir),
      ...(input.manifest.workers[input.role].assets.config ?? {}),
    },
  };
}

/** Writes both configs; returns their paths and directories (wrangler runs in each). */
export async function writeReleaseConfigs(input: {
  deployDir: string;
  manifest: ReleaseManifest;
  site: { config: ReturnType<typeof siteWorkerConfig>; worker: ExtractedWorker };
  admin: { config: ReturnType<typeof adminWorkerConfig>; worker: ExtractedWorker };
}): Promise<{
  site: { dir: string; configPath: string };
  admin: { dir: string; configPath: string };
}> {
  const out = {} as Record<WorkerRole, { dir: string; configPath: string }>;
  for (const role of ["site", "admin"] as const) {
    const dir = path.join(input.deployDir, "release-config", role);
    await mkdir(dir, { recursive: true });
    const configPath = path.join(dir, "wrangler.jsonc");
    await writeWranglerConfig(
      configPath,
      releaseConfig(input[role].config, {
        role,
        worker: input[role].worker,
        manifest: input.manifest,
        configDir: dir,
      }),
      `Cloudhal ${role} Worker from the signed release v${input.manifest.version} (deploy --release)`,
    );
    out[role] = { dir, configPath };
  }
  return out;
}
