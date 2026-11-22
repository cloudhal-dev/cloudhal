/**
 * RFC-0047 §1–3: the workerd config (Cap'n Proto text) that serves a release bundle's site and
 * admin Workers as one instance of a cluster on an S3 store. Pure: the manifest, where the bundle
 * and the config live, and the settings in; the config's text out.
 *
 * Invariants (RFC-0047 §2): Durable Object `uniqueKey`s are constants derived from nothing that
 * changes (a changed key starts that namespace empty); every instance of an installation gets the
 * same services; secrets reach the Workers only as `fromEnvironment` bindings; no local bucket store.
 */
import path from "node:path";
import type { ReleaseManifest } from "@cloudhal/release-verify";
import { FRONT_WORKER_SOURCE } from "./front-worker.ts";
import type { SelfhostSettings } from "./settings.ts";

/** The compatibility date of workerd's own bundled Workers (D1, R2, cron). */
const BUILTIN_DATE = "2026-11-01";

/** Stable `uniqueKey`s (RFC-0047 §2, invariant 1). */
export const UNIQUE_KEYS = { d1: "cloudhal-d1", cron: "cloudhal-cron" } as const;

/** `SchedulerClock` → `cloudhal-scheduler-clock`: one key per class, forever. */
export function durableObjectKey(className: string): string {
  if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(className))
    throw new Error(`unexpected Durable Object class name ${className}`);
  return `cloudhal-${className.replace(/[A-Z]/g, (c, i: number) => (i ? "-" : "") + c.toLowerCase())}`;
}

const q = (s: string) => JSON.stringify(s);
const list = (items: readonly string[], indent: string) =>
  items.length === 0 ? "[]" : `[\n${items.map((i) => `${indent}  ${i}`).join(",\n")},\n${indent}]`;

const MODULE_FIELD: Readonly<Record<string, string>> = {
  esm: "esModule",
  cjs: "commonJsModule",
  wasm: "wasm",
  text: "text",
  data: "data",
};

export interface ConfigInput {
  readonly manifest: ReleaseManifest;
  /** The extracted bundle (`<dir>/site/…`, `<dir>/admin/…`). */
  readonly bundleDir: string;
  /** Where the config file is written: `embed` paths are relative to it. */
  readonly configDir: string;
  readonly settings: SelfhostSettings;
}

function modules(input: ConfigInput, role: "site" | "admin"): string[] {
  const w = input.manifest.workers[role];
  const main = w.modules.find((m) => m.path === w.mainModule);
  if (!main)
    throw new Error(`the ${role} Worker's main module ${w.mainModule} is not in the bundle`);
  const ordered = [main, ...w.modules.filter((m) => m !== main)];
  return ordered.map((m) => {
    const field = MODULE_FIELD[m.type];
    if (!field) throw new Error(`the ${role} Worker has a module of unknown type ${m.type}`);
    const file = path.relative(
      input.configDir,
      path.join(input.bundleDir, role, "modules", m.path),
    );
    return `(name = ${q(m.path)}, ${field} = embed ${q(file)})`;
  });
}

const env = (name: string) => `(name = ${q(name)}, fromEnvironment = ${q(name)})`;
const text = (name: string, value: string) => `(name = ${q(name)}, text = ${q(value)})`;
const D1 = `(name = "DB", wrapped = (moduleName = "cloudflare-internal:d1-api", innerBindings = [(name = "fetcher", service = (name = "d1", props = (json = ${q(JSON.stringify({ database: "cloudhal" }))})))]))`;
const R2 = `(name = "BLOBS", r2Bucket = (name = "r2", props = (json = ${q(JSON.stringify({ bucket: "media" }))})))`;

function builtins(cron: string): string[] {
  return [
    `(name = "do-storage", disk = (path = ${q("{DATA}/do")}, writable = true))`,
    `(name = "blobs", bucket = (path = "blobs"))`,
    `(name = "r2", worker = (compatibilityDate = ${q(BUILTIN_DATE)}, modules = [(name = "r2", bundled = "/workerd/r2.js")], bindings = [(name = "BLOBS", service = "blobs")]))`,
    `(name = "d1", worker = (compatibilityDate = ${q(BUILTIN_DATE)}, modules = [(name = "d1", bundled = "/workerd/d1.js")], durableObjectNamespaces = [(className = "D1Database", uniqueKey = ${q(UNIQUE_KEYS.d1)}, enableSql = true)], durableObjectStorage = (localDisk = "do-storage"), bindings = [(name = "DATABASE", durableObjectNamespace = "D1Database")]))`,
    `(name = "cron", worker = (compatibilityDate = ${q(BUILTIN_DATE)}, compatibilityFlags = ["service_binding_extra_handlers"], modules = [(name = "cron", bundled = "/workerd/cron.js")], durableObjectNamespaces = [(className = "Schedule", uniqueKey = ${q(UNIQUE_KEYS.cron)}, enableSql = true)], durableObjectStorage = (localDisk = "do-storage"), bindings = [(name = "SCHEDULE", durableObjectNamespace = "Schedule"), (name = "CRONS", json = ${q(JSON.stringify({ admin: [cron] }))}), (name = "admin", service = "admin")]))`,
  ];
}

