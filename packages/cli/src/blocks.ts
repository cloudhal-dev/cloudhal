/**
 * The theme's block types (RFC-0015 §6): `src/blocks.ts` in the project, pure data exported as
 * `blockTypes` (`defineBlockTypes([...])`). `cloudhal studio`, `mcp` and `deploy` load it so the
 * store validates, Studio offers and agents list the theme's types next to the built-ins.
 */
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type BlockRegistry,
  type BlockType,
  BlockTypeError,
  createBlockRegistry,
} from "@cloudhal/core-ts/blocks";

/** Where a project declares its block types. */
export const BLOCK_TYPES_FILE = path.join("src", "blocks.ts");

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

/**
 * The deployment's registry: the built-ins and the theme's types, checked (names, the props
 * subset, examples against their own schema; a built-in's name is refused). Throws with every
 * problem listed, naming the file.
 */
export async function loadBlockRegistry(projectDir: string): Promise<BlockRegistry> {
  const file = await blockTypesFile(projectDir);
  if (!file) return createBlockRegistry();
  const mod = (await import(pathToFileURL(file).href)) as { blockTypes?: unknown };
  if (!Array.isArray(mod.blockTypes))
    throw new Error(`${BLOCK_TYPES_FILE}: export \`blockTypes\` (defineBlockTypes([...]))`);
  try {
    return createBlockRegistry(mod.blockTypes as BlockType[]);
  } catch (e) {
    if (e instanceof BlockTypeError) throw new Error(`${BLOCK_TYPES_FILE}: ${e.issues.join("; ")}`);
    throw e;
  }
}
