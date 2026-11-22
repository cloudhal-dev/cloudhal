/**
 * RFC-0047 §4: the self-host image's settings, read from the environment. Every secret may come
 * from `<NAME>_FILE` instead (Docker and Kubernetes secrets); the file's content, without a final
 * newline, becomes `<NAME>` for workerd, which hands it to the Workers through `fromEnvironment`
 * bindings. Nothing secret goes into the generated config except the cluster key, which workerd
 * reads only from there.
 */
import { readFileSync } from "node:fs";
import os from "node:os";

/** The manifest's secrets (RFC-0046 `bindingTemplates.*.secrets`) the image requires. */
export const REQUIRED_SECRETS = [
  "BETTER_AUTH_SECRET",
  "MCP_STATE_KEY",
  "CLOUDHAL_PREVIEW_SECRET",
  "CLOUDHAL_PURGE_TOKEN",
  "CLOUDHAL_DEPLOY_TOKEN",
  "CLOUDHAL_SETUP_TOKEN",
  "CLOUDHAL_COMMENTS_KEY",
] as const;

/** Read through `_FILE` too, but not handed to the Workers (workerd's own S3 client reads them). */
const STORE_SECRETS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"] as const;

export interface SelfhostSettings {
  readonly s3: {
    readonly endpoint: string;
    readonly bucket: string;
    /** Ends with `/` when not empty. */
    readonly prefix: string;
    readonly region: string;
  };
  readonly cluster: {
    readonly key: string;
    /** Where this instance listens for its peers. */
    readonly address: string;
    /** Where its peers reach it (its lease record). */
    readonly advertise: string;
  };
  /** The one site this installation serves (RFC-0047 decisions 1 and 2). */
  readonly siteId: string;
  readonly siteName: string;
  readonly behindProxy: boolean;
  readonly baseUrl: string | undefined;
  /** Writable: Durable Object SQLite files, the marker of a v2 volume. */
  readonly dataDir: string;
  readonly ports: { readonly studio: number; readonly site: number };
  /** `host:port` of an OTLP/HTTP collector, from `OTEL_EXPORTER_OTLP_ENDPOINT`. */
  readonly otlp: string | undefined;
  /** Optional admin vars passed through when set (`CLOUDHAL_AUTOMATIONS`, …). */
  readonly adminVars: Readonly<Record<string, string>>;
}

export type Env = Readonly<Record<string, string | undefined>>;

const SITE_ID = /^site_[A-Za-z0-9]{6,32}$/;
const PASSED_VARS = ["CLOUDHAL_AUTOMATIONS", "CLOUDHAL_TICK_BUDGET", "CLOUDHAL_COMMENTS_AVAILABLE"];

/**
 * `env` with every `<NAME>_FILE` of a secret resolved into `<NAME>`. A name set both ways is an
 * error, as is an unreadable file; `read` is injected by tests.
 */
export function resolveSecretFiles(
  env: Env,
  read: (file: string) => string = (f) => readFileSync(f, "utf8"),
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env };
  for (const name of [...REQUIRED_SECRETS, ...STORE_SECRETS, "CLOUDHAL_CLUSTER_KEY"]) {
    const file = env[`${name}_FILE`];
    if (file === undefined || file === "") continue;
    if (env[name] !== undefined && env[name] !== "")
      throw new Error(`${name} and ${name}_FILE are both set: keep one`);
    let value: string;
    try {
      value = read(file);
    } catch (e) {
      throw new Error(`${name}_FILE: cannot read ${file} (${(e as Error).message})`);
    }
    out[name] = value.endsWith("\n") ? value.slice(0, -1) : value;
    delete out[`${name}_FILE`];
  }
  return out;
}

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());

function port(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name}: a port, 1–65535`);
  return n;
}

/** `https://host:port/path` or `host:port` → `host:port` (the OTLP collector). */
function hostPort(value: string): string {
  const url = /^[a-z]+:\/\//i.test(value) ? new URL(value) : new URL(`http://${value}`);
  const p = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname}:${p}`;
}

/** Every missing or malformed setting, so the operator fixes them in one go. */
function problems(env: Env): string[] {
  const out: string[] = [];
  for (const name of REQUIRED_SECRETS)
    if (!env[name]) out.push(`${name} (or ${name}_FILE) is not set`);
  const key = env.CLOUDHAL_CLUSTER_KEY ?? "";
  if (key.length < 32)
    out.push("CLOUDHAL_CLUSTER_KEY: at least 32 characters (openssl rand -hex 32)");
  if (!env.CLOUDHAL_S3_ENDPOINT) out.push("CLOUDHAL_S3_ENDPOINT is not set (the S3 store's URL)");
  if (!env.CLOUDHAL_S3_BUCKET) out.push("CLOUDHAL_S3_BUCKET is not set");
  if (!SITE_ID.test(env.CLOUDHAL_SITE_ID ?? ""))
    out.push(
      "CLOUDHAL_SITE_ID: site_ followed by 6 to 32 letters or digits (cloudhal selfhost secrets)",
    );
  if (truthy(env.CLOUDHAL_BEHIND_PROXY) && !env.CLOUDHAL_BASE_URL)
    out.push("CLOUDHAL_BEHIND_PROXY=1 needs CLOUDHAL_BASE_URL, the origin browsers open Studio at");
  return out;
}

/** The settings, or one error listing every problem. `env` has its `_FILE`s resolved. */
export function readSettings(env: Env): SelfhostSettings {
  const found = problems(env);
  if (found.length > 0)
    throw new Error(`the self-host settings are incomplete:\n  - ${found.join("\n  - ")}`);
  const prefix = (env.CLOUDHAL_S3_PREFIX ?? "").replace(/^\/+/, "");
  const clusterPort = port(env, "CLOUDHAL_CLUSTER_PORT", 7000);
  const adminVars: Record<string, string> = {};
  for (const name of PASSED_VARS) if (env[name]) adminVars[name] = env[name] as string;
  return {
    s3: {
      endpoint: env.CLOUDHAL_S3_ENDPOINT as string,
      bucket: env.CLOUDHAL_S3_BUCKET as string,
      prefix: prefix === "" || prefix.endsWith("/") ? prefix : `${prefix}/`,
      region: env.CLOUDHAL_S3_REGION || "us-east-1",
    },
    cluster: {
      key: env.CLOUDHAL_CLUSTER_KEY as string,
      address: `0.0.0.0:${clusterPort}`,
      advertise: env.CLOUDHAL_CLUSTER_ADVERTISE || `${os.hostname()}:${clusterPort}`,
    },
    siteId: env.CLOUDHAL_SITE_ID as string,
    siteName: env.CLOUDHAL_SITE_NAME || "My site",
    behindProxy: truthy(env.CLOUDHAL_BEHIND_PROXY),
    baseUrl: env.CLOUDHAL_BASE_URL || undefined,
    dataDir: env.CLOUDHAL_DATA_DIR || "/data",
    ports: {
      studio: port(env, "CLOUDHAL_PORT", 8787),
      site: port(env, "CLOUDHAL_SITE_PORT", 8788),
    },
    otlp: env.OTEL_EXPORTER_OTLP_ENDPOINT ? hostPort(env.OTEL_EXPORTER_OTLP_ENDPOINT) : undefined,
    adminVars,
  };
}