function worker(
  input: ConfigInput,
  role: "site" | "admin",
  extra: { bindings: string[]; objects?: string[] },
): string {
  const { compatibilityDate, compatibilityFlags } = input.manifest.runtime;
  const secrets = input.manifest.bindingTemplates[role].secrets.map(env);
  const parts = [
    `compatibilityDate = ${q(compatibilityDate)}`,
    `compatibilityFlags = [${compatibilityFlags.map(q).join(", ")}]`,
    `modules = ${list(modules(input, role), "      ")}`,
    ...(extra.objects
      ? [
          `durableObjectNamespaces = ${list(extra.objects, "      ")}`,
          `durableObjectStorage = (localDisk = "do-storage")`,
        ]
      : []),
    `bindings = ${list([...extra.bindings, ...secrets], "      ")}`,
  ];
  return `(name = ${q(role)}, worker = (\n      ${parts.join(",\n      ")},\n    ))`;
}

function assets(input: ConfigInput, role: "site" | "admin"): string {
  // workerd reads no `_headers` file: its text goes into the config, as wrangler sends it.
  const a = input.manifest.workers[role].assets;
  const config = { ...(a.config ?? {}), ...(a.headers ? { headers: a.headers } : {}) };
  const dir = path.join(input.bundleDir, role, "assets");
  return `(name = ${q(`${role}-assets`)}, assets = (path = ${q(dir)}, config = ${q(JSON.stringify(config))}, userWorker = ${q(role)}))`;
}

/**
 * The sockets' HTTP options: behind a proxy, the scheme comes from its `X-Forwarded-Proto`. The
 * client's address is the front Worker's job (front-worker.ts, RFC-0047 §8).
 */
function http(s: SelfhostSettings): string {
  return s.behindProxy ? `(forwardedProtoHeader = "X-Forwarded-Proto")` : "()";
}

/** The Worker in front of `next`, which sets or removes `CF-Connecting-IP`. */
function front(role: "site" | "admin", s: SelfhostSettings): string {
  return `(name = ${q(`${role}-front`)}, worker = (compatibilityDate = ${q(BUILTIN_DATE)}, modules = [(name = "front.js", esModule = ${q(FRONT_WORKER_SOURCE)})], bindings = [(name = "NEXT", service = ${q(`${role}-assets`)})${s.behindProxy ? `, (name = "TRUST_PROXY", json = "true")` : ""}]))`;
}

/** The config's text. `{DATA}` in disk paths stands for `settings.dataDir`. */
export function workerdConfig(input: ConfigInput): string {
  const { manifest: m, settings: s } = input;
  const objects = m.durableObjects.bindings.map(
    (b) =>
      `(className = ${q(b.className)}, uniqueKey = ${q(durableObjectKey(b.className))}, enableSql = true)`,
  );
  const siteId = text("CLOUDHAL_SITE_ID", s.siteId);
  const admin = worker(input, "admin", {
    objects,
    bindings: [
      D1,
      R2,
      `(name = "SITE", service = "site-assets")`,
      `(name = "ASSETS", service = (name = "admin-assets", entrypoint = "AssetWorker"))`,
      ...m.durableObjects.bindings.map(
        (b) => `(name = ${q(b.name)}, durableObjectNamespace = ${q(b.className)})`,
      ),
      text("CLOUDHAL_SCHEDULER", "cron"),
      siteId,
      ...Object.entries(s.adminVars).map(([k, v]) => text(k, v)),
    ],
  });
  const site = worker(input, "site", {
    bindings: [
      D1,
      R2,
      `(name = "ASSETS", service = (name = "site-assets", entrypoint = "AssetWorker"))`,
      siteId,
    ],
  });
  const cron = m.bindingTemplates.admin.cron ?? "* * * * *";
  const services = [
    ...builtins(cron),
    site,
    assets(input, "site"),
    admin,
    assets(input, "admin"),
    front("site", s),
    front("admin", s),
    ...(s.otlp ? [`(name = "otlp", external = (address = ${q(s.otlp)}, http = ()))`] : []),
  ].map((x) => x.replaceAll("{DATA}", s.dataDir));
  const bucket = `s3://${s.s3.bucket}/${s.s3.prefix}cluster`;
  return `# Generated by \`cloudhal selfhost\` (RFC-0047) for Cloudhal ${m.version}. Do not edit.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  cluster = (
    bucket = ${q(bucket)},
    bucketOptions = [${q(`aws_endpoint=${s.s3.endpoint}`)}, ${q(`aws_region=${s.s3.region}`)}],
    address = ${q(s.cluster.address)},
    advertise = ${q(s.cluster.advertise)},
    key = ${q(s.cluster.key)},
  ),${s.otlp ? `\n  tracing = (otlp = "otlp"),` : ""}
  services = [
    ${services.join(",\n    ")},
  ],
  sockets = [
    (name = "studio", address = ${q(`*:${s.ports.studio}`)}, http = ${http(s)}, service = "admin-front"),
    (name = "site", address = ${q(`*:${s.ports.site}`)}, http = ${http(s)}, service = "site-front"),
  ],
);
`;
}
