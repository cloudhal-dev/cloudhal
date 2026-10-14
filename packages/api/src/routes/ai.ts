/**
 * `/api/sites/:siteId/ai` — in-editor AI (RFC-0016). People only (REST refuses API keys).
 *
 * - `GET  /settings` (`content:read`) → `{ settings, usage, transport }`: whether AI is on, the model,
 *   the gateway, the daily cap, today's usage, and how this deployment reaches Workers AI.
 * - `PUT  /settings` (`site:settings`) `{ enabled, model, gateway?, dailyLimit, rev }`.
 * - `GET  /models` (`site:settings`) → the picker: recommended models first, then the catalogue.
 * - `POST /commands` (`ai:invoke`) `{ command, nodeId, text, tone?, locale?, instruction? }` →
 *   the model's Markdown, streamed as `text/plain`. Errors before the first chunk are JSON:
 *   400 `invalid`, 404, 409 `ai_off`, 429 `ai_budget` | `ai_busy` | `ai_rate_limited`,
 *   502 `ai_failed` | `ai_model_unavailable`, 503 `ai_unavailable`. A failure after the first
 *   chunk aborts the stream. Each command is audited (`ai_command`) without its text.
 */
import { Hono } from "hono";
import { AiError, type AiEvent, type AiTransport } from "../ai/client.ts";
import {
  AiCommandError,
  aiMessages,
  MAX_AI_OUTPUT_TOKENS,
  parseAiCommand,
} from "../ai/commands.ts";
import { modelPicker } from "../ai/models.ts";
import { AiSettingsError, type AiStore, checkAiSettings, isWorkersAiModel } from "../ai/store.ts";
import type { Env } from "../context.ts";
import { apiError, notFound } from "../errors.ts";
import { API_ACTOR } from "../governance.ts";
import { personOf } from "../own.ts";
import { param } from "../params.ts";

/** What the AI routes need: the settings store, and the model transport when one is configured. */
export interface AiDeps {
  readonly store: AiStore;
  readonly transport?: AiTransport | undefined;
}

/** The longest a command may run before it is aborted. */
const COMMAND_TIMEOUT_MS = 120_000;

/** People with a command running (one each; per isolate on Workers, per process on Node). */
const running = new Set<string>();

const STATUS = {
  ai_model_unavailable: 502,
  ai_failed: 502,
  ai_rate_limited: 429,
  ai_unavailable: 503,
} as const;

function aiFailure(e: unknown): never {
  const err = AiError.from(e);
  throw apiError(STATUS[err.code], err.code, err.message);
}

function settingsError(e: unknown): never {
  if (e instanceof AiSettingsError)
    throw apiError(e.code === "conflict" ? 409 : 400, e.code, e.message);
  throw e;
}

