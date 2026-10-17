/**
 * The model picker (RFC-0016 §2): the account's live text-generation catalogue, merged with a
 * short recommended list that stays when the catalogue cannot be read. Studio words the notes
 * (`note` is a key).
 */
import type { AiModelInfo, AiTransport } from "./client.ts";
import { DEFAULT_AI_MODEL } from "./store.ts";

export type RecommendedNote = "default" | "quality" | "budget" | "general";

export const RECOMMENDED_AI_MODELS: readonly { id: string; note: RecommendedNote }[] = [
  // The strongest in Cloudhal's build evals (2026-10-17): finishes turns, follows the steps.
  { id: DEFAULT_AI_MODEL, note: "default" },
  // Inexpensive, multilingual, 131k context (Workers AI, 2026-02); weaker at building pages.
  { id: "@cf/zai-org/glm-4.7-flash", note: "budget" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", note: "general" },
];

export interface PickerModel extends AiModelInfo {
  /** One of the recommended models, with why. */
  recommended?: RecommendedNote;
  /** In the account's live catalogue (false: recommended, but the catalogue was not readable). */
  listed: boolean;
}

export interface ModelPicker {
  models: PickerModel[];
  /** Whether the live catalogue was read. */
  catalog: "live" | "unavailable";
}

const TTL_MS = 60 * 60 * 1000;
let cached: { at: number; kind: string; models: AiModelInfo[] } | undefined;

/** The catalogue, cached for an hour per isolate (per process on Node). */
async function catalogue(transport: AiTransport, now: number): Promise<AiModelInfo[]> {
  if (cached && cached.kind === transport.kind && now - cached.at < TTL_MS) return cached.models;
  const models = await transport.models();
  cached = { at: now, kind: transport.kind, models };
  return models;
}

/** Forgets the cached catalogue (tests). */
export function resetModelCatalogue(): void {
  cached = undefined;
}

export async function modelPicker(transport: AiTransport, now = Date.now()): Promise<ModelPicker> {
  let live: AiModelInfo[] | undefined;
  try {
    live = await catalogue(transport, now);
  } catch {
    live = undefined;
  }
  const byId = new Map((live ?? []).map((m) => [m.id, m]));
  const recommended: PickerModel[] = RECOMMENDED_AI_MODELS.filter(
    (r) => !live || byId.has(r.id),
  ).map((r) => ({
    ...(byId.get(r.id) ?? { id: r.id }),
    recommended: r.note,
    listed: byId.has(r.id),
  }));
  const ids = new Set(recommended.map((m) => m.id));
  const rest: PickerModel[] = (live ?? [])
    .filter((m) => !ids.has(m.id))
    .map((m) => ({ ...m, listed: true }));
  return { models: [...recommended, ...rest], catalog: live ? "live" : "unavailable" };
}
