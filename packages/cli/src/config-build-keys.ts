/**
 * Which `cloudhal.json` keys a build bakes in (RFC-0046 §11b, "Config build keys"). A release
 * bundle was built from this CLI version's starter with `cloudhal init`'s `cloudhal.json`, so
 * `deploy --release` refuses a project whose `build` keys differ from that, and any key this CLI
 * does not know. Every key, and every sub-key of the objects whose sub-keys differ in class, has an
 * explicit class; the types below are mapped over `ProjectConfig` (plus `media`, which only
 * `astro.config.mjs` reads), so a new key without a class fails `tsc`.
 *
 * - `deploy`: the key becomes a binding, a var or a resource; no build reads it.
 * - `runtime`: a build reads it, but the deployed Worker overrides it.
 * - `build`: a build reads it and nothing overrides it: it must equal the starter's value.
 * - `refused`: handled by the other refusals (`installation`, `sites`).
 *
 * Update this table, and its tests, with every key `cloudhal.json` gains.
 */
import type { AnalyticsConfig, CommentsConfig, ProjectConfig } from "./config.ts";

export type KeyClass = "deploy" | "runtime" | "build" | "refused";

/** `media.transform`'s class depends on the bundle: `runtime` when it reads a var, else `build`. */
export type FeatureClass = { readonly build: true; readonly runtimeWith: "mediaTransformVar" };

/** `cloudhal.json` `media`, read only by the starter's `astro.config.mjs` (RFC-0004 §7.5). */
export interface MediaConfig {
  readonly transform?: "cdn-cgi" | "none";
}

type Mixed = "analytics" | "comments";
type Classes<T> = { readonly [K in keyof Required<T>]-?: KeyClass | FeatureClass };

export type ConfigKeyTable = {
  readonly [K in Exclude<keyof Required<ProjectConfig>, Mixed>]-?: KeyClass;
} & {
  readonly analytics: Classes<AnalyticsConfig>;
  readonly comments: Classes<CommentsConfig>;
  readonly media: Classes<MediaConfig>;
};

export const CONFIG_KEY_CLASSES: ConfigKeyTable = {
  siteId: "runtime", // the Site Worker's CLOUDHAL_SITE_ID(S) override the baked id
  sites: "refused",
  installation: "refused",
  dataDir: "runtime", // the cloudflare target never reads it
  domains: "deploy",
  analytics: {
    enabled: "runtime", // the Site Worker reads its vars instead
    uniqueVisitors: "runtime",
    vitalsOneIn: "runtime",
    queryBudget: "deploy",
    rawRetentionDays: "deploy",
    rateLimit: "deploy",
    dev: "runtime", // only `cloudhal dev` reads it
  },
  comments: {
    available: "build",
    rateLimit: "deploy", // only commentsRateLimitDeployment
  },
  schedules: "deploy",
  mail: "deploy",
  ai: "deploy",
  render: "deploy",
  observability: "deploy",
  placement: "deploy",
  search: "deploy", // only searchDeploymentOf
  media: {
    transform: { build: true, runtimeWith: "mediaTransformVar" },
  },
};

/**
 * The value each `build` key has in the project `cloudhal init` creates, which the bundle was
 * built from, and the value a missing key means. A project may leave it out or set either.
 */
export const STARTER_BUILD_VALUES: Readonly<Record<string, readonly unknown[]>> = {
  "comments.available": [undefined, true],
  "media.transform": [undefined, "none"],
};

export interface BuildKeyProblem {
  readonly key: string;
  readonly problem: "unknown" | "build";
  readonly value?: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function classOf(
  c: KeyClass | FeatureClass,
  features: Readonly<Record<string, boolean>>,
): KeyClass {
  if (typeof c === "string") return c;
  return features[c.runtimeWith] === true ? "runtime" : "build";
}

/**
 * The keys of a raw `cloudhal.json` the bundle cannot honour: unknown keys (and unknown sub-keys
 * of `analytics`, `comments` and `media`), and `build` keys set to anything but the starter's.
 */
export function buildKeyProblems(
  raw: Readonly<Record<string, unknown>>,
  features: Readonly<Record<string, boolean>>,
): BuildKeyProblem[] {
  const out: BuildKeyProblem[] = [];
  const check = (key: string, c: KeyClass | FeatureClass, value: unknown) => {
    if (classOf(c, features) !== "build") return;
    const allowed = STARTER_BUILD_VALUES[key] ?? [undefined];
    if (!allowed.includes(value)) out.push({ key, problem: "build", value });
  };
  const table = CONFIG_KEY_CLASSES as unknown as Record<
    string,
    KeyClass | Record<string, KeyClass | FeatureClass>
  >;
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(table, key)) {
      out.push({ key, problem: "unknown" });
      continue;
    }
    const c = table[key] as KeyClass | Record<string, KeyClass | FeatureClass>;
    if (typeof c === "string") {
      check(key, c, value);
      continue;
    }
    // A mixed object: each sub-key on its own; a value of another shape leaves them all unset.
    const sub = isObject(value) ? value : {};
    for (const k of Object.keys(sub))
      if (!Object.hasOwn(c, k)) out.push({ key: `${key}.${k}`, problem: "unknown" });
    for (const [k, kc] of Object.entries(c)) check(`${key}.${k}`, kc, sub[k]);
  }
  return out;
}
