/** The fetch core of the Studio API client: `request`, its error type and the URL/body helpers. */
import { forgetSession } from "../session-cache.ts";

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  readonly status: number;
  readonly body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

const writeListeners = new Set<(path: string) => void>();

/**
 * Calls `listener` with the path of every write (`POST`/`PUT`/`PATCH`/`DELETE`) the API answered
 * with success, so a view of derived state (the pending changes beside Publish) refreshes after
 * any save without each screen invalidating it. Returns the unsubscribe.
 */
export function onApiWrite(listener: (path: string) => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/** Tells `onApiWrite` listeners about a write made outside `request` (a streamed Build turn). */
export function wrote(path: string, method: string | undefined): void {
  if (method && method !== "GET" && method !== "HEAD") for (const fn of writeListeners) fn(path);
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) {
    wrote(path, init.method);
    return undefined as T;
  }
  const body = (await res
    .json()
    .catch(() => ({ error: "invalid_json", message: res.statusText }))) as T | ApiError;
  // The session ended on the server: the next navigation asks again (and lands on the login).
  if (res.status === 401) forgetSession();
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError);
  wrote(path, init.method);
  return body as T;
}

/**
 * `value` when the server answered a list, else none. A misrouted server can answer 200 with
 * something else (the Studio's HTML page, an error object), which must not crash every screen.
 */
export function listOf<T>(value: readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export const json = (data: unknown) => ({ body: JSON.stringify(data) });

/** Builds `?a=1&b=2` from the values that are set (empty string when none are). */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** True when the server answered 404 for a feature it does not run (audit log, agent keys). */
export function isNotEnabled(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  // RFC-0036 §5: a playground refuses what it leaves out with 403 `playground`; read it as off.
  return error.status === 404 || (error.status === 403 && error.body.error === "playground");
}

/** The API error code (`body.error`) of a failed request, e.g. `rank` or `invite_gone`. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.body.error : undefined;
}

/** `details.<field>` of a failed request (`rank` → `problem`, `cannot_decide` → `code`). */
export function errorDetail(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  const details = error.body.details as Record<string, unknown> | undefined;
  const value = details?.[field];
  return typeof value === "string" ? value : undefined;
}
