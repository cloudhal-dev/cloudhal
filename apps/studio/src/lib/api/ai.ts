/** In-editor AI and Studio's Build chat. */
import { type ApiError, ApiRequestError, json, request } from "./http.ts";

// ---- in-editor AI (RFC-0016, packages/api/src/routes/ai.ts) -------------------------------------

/** How the server reaches Workers AI: the Worker binding, the REST API, or not at all. */
export type AiTransportKind = "binding" | "rest" | "none";

export interface AiSettings {
  enabled: boolean;
  /** A Workers AI id (`@cf/…`) or, through a gateway, `provider/model`. */
  model: string;
  gateway?: string;
  dailyLimit: number;
  /** 0 until first saved. */
  rev: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AiDayUsage {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** One in-editor AI command (RFC-0016 §3). */
export interface AiCommandRequest {
  command: "improve" | "shorten" | "expand" | "fix" | "tone" | "translate" | "custom";
  nodeId: string;
  text: string;
  tone?: "formal" | "friendly" | "plain";
  locale?: string;
  instruction?: string;
}

/** A model in the picker: recommended ones first, then the account's catalogue. */
export interface AiPickerModel {
  id: string;
  description?: string;
  contextWindow?: number;
  beta?: boolean;
  recommended?: "default" | "quality" | "budget" | "general";
  /** In the live catalogue (false: recommended, but the catalogue could not be read). */
  listed: boolean;
}

/** One progress event of a Build chat turn (`@cloudhal/api` `BuildTurnEvent`, RFC-0020 §6). */
export type BuildTurnEvent =
  | { type: "round"; round: number }
  | { type: "say"; text: string }
  | { type: "writing"; components: string[] }
  /** RFC-0021 21c: the page was rendered and the model looks at it (failed check ids). */
  | { type: "look"; failed: string[]; images: number }
  /** Components added but not linked into a parent's children (they do not show yet). */
  | { type: "unlinked"; components: string[] }
  | { type: "step"; ok: true; rev: number; ops: number; repairs: string[] }
  | { type: "step"; ok: false; issues: string[] }
  | {
      type: "done";
      rev: number;
      steps: number;
      refused: number;
      snapshotId?: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { type: "error"; code: string; message: string };

export const aiApi = {
  /** Whether AI is on, the model, the cap, today's use and how the server reaches Workers AI. */
  settings: (siteId: string) =>
    request<{ settings: AiSettings; usage: AiDayUsage; transport: AiTransportKind }>(
      `/api/sites/${siteId}/ai/settings`,
    ),
  /** Saves settings read at `rev`; 409 when someone saved in between. */
  save: (
    siteId: string,
    input: { enabled: boolean; model: string; gateway?: string; dailyLimit: number; rev: number },
  ) => request<AiSettings>(`/api/sites/${siteId}/ai/settings`, { method: "PUT", ...json(input) }),
  /**
   * Runs a command on the selected markdown and yields the model's text as it arrives. An error
   * before the first chunk is an `ApiRequestError` with the code (`ai_budget`, `ai_off`, …).
   */
  command: async function* (
    siteId: string,
    body: AiCommandRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    const res = await fetch(`/api/sites/${siteId}/ai/commands`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) {
      const error = (await res
        .json()
        .catch(() => ({ error: "ai_failed", message: res.statusText }))) as ApiError;
      throw new ApiRequestError(res.status, error);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) yield text;
      }
      const rest = decoder.decode();
      if (rest) yield rest;
    } finally {
      reader.releaseLock();
    }
  },
  /**
   * Studio's Build chat (RFC-0020 §6): the site's model changes the page step by step; yields
   * each progress event as it arrives (NDJSON). An error before the stream starts is an
   * `ApiRequestError` with the code (`ai_off`, `ai_budget`, `ai_busy`, …).
   */
  build: async function* (
    siteId: string,
    pageId: string,
    message: string,
    signal?: AbortSignal,
    /** The part of the page picked in the preview (RFC-0020 §6). */
    scope?: { sectionId: string; componentId?: string | undefined },
  ): AsyncGenerator<BuildTurnEvent, void, undefined> {
    const res = await fetch(`/api/sites/${siteId}/ai/build/${pageId}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(scope ? { message, scope } : { message }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) {
      const error = (await res
        .json()
        .catch(() => ({ error: "ai_failed", message: res.statusText }))) as ApiError;
      throw new ApiRequestError(res.status, error);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) yield JSON.parse(line) as BuildTurnEvent;
          nl = buffer.indexOf("\n");
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  },
  /** The model picker (503 when the server cannot reach Workers AI). */
  models: (siteId: string) =>
    request<{ models: AiPickerModel[]; catalog: "live" | "unavailable" }>(
      `/api/sites/${siteId}/ai/models`,
    ),
};