export function aiRoutes(deps: AiDeps | undefined): Hono<Env> {
  const store = () => {
    if (!deps) throw apiError(503, "ai_unavailable", "this deployment has no AI settings store");
    return deps.store;
  };
  const transport = () => deps?.transport?.kind ?? "none";
  const today = (now: Date) => now.toISOString().slice(0, 10);

  return new Hono<Env>()
    .get("/settings", async (c) => {
      const siteId = param(c, "siteId");
      const s = store();
      return c.json({
        settings: await s.settings(siteId),
        usage: await s.usage(siteId, today(c.get("now")())),
        transport: transport(),
      });
    })
    .put("/settings", async (c) => {
      const siteId = param(c, "siteId");
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const rev = body.rev;
      if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0)
        throw apiError(400, "invalid", "rev: the revision you read (0 for never saved)");
      try {
        const next = checkAiSettings(body);
        const saved = await store().save(
          siteId,
          next,
          rev,
          (c.get("actor") ?? API_ACTOR).id,
          c.get("now")().toISOString(),
        );
        await c.get("audit")?.record({
          at: c.get("now")().toISOString(),
          actor: c.get("actor") ?? API_ACTOR,
          siteId,
          tool: "ai_settings",
          decision: "allow",
          outcome: "ok",
          input: {
            enabled: saved.enabled,
            model: saved.model,
            ...(saved.gateway ? { gateway: saved.gateway } : {}),
            dailyLimit: saved.dailyLimit,
          },
        });
        return c.json(saved);
      } catch (e) {
        settingsError(e);
      }
    })
    .get("/models", async (c) => {
      const t = deps?.transport;
      if (!t) throw apiError(503, "ai_unavailable", "this deployment cannot reach Workers AI");
      return c.json(await modelPicker(t, c.get("now")().getTime()));
    })
    .post("/commands", async (c) => {
      const siteId = param(c, "siteId");
      const t = deps?.transport;
      if (!t) throw apiError(503, "ai_unavailable", "this deployment cannot reach Workers AI");
      const settings = await store().settings(siteId);
      if (!settings.enabled) throw apiError(409, "ai_off", "AI is off for this site");
      if (!isWorkersAiModel(settings.model) && !settings.gateway)
        throw apiError(409, "ai_off", "the chosen model needs an AI Gateway; check the settings");
      let command: ReturnType<typeof parseAiCommand>;
      try {
        command = parseAiCommand(await c.req.json().catch(() => ({})));
      } catch (e) {
        if (e instanceof AiCommandError)
          throw apiError(400, "invalid", e.message, { field: e.field });
        throw e;
      }
      const graph = c.get("store");
      const entry = await graph.getContentEntry(command.nodeId);
      const page = entry ? undefined : await graph.getPage(command.nodeId);
      const node = entry ?? page;
      if (!node || node.siteId !== siteId) throw notFound("page or article not found");
      const locale = node.locale;

      const actor = c.get("actor") ?? API_ACTOR;
      const who = personOf(c) ?? actor.id;
      if (running.has(who))
        throw apiError(429, "ai_busy", "one AI command at a time; wait for the one running");
      const now = c.get("now");
      const day = today(now());
      if (!(await store().reserve(siteId, day, settings.dailyLimit)))
        throw apiError(429, "ai_budget", "today's AI commands for this site are used up");

      running.add(who);
      const started = Date.now();
      const usage = { inputTokens: 0, outputTokens: 0 };
      let chars = 0;
      const finish = async (outcome: "ok" | "error", reason?: string) => {
        running.delete(who);
        await store()
          .addTokens(siteId, day, usage.inputTokens, usage.outputTokens)
          .catch(() => {});
        await c
          .get("audit")
          ?.record({
            at: now().toISOString(),
            actor,
            siteId,
            tool: "ai_command",
            decision: "allow",
            outcome,
            durationMs: Date.now() - started,
            ...(reason ? { reason } : {}),
            input: {
              command: command.command,
              model: settings.model,
              nodeId: command.nodeId,
              chars: command.text.length,
              outputChars: chars,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            },
          })
          .catch(() => {});
      };

      const events = t
        .stream({
          model: settings.model,
          messages: aiMessages(command, { title: node.title, ...(locale ? { locale } : {}) }),
          maxTokens: MAX_AI_OUTPUT_TOKENS,
          gateway: settings.gateway,
          // Studio cancelling, or a model that stops answering (the busy lock must not stick).
          signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(COMMAND_TIMEOUT_MS)]),
        })
        [Symbol.asyncIterator]();
      // The first event decides the status: a model that is gone or refuses is a JSON error.
      let first: IteratorResult<AiEvent>;
      try {
        first = await events.next();
      } catch (e) {
        await finish("error", AiError.from(e).code);
        aiFailure(e);
      }
      const encoder = new TextEncoder();
      const take = (e: AiEvent): Uint8Array | undefined => {
        if (e.type === "usage") {
          usage.inputTokens = e.inputTokens;
          usage.outputTokens = e.outputTokens;
          return undefined;
        }
        chars += e.text.length;
        return encoder.encode(e.text);
      };
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            if (!first.done) {
              const bytes = take(first.value);
              if (bytes) controller.enqueue(bytes);
            }
            if (!first.done)
              for (let r = await events.next(); !r.done; r = await events.next()) {
                const bytes = take(r.value);
                if (bytes) controller.enqueue(bytes);
              }
            await finish("ok");
            controller.close();
          } catch (e) {
            await finish("error", AiError.from(e).code);
            controller.error(e);
          }
        },
        async cancel() {
          await events.return?.();
          await finish("error", "cancelled");
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    });
}
