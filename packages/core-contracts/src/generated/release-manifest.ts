/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "CloudhalVersion".
 */
export type CloudhalVersion = string;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "MigrationName".
 */
export type MigrationName = string;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "BindingName".
 */
export type BindingName = string;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "Sha256Hex".
 */
export type Sha256Hex = string;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "SecretName".
 */
export type SecretName =
  | "BETTER_AUTH_SECRET"
  | "MCP_STATE_KEY"
  | "CLOUDHAL_PREVIEW_SECRET"
  | "CLOUDHAL_PURGE_TOKEN"
  | "CLOUDHAL_DEPLOY_TOKEN"
  | "CLOUDHAL_SETUP_TOKEN"
  | "CLOUDHAL_COMMENTS_KEY";
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "ScopeId".
 */
export type ScopeId = string;
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "Capability".
 */
export type Capability = "account" | "workers" | "d1" | "r2" | "analytics" | "domains";
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "SiteId".
 */
export type SiteId = string;

/**
 * cloudhal.release-manifest@1 (RFC-0046): the manifest of one Cloudhal release bundle, published as the release asset manifest.json next to the gzip tarball cloudhal-release-<version>.tar.gz. A project release is signed through release-statement.json, which pins this file's SHA-256 and size (signing.signature = release-statement.sig); the legacy form manifest.sig, a raw 64-byte Ed25519 signature over these exact bytes, is for development keys only. It describes every built Worker module and static asset by size and SHA-256, the binding templates, feature levels, migration range and rollback facts a remote deployer needs to install, update or refuse a version without running a build. Portable on purpose: it references common only for SchemaVersion and Timestamp; every other definition is local.
 */
export interface ReleaseManifest {
  schemaVersion: SchemaVersion;
  format: "cloudhal.release-manifest@1";
  version: CloudhalVersion;
  channel: "stable" | "next";
  securityRelease: boolean;
  commit: string;
  createdAt: Timestamp;
  contracts: {
    schemaVersion: 1;
  };
  levels: {
    schedules: number;
    gates: number;
  };
  migrations: {
    first: MigrationName;
    last: MigrationName;
    count: number;
    /**
     * @minItems 1
     */
    names: [MigrationName, ...MigrationName[]];
    compatibleWithPrevious: boolean;
  };
  durableObjects: {
    bindings: {
      name: BindingName;
      className: string;
      migration: string;
    }[];
    lifecycleChange: boolean;
  };
  runtime: {
    compatibilityDate: string;
    compatibilityFlags: string[];
  };
  toolchain: {
    [k: string]: string | undefined;
  };
  theme: {
    name: string;
    version: string;
    blockTypes: string[];
    settingsSha256: Sha256Hex;
    designSha256: Sha256Hex;
  };
  skills: {
    name: string;
    sha256: Sha256Hex;
  }[];
  workers: {
    site: WorkerArtifact;
    admin: WorkerArtifact;
  };
  bindingTemplates: {
    site: BindingTemplate;
    admin: BindingTemplate;
  };
  requiredScopes: ScopeId[];
  optionalScopes: ScopeId[];
  requiredCapabilities: Capability[];
  optionalCapabilities: Capability[];
  starter:
    | {
        kind: "admin-api";
      }
    | {
        kind: "bundle";
        path: string;
        bytes: number;
        sha256: Sha256Hex;
        siteId: SiteId;
      };
  features: {
    adminSitesAcceptsSiteId: boolean;
    healthReportsVersion: boolean;
    mediaTransformVar: boolean;
    [k: string]: boolean | undefined;
  };
  planVersion: number;
  signing: {
    keyId: string;
    algorithm: "Ed25519";
    signature: "manifest.sig" | "release-statement.sig";
  };
}
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "WorkerArtifact".
 */
export interface WorkerArtifact {
  mainModule: string;
  /**
   * @minItems 1
   */
  modules: [
    {
      path: string;
      type: "esm" | "cjs" | "wasm" | "text" | "data";
      bytes: number;
      sha256: Sha256Hex;
    },
    ...{
      path: string;
      type: "esm" | "cjs" | "wasm" | "text" | "data";
      bytes: number;
      sha256: Sha256Hex;
    }[],
  ];
  assets: {
    count: number;
    bytes: number;
    /**
     * @maxItems 20000
     */
    files: {
      path: string;
      bytes: number;
      sha256: Sha256Hex;
      assetHash: string;
      contentType: string;
    }[];
    headers: string;
    config?: {
      not_found_handling?: "none" | "404-page" | "single-page-application";
      run_worker_first?: string[];
    };
  };
  bindingTemplate?: "site" | "admin";
}
/**
 * This interface was referenced by `ReleaseManifest`'s JSON-Schema
 * via the `definition` "BindingTemplate".
 */
export interface BindingTemplate {
  bindings: {
    name: BindingName;
    type:
      | "d1"
      | "r2_bucket"
      | "assets"
      | "service"
      | "durable_object_namespace"
      | "analytics_engine"
      | "analytics_sql"
      | "ratelimit"
      | "ai_search"
      | "send_email"
      | "ai"
      | "browser";
    required: boolean;
    aliases?: BindingName[];
  }[];
  vars: BindingName[];
  secrets: SecretName[];
  cache?: boolean;
  cron?: string;
}
