/**
 * In-editor AI settings and daily usage per site (RFC-0016 §2, §4), on the deployment's SQL
 * (`0020_ai`). A missing settings row means AI is off. The daily cap is enforced by one atomic
 * upsert: a command counts only when the day's count was still under the cap.
 */
import type { SqlDriver } from "@cloudhal/storage";

export const DEFAULT_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
export const DEFAULT_DAILY_LIMIT = 100;
export const MAX_DAILY_LIMIT = 10_000;

export interface AiSettings {
  enabled: boolean;
  model: string;
  gateway?: string;
  dailyLimit: number;
  /** 0 until first saved. */
  rev: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AiDayUsage {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Workers AI ids (`@cf/author/model`, `@hf/…`) or a gateway provider's `provider/model`. */
const WORKERS_AI_MODEL = /^@(cf|hf)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/;
const PROVIDER_MODEL = /^[a-z0-9][a-z0-9-]{0,40}\/[A-Za-z0-9._:/-]{1,120}$/;
const GATEWAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class AiSettingsError extends Error {
  readonly code: "invalid" | "conflict";
  constructor(code: AiSettingsError["code"], message: string) {
    super(message);
    this.name = "AiSettingsError";
    this.code = code;
  }
}

/** Is `model` a Workers AI model (as opposed to a provider reached through a gateway)? */
export const isWorkersAiModel = (model: string) => WORKERS_AI_MODEL.test(model);

/** Checks settings a person sent; returns the values to store. */
export function checkAiSettings(input: {
  enabled?: unknown;
  model?: unknown;
  gateway?: unknown;
  dailyLimit?: unknown;
}): Pick<AiSettings, "enabled" | "model" | "dailyLimit"> & { gateway?: string } {
  if (typeof input.enabled !== "boolean")
    throw new AiSettingsError("invalid", "enabled: true or false");
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const gateway =
    input.gateway === undefined || input.gateway === null || input.gateway === ""
      ? undefined
      : typeof input.gateway === "string" && GATEWAY_ID.test(input.gateway.trim())
        ? input.gateway.trim()
        : (() => {
            throw new AiSettingsError(
              "invalid",
              "gateway: an AI Gateway id (lowercase letters, digits and hyphens)",
            );
          })();
  if (!isWorkersAiModel(model)) {
    if (!PROVIDER_MODEL.test(model))
      throw new AiSettingsError(
        "invalid",
        "model: a Workers AI model id such as @cf/zai-org/glm-4.7-flash, or provider/model with a gateway",
      );
    if (!gateway)
      throw new AiSettingsError(
        "invalid",
        "model: models from other providers run through an AI Gateway; set gateway first",
      );
  }
  const limit = input.dailyLimit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > MAX_DAILY_LIMIT)
    throw new AiSettingsError("invalid", `dailyLimit: a whole number from 0 to ${MAX_DAILY_LIMIT}`);
  return { enabled: input.enabled, model, ...(gateway ? { gateway } : {}), dailyLimit: limit };
}

interface SettingsRow extends Record<string, unknown> {
  enabled: number;
  model: string;
  gateway: string | null;
  daily_limit: number;
  rev: number;
  updated_at: string;
  updated_by: string | null;
}

interface UsageRow extends Record<string, unknown> {
  day: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

export class AiStore {
  readonly #sql: SqlDriver;
  constructor(sql: SqlDriver) {
    this.#sql = sql;
  }

  /** The stored settings, or the defaults (`rev: 0`, AI off). */
  async settings(siteId: string): Promise<AiSettings> {
    const row = await this.#sql.get<SettingsRow>("SELECT * FROM ai_settings WHERE site_id = ?", [
      siteId,
    ]);
    if (!row)
      return { enabled: false, model: DEFAULT_AI_MODEL, dailyLimit: DEFAULT_DAILY_LIMIT, rev: 0 };
    return {
      enabled: row.enabled === 1,
      model: row.model,
      ...(row.gateway ? { gateway: row.gateway } : {}),
      dailyLimit: row.daily_limit,
      rev: row.rev,
      updatedAt: row.updated_at,
      ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    };
  }

  /** Saves settings read at `rev` (0: never saved); a newer save in between is a conflict. */
  async save(
    siteId: string,
    next: Pick<AiSettings, "enabled" | "model" | "dailyLimit"> & { gateway?: string | undefined },
    rev: number,
    by: string,
    at: string,
  ): Promise<AiSettings> {
    const values = [
      next.enabled ? 1 : 0,
      next.model,
      next.gateway ?? null,
      next.dailyLimit,
      at,
      by,
    ] as const;
    const result =
      rev === 0
        ? await this.#sql.run(
            `INSERT INTO ai_settings (site_id, enabled, model, gateway, daily_limit, rev, updated_at, updated_by)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(site_id) DO NOTHING`,
            [siteId, ...values],
          )
        : await this.#sql.run(
            `UPDATE ai_settings SET enabled = ?, model = ?, gateway = ?, daily_limit = ?, rev = rev + 1,
             updated_at = ?, updated_by = ? WHERE site_id = ? AND rev = ?`,
            [...values, siteId, rev],
          );
    if (result.changes === 0)
      throw new AiSettingsError("conflict", "the AI settings changed somewhere else; reload");
    return this.settings(siteId);
  }

  /** Today's (or `day`'s) usage. */
  async usage(siteId: string, day: string): Promise<AiDayUsage> {
    const row = await this.#sql.get<UsageRow>(
      "SELECT * FROM ai_usage WHERE site_id = ? AND day = ?",
      [siteId, day],
    );
    return {
      day,
      requests: row?.requests ?? 0,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
    };
  }

  /** Counts one command if the day is still under `limit`; false when the cap is reached. */
  async reserve(siteId: string, day: string, limit: number): Promise<boolean> {
    if (limit <= 0) return false;
    const result = await this.#sql.run(
      `INSERT INTO ai_usage (site_id, day, requests, input_tokens, output_tokens) VALUES (?, ?, 1, 0, 0)
       ON CONFLICT(site_id, day) DO UPDATE SET requests = requests + 1 WHERE ai_usage.requests < ?`,
      [siteId, day, limit],
    );
    return result.changes > 0;
  }

  /** Adds the tokens a finished command reported. */
  async addTokens(siteId: string, day: string, input: number, output: number): Promise<void> {
    if (input <= 0 && output <= 0) return;
    await this.#sql.run(
      "UPDATE ai_usage SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE site_id = ? AND day = ?",
      [Math.round(input), Math.round(output), siteId, day],
    );
  }
}
