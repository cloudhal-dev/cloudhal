import path from "node:path";
import { readProjectConfig } from "../config.ts";
import { resolveBuildSnapshot } from "./snapshot.ts";

export interface DevOptions {
  readonly projectDir: string;
  readonly port?: number;
  readonly host?: boolean;
}

/** Starts the Astro dev server for the project (live source, drafts visible). Returns a stop function. */
export async function dev(
  options: DevOptions,
): Promise<{ stop(): Promise<void>; url: string | undefined }> {
  await readProjectConfig(options.projectDir); // fail early with a clear message
  process.env.CLOUDHAL_SOURCE = "live";
  // Note: Astro skips its dev middleware entirely when `process.env.VITEST` is set, so a dev
  // server cannot be started inside a Vitest worker; tests spawn the CLI as a child process.
  const astro = await import("astro");
  const server = await astro.dev({
    root: path.resolve(options.projectDir),
    mode: "development",
    logLevel: "info",
    server: {
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.host ? { host: true } : {}),
    },
  });
  const addr = server.address;
  const host = !addr
    ? undefined
    : addr.family === "IPv6"
      ? addr.address === "::" || addr.address === "::1"
        ? "localhost"
        : `[${addr.address}]`
      : addr.address;
  const url = addr && host ? `http://${host}:${addr.port}/` : undefined;
  return { stop: () => server.stop(), url };
}

export interface BuildOptions {
  readonly projectDir: string;
  /** Render this snapshot instead of the published/latest one. */
  readonly snapshotId?: string;
}

/** Static build from a snapshot: published → latest → freshly created. */
export async function build(
  options: BuildOptions,
): Promise<{ snapshotId: string; outDir: string }> {
  const snapshotId = options.snapshotId ?? (await resolveBuildSnapshot(options.projectDir)).id;
  process.env.CLOUDHAL_SOURCE = `snapshot:${snapshotId}`;
  const astro = await import("astro");
  const root = path.resolve(options.projectDir);
  await astro.build({ root, logLevel: "info" });
  return { snapshotId, outDir: path.join(root, "dist") };
}
