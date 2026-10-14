/**
 * The theme's block types (RFC-0015 §6): `src/blocks.ts` in the project, pure data exported as
 * `blockTypes` (type imports only, so it loads without the project's dependencies). `cloudhal studio`, `mcp` and `deploy` load it so the
 * store validates, Studio offers and agents list the theme's types next to the built-ins.
 */
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type BlockRegistry,
  type BlockType,
  BlockTypeError,
  checkPropsSchema,
  createBlockRegistry,
  type PropsSchema,
} from "@cloudhal/core-ts/blocks";

/** Where a project declares its block types. */
export const BLOCK_TYPES_FILE = path.join("src", "blocks.ts");
/** Where a theme declares its design settings (RFC-0017 §1). */
export const THEME_SETTINGS_FILE = path.join("src", "settings.ts");

const exists = (file: string) =>
  stat(file).then(
    (s) => s.isFile(),
    () => false,
  );

/** The theme's file, when the project has one. */
export async function blockTypesFile(projectDir: string): Promise<string | undefined> {
  const file = path.join(projectDir, BLOCK_TYPES_FILE);
  return (await exists(file)) ? file : undefined;
}

/** The theme's settings file, when the project has one. */
export async function themeSettingsFile(projectDir: string): Promise<string | undefined> {
  const file = path.join(projectDir, THEME_SETTINGS_FILE);
  return (await exists(file)) ? file : undefined;
}

/** A project file's exports, naming the file when it does not load. */
async function importData(file: string, name: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `${name}: ${(e as Error).message}. Keep the file data only, with type imports only (\`import type\`).`,
    );
  }
}

/**
 * The theme's design settings schema (`src/settings.ts` → `themeSettings`), checked against the
 * props subset; `undefined` when the theme declares none.
 */
export async function loadThemeSettings(projectDir: string): Promise<PropsSchema | undefined> {
  const file = await themeSettingsFile(projectDir);
  if (!file) return undefined;
  const { themeSettings } = await importData(file, THEME_SETTINGS_FILE);
  const issues = checkPropsSchema(themeSettings);
  if (issues.length)
    throw new Error(
      `${THEME_SETTINGS_FILE}: themeSettings ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`,
    );
  return themeSettings as PropsSchema;
}

/**
 * The deployment's registry: the built-ins and the theme's types, checked (names, the props
 * subset, examples against their own schema; a built-in's name is refused). Throws with every
 * problem listed, naming the file.
 */
export async function loadBlockRegistry(projectDir: string): Promise<BlockRegistry> {
  const file = await blockTypesFile(projectDir);
  if (!file) return createBlockRegistry();
  const mod = (await importData(file, BLOCK_TYPES_FILE)) as { blockTypes?: unknown };
  if (!Array.isArray(mod.blockTypes))
    throw new Error(`${BLOCK_TYPES_FILE}: export \`blockTypes\` (defineBlockTypes([...]))`);
  try {
    return createBlockRegistry(mod.blockTypes as BlockType[]);
  } catch (e) {
    if (e instanceof BlockTypeError) throw new Error(`${BLOCK_TYPES_FILE}: ${e.issues.join("; ")}`);
    throw e;
  }
}
