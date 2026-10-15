/**
 * The model call behind in-editor AI (RFC-0016 §1, §5): Cloudflare Workers AI through the `AI`
 * binding on Workers (no secret), or its REST API from Node (account id and token from the
 * environment). An optional AI Gateway id routes either through the gateway. Dependency-free and
 * Worker-safe: streams are parsed here, in both shapes Workers AI sends (`{ response }` from older
 * models, OpenAI `choices[].delta` from newer ones and from gateway providers); reasoning output is
 * dropped.
 */

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiRunRequest {
  /** A Workers AI id (`@cf/…`) or, through a gateway, `provider/model`. */
  model: string;
  messages: AiMessage[];
  maxTokens: number;
  /** An AI Gateway id. */
  gateway?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export type AiEvent = { type: "text"; text: string } | ({ type: "usage" } & AiUsage);

/** A text-generation model as the catalogue lists it. */
export interface AiModelInfo {
  id: string;
  /** The catalogue's description, when it has one. */
  description?: string;
  /** Tokens, when the catalogue says. */
  contextWindow?: number;
  beta?: boolean;
}

export interface AiTransport {
  /** How calls reach Workers AI: the Worker binding, or the REST API. */
  readonly kind: "binding" | "rest";
  /** Text deltas as they arrive, then the usage when the model reports it. */
  stream(request: AiRunRequest): AsyncIterable<AiEvent>;
  /** The account's text-generation models (experimental ones hidden). */
  models(): Promise<AiModelInfo[]>;
}

/** Why a call failed, as API error codes Studio words itself. */
export type AiErrorCode =
  | "ai_model_unavailable"
  | "ai_rate_limited"
  | "ai_unavailable"
  | "ai_failed";

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }

  /** A binding or HTTP failure as an `AiError` (the message never carries the token). */
  static from(e: unknown, status?: number): AiError {
    if (e instanceof AiError) return e;
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    if (status === 429 || /\b(429|rate.?limit|capacity|3040|3036)\b/i.test(message))
      return new AiError("ai_rate_limited", message);
    if (
      status === 404 ||
      /\b(5007|no such model|model not found|not a valid model|unknown model|deprecated)\b/i.test(
        message,
      )
    )
      return new AiError("ai_model_unavailable", message);
    return new AiError("ai_failed", message);
  }
}

// ── stream parsing ────────────────────────────────────────────────────────────────────────────

interface Chunk {
  response?: unknown;
  choices?: { delta?: { content?: unknown }; text?: unknown }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function textOf(chunk: Chunk): string {
  if (typeof chunk.response === "string") return chunk.response;
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content ?? choice?.text;
  return typeof content === "string" ? content : "";
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The text deltas and the usage in a Workers AI / OpenAI server-sent-events stream. */
export async function* parseAiStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AiEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: AiUsage | undefined;
  const handle = function* (line: string): Generator<AiEvent> {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      return;
    }
    const text = textOf(chunk);
    if (text) yield { type: "text", text };
    if (chunk.usage)
      usage = {
        inputTokens: count(chunk.usage.prompt_tokens),
        outputTokens: count(chunk.usage.completion_tokens),
      };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) yield* handle(line);
    }
    buffer += decoder.decode();
    if (buffer) yield* handle(buffer);
  } finally {
    reader.releaseLock();
  }
  if (usage) yield { type: "usage", ...usage };
}

const bodyOf = (r: AiRunRequest) => ({
  messages: r.messages,
  stream: true,
  max_tokens: r.maxTokens,
});

// ── the catalogue ─────────────────────────────────────────────────────────────────────────────

/** A model row as the binding's `models()` and REST `models/search` return it. */
export interface CatalogRow {
  name?: unknown;
  description?: unknown;
  task?: { name?: unknown } | unknown;
  properties?: { property_id?: unknown; value?: unknown }[] | unknown;
}

const TEXT_GENERATION = "Text Generation";

