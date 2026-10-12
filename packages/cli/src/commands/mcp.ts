/**
 * `cloudhal mcp` — the project's MCP server over stdio, for local clients (Claude Code, Cursor, …).
 * The caller is the local developer, so the default scopes are unrestricted; the approval gate
 * (publish / rollback / delete) still applies and is answered inside the client.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import {
  type AgentMode,
  AuditLog,
  DEFAULT_AGENT_MODE,
  type LoadedSkill,
  loadSkills,
  type Scope,
} from "@cloudhal/agent-runtime";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { nodeTransport } from "@cloudhal/core-ts/media-node";
import { serveCloudhalStdio } from "@cloudhal/mcp-server/stdio";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { assetDir } from "../assets.ts";
import { readProjectConfig } from "../config.ts";
import { localAnalytics } from "./analytics.ts";
import { localComments } from "./comments-local.ts";
import { startLocalScheduler } from "./scheduler-local.ts";

export interface McpOptions {
  readonly projectDir: string;
  /** Scopes granted to the client. Default: everything (`*`). */
  readonly scopes?: readonly Scope[];
  /** Directory of skills to expose as resources. Default: `<project>/skills`, else the bundled official skills. */
  readonly skillsDir?: string;
  /** Base URL of a running `cloudhal dev`, for preview links. */
  readonly previewUrl?: string;
  /** Agent mode (ADR-0015). Default `edits`; `bypass` is allowed here because this is local. */
  readonly mode?: AgentMode;
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
  const own = path.join(projectDir, "skills");
  if (await exists(own)) return own;
  return assetDir("skills");
}

export async function mcp(options: McpOptions): Promise<{ stop(): Promise<void> }> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const skillsDir = options.skillsDir ?? (await resolveSkillsDir(options.projectDir));
  const skills: LoadedSkill[] = skillsDir ? await loadSkills(skillsDir) : [];
  // The comment tools read and moderate the project's comments (RFC-0007 §11). The process owns
  // the store while a client runs it, so it also runs the scheduler's Node ticker (RFC-0008 §8.4):
  // releases, automations and the hourly comments job behind its watermark.
  const comments = await localComments(local.sql, local.dataDir);
  const ticker = startLocalScheduler({
    sql: local.sql,
    blobs: local.blobs,
    graph: local.store,
    log: (l) => process.stderr.write(`cloudhal mcp: ${l}\n`),
  });
  const handle = serveCloudhalStdio({
    store: local.store,
    principal: {
      actor: { kind: "agent", id: "agent_localstdio", name: "local MCP client" },
      scopes: [...(options.scopes ?? ["*"])],
      mode: options.mode ?? DEFAULT_AGENT_MODE,
      local: true,
    },
    audit: new AuditLog(local.sql),
    skills,
    previewBaseUrl: options.previewUrl,
    // fetch_asset_url resolves, checks and pins every address on Node (RFC-0004 §5.7).
    media: { fetchTransport: nodeTransport() },
    // The analytics tools read the project's SQLite (RFC-0006 L3).
    analytics: localAnalytics(local.sql, cfg),
    comments,
    // RFC-0008 §12: the schedule tools on the project's SQLite, poking this process's ticker.
    schedules: {
      store: new SqlScheduleStore(local.sql),
      scheduler: ticker,
      maxNewBodies: Number.POSITIVE_INFINITY,
    },
    onerror: (e) => process.stderr.write(`cloudhal mcp: ${e.message}\n`),
  });
  return {
    stop: async () => {
      ticker.stop();
      await handle.close();
      await local.close();
    },
  };
}
