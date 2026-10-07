/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * YAML frontmatter of a SKILL.md, exactly the six fields of the Agent Skills specification (agentskills.io). Cloudhal-specific data goes under `metadata` as flat string keys prefixed `cloudhal.` (schemaVersion, requiresCapabilities, scopes, approval); nested vendor blocks are rejected by hosted skill uploaders.
 */
export interface SkillManifest {
  /**
   * Lower-case kebab-case; must equal the skill directory name.
   */
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Metadata;
  /**
   * Space-separated tool names the skill may call (experimental in the spec).
   */
  "allowed-tools"?: string;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `SkillManifest`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
