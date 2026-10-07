/**
 * `cloudhal mcp` — the project's MCP server over stdio, for local clients (Claude Code, Cursor, …).
 * The caller is the local developer, so the default scopes are unrestricted; the approval gate
 * (publish / rollback / delete) still applies and is answered inside the client.
 */
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, type LoadedSkill, loadSkills, type Scope } from "@cloudhal/agent-runtime";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { serveCloudhalStdio } from "@cloudhal/mcp-server/stdio";
import { readProjectConfig } from "../config.ts";

export interface McpOptions {
  readonly projectDir: string;
  /** Scopes granted to the client. Default: everything (`*`). */
  readonly scopes?: readonly Scope[];
  /** Directory of skills to expose as resources. Default: `<project>/skills`, else the bundled official skills. */
  readonly skillsDir?: string;
  /** Base URL of a running `cloudhal dev`, for preview links. */
  readonly previewUrl?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Where the official skills live when running from the monorepo or an installed package. */
export async function resolveSkillsDir(projectDir: string): Promise<string | undefined> {
  const candidates = [
    path.join(projectDir, "skills"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../skills/official"),
  ];
  for (const dir of candidates) if (await exists(dir)) return dir;
  return undefined;
}

export async function mcp(options: McpOptions): Promise<{ stop(): Promise<void> }> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const skillsDir = options.skillsDir ?? (await resolveSkillsDir(options.projectDir));
  const skills: LoadedSkill[] = skillsDir ? await loadSkills(skillsDir) : [];
  const handle = serveCloudhalStdio({
    store: local.store,
    principal: {
      actor: { kind: "agent", id: "agent_localstdio", name: "local MCP client" },
      scopes: [...(options.scopes ?? ["*"])],
    },
    audit: new AuditLog(local.sql),
    skills,
    previewBaseUrl: options.previewUrl,
    onerror: (e) => process.stderr.write(`cloudhal mcp: ${e.message}\n`),
  });
  return {
    stop: async () => {
      await handle.close();
      await local.close();
    },
  };
}
