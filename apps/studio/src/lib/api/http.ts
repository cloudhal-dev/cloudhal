/** The fetch core of the Studio API client: `request`, its error type and the URL/body helpers. */

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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res
    .json()
    .catch(() => ({ error: "invalid_json", message: res.statusText }))) as T | ApiError;
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError);
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
  return error instanceof ApiRequestError && error.status === 404;
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
