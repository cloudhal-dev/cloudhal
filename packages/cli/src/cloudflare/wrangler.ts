/**
 * Thin wrapper around the `wrangler` CLI (there is no supported JS deploy API). Credentials are
 * wrangler's own — `wrangler login` or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in the
 * environment; Cloudhal never reads or stores them.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export interface WranglerResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Structured records from WRANGLER_OUTPUT_FILE_PATH (ndjson). */
  records: Record<string, unknown>[];
}

export type WranglerRunner = (
  args: string[],
  options: { cwd: string; quiet?: boolean },
) => Promise<WranglerResult>;

export function resolveWranglerBin(projectDir: string): string {
  const require = createRequire(path.join(projectDir, "package.json"));
  return path.join(path.dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
}

/** The version of the project's installed wrangler (`package.json`), or undefined. */
export async function installedWranglerVersion(projectDir: string): Promise<string | undefined> {
  try {
    const require = createRequire(path.join(projectDir, "package.json"));
    const pkg = JSON.parse(await readFile(require.resolve("wrangler/package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** `a >= b` for `major.minor.patch` versions (pre-release suffixes ignored). */
export function versionAtLeast(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .split(/[.+-]/)
      .slice(0, 3)
      .map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return true;
}

/** Wrangler accepts the `analytics` (Analytics SQL) config key from this version (RFC-0006 §11). */
export const WRANGLER_FOR_ANALYTICS = "4.145.0";

/** Whether a failed deploy was refused for the account's cron-trigger limit (Free: 5). */
export function isCronLimitError(output: string): boolean {
  return /cron/i.test(output) && /(limit|exceed|maximum|too many|quota)/i.test(output);
}

export function wranglerRunner(
  projectDir: string,
  log: (line: string) => void = () => {},
): WranglerRunner {
  const bin = resolveWranglerBin(projectDir);
  return async (args, { cwd, quiet }) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-wrangler-"));
    const outputFile = path.join(dir, "output.ndjson");
    const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
        (resolve) => {
          const child = spawn(process.execPath, [bin, ...args], {
            cwd,
            env: { ...env, WRANGLER_OUTPUT_FILE_PATH: outputFile, WRANGLER_SEND_METRICS: "false" },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (c: Buffer) => {
            stdout += c.toString();
            if (!quiet) for (const l of c.toString().split("\n")) if (l.trim()) log(`  ${l}`);
          });
          child.stderr.on("data", (c: Buffer) => {
            stderr += c.toString();
          });
          child.once("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        },
      );
      let records: Record<string, unknown>[] = [];
      try {
        records = (await readFile(outputFile, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Record<string, unknown>);
      } catch {
        // no structured output
      }
      return { ...result, records };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

export class WranglerError extends Error {
  override readonly name = "WranglerError";
}

export async function must(
  run: WranglerRunner,
  args: string[],
  cwd: string,
): Promise<WranglerResult> {
  const r = await run(args, { cwd });
  if (r.code !== 0)
    throw new WranglerError(
      `wrangler ${args.join(" ")} failed:\n${(r.stderr || r.stdout).slice(-3000)}`,
    );
  return r;
}

/** URLs of a deployed Worker from wrangler's structured output. */
export function deployedUrls(records: Record<string, unknown>[]): string[] {
  return records
    .filter((r) => r.type === "deploy")
    .flatMap((r) => (Array.isArray(r.targets) ? (r.targets as string[]) : []))
    .map((t) => (t.startsWith("http") ? t : `https://${t}`));
}
