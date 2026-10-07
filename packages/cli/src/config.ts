import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** `cloudhal.json` at the project root. Kept tiny; everything else lives in the store. */
export interface ProjectConfig {
  readonly siteId: string;
  /** Relative to the project root. */
  readonly dataDir: string;
}

export const CONFIG_FILE = "cloudhal.json";

export async function readProjectConfig(projectDir: string): Promise<ProjectConfig> {
  const file = path.join(projectDir, CONFIG_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`${CONFIG_FILE} not found in ${projectDir}. Run \`cloudhal init\` first.`);
  }
  const cfg = JSON.parse(raw) as Partial<ProjectConfig>;
  if (typeof cfg.siteId !== "string") throw new Error(`${CONFIG_FILE}: missing siteId`);
  return { siteId: cfg.siteId, dataDir: cfg.dataDir ?? ".cloudhal" };
}

export async function writeProjectConfig(projectDir: string, cfg: ProjectConfig): Promise<void> {
  await writeFile(path.join(projectDir, CONFIG_FILE), `${JSON.stringify(cfg, null, 2)}\n`);
}
