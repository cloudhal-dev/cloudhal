import { en } from "../i18n/en.ts";
import type { TFunction } from "../i18n/index.tsx";
import { ApiRequestError } from "./api/http.ts";

type ApiErrorKey = keyof (typeof en)["errors"]["api"];

/** A 409: someone changed the document since it was read (CAS on `rev`). */
export const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

const isKnown = (code: string): code is ApiErrorKey =>
  code !== "network" && code !== "status" && Object.hasOwn(en.errors.api, code);

/**
 * What a failed request says to the person, in the Studio language (AGENTS.md hard rule 10): the
 * catalog's sentence for the API's error code (`errors.api.<code>`, `errors.conflict`), else the
 * server's own message — specific (a field, a limit) but English — else the HTTP status. A
 * network failure (`fetch` rejects with a `TypeError`) has its own sentence.
 */
export function apiErrorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code = error.body?.error ?? "";
    if (code === "conflict") return t("errors.conflict");
    if (isKnown(code)) return t(`errors.api.${code}`);
    return error.body?.message || t("errors.api.status", { status: error.status });
  }
  if (error instanceof TypeError) return t("errors.api.network");
  if (error instanceof Error && error.message) return error.message;
  return t("errors.title");
}