/** Catalogue rows as `AiModelInfo`, text generation only. Unknown property names are ignored. */
export function modelsFromCatalog(rows: readonly CatalogRow[]): AiModelInfo[] {
  const out: AiModelInfo[] = [];
  for (const row of rows) {
    if (typeof row.name !== "string" || !row.name) continue;
    const task = (row.task as { name?: unknown } | undefined)?.name;
    if (task !== undefined && task !== TEXT_GENERATION) continue;
    const info: AiModelInfo = { id: row.name };
    if (typeof row.description === "string" && row.description)
      info.description = row.description.slice(0, 300);
    for (const p of Array.isArray(row.properties) ? row.properties : []) {
      const id = typeof p?.property_id === "string" ? p.property_id : "";
      const value = p?.value;
      if (
        (id === "context_window" || id === "max_input_tokens") &&
        info.contextWindow === undefined
      ) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) info.contextWindow = n;
      }
      if (id === "beta") info.beta = value === true || value === "true";
    }
    out.push(info);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── the binding ───────────────────────────────────────────────────────────────────────────────

/** The part of the Workers `Ai` binding this client uses. */
export interface AiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  models?(params?: Record<string, unknown>): Promise<unknown>;
}

export function bindingTransport(binding: AiBinding): AiTransport {
  return {
    kind: "binding",
    async *stream(r) {
      let out: unknown;
      try {
        out = await binding.run(r.model, bodyOf(r), {
          ...(r.gateway ? { gateway: { id: r.gateway } } : {}),
          ...(r.signal ? { signal: r.signal } : {}),
        });
      } catch (e) {
        throw AiError.from(e);
      }
      if (out instanceof ReadableStream) {
        yield* parseAiStream(out as ReadableStream<Uint8Array>);
        return;
      }
      // A model that does not stream answers with one object.
      const text = textOf((out ?? {}) as Chunk);
      if (text) yield { type: "text", text };
    },
    async models() {
      if (!binding.models) return [];
      try {
        const rows = await binding.models({ task: TEXT_GENERATION, hide_experimental: true });
        return modelsFromCatalog(Array.isArray(rows) ? (rows as CatalogRow[]) : []);
      } catch (e) {
        throw AiError.from(e);
      }
    },
  };
}

// ── REST ──────────────────────────────────────────────────────────────────────────────────────

export interface RestAiOptions {
  accountId: string;
  /** A Cloudflare API token with Workers AI Read and Edit. Never logged. */
  token: string;
  fetch?: typeof fetch;
}

const API = "https://api.cloudflare.com/client/v4/accounts";
const GATEWAY = "https://gateway.ai.cloudflare.com/v1";

/** An error body's first message (Cloudflare's `{ errors: [{ message }] }`), else the status. */
async function failure(res: Response): Promise<AiError> {
  let message = `${res.status} ${res.statusText}`.trim();
  try {
    const body = (await res.json()) as { errors?: { message?: unknown; code?: unknown }[] };
    const first = body.errors?.[0];
    if (first && typeof first.message === "string")
      message = `${first.code ?? res.status}: ${first.message}`;
  } catch {
    // not JSON
  }
  return AiError.from(new Error(message), res.status);
}

export function restTransport(o: RestAiOptions): AiTransport {
  const call = o.fetch ?? fetch;
  const account = encodeURIComponent(o.accountId);
  const headers = {
    authorization: `Bearer ${o.token}`,
    "content-type": "application/json",
  };
  return {
    kind: "rest",
    async *stream(r) {
      const url = r.gateway
        ? `${GATEWAY}/${account}/${encodeURIComponent(r.gateway)}/workers-ai/${r.model}`
        : `${API}/${account}/ai/run/${r.model}`;
      let res: Response;
      try {
        res = await call(url, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyOf(r)),
          ...(r.signal ? { signal: r.signal } : {}),
        });
      } catch (e) {
        throw AiError.from(e);
      }
      if (!res.ok || !res.body) throw await failure(res);
      yield* parseAiStream(res.body);
    },
    async models() {
      const url = `${API}/${account}/ai/models/search?task=${encodeURIComponent(TEXT_GENERATION)}&hide_experimental=true&per_page=100`;
      const res = await call(url, { headers });
      if (!res.ok) throw await failure(res);
      const body = (await res.json()) as { result?: unknown };
      return modelsFromCatalog(Array.isArray(body.result) ? (body.result as CatalogRow[]) : []);
    },
  };
}
