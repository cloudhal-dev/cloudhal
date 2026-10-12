/**
 * Errors of the analytics layer. Each carries a stable `code` that the API maps to a status
 * (RFC-0006 §7.3, §9.2): `invalid_query` 400, `analytics_unavailable` 503 (+ `retryable`),
 * `analytics_query_failed` 502, `analytics_budget_exceeded` (answered from rollups, never shown as
 * an error), `unsupported_query` (a reader cannot answer this shape; the composite reader goes
 * live), `conflict` 409 (settings CAS).
 */
export type AnalyticsErrorCode =
  | "invalid_query"
  | "unsupported_query"
  | "analytics_unavailable"
  | "analytics_query_failed"
  | "analytics_budget_exceeded"
  | "invalid_settings"
  | "conflict";

export class AnalyticsError extends Error {
  override readonly name: string = "AnalyticsError";
  readonly code: AnalyticsErrorCode;
  readonly retryable: boolean;

  constructor(
    code: AnalyticsErrorCode,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

/** The query is malformed or out of bounds (400 `invalid_query`). */
export class AnalyticsQueryError extends AnalyticsError {
  override readonly name = "AnalyticsQueryError";
  constructor(message: string) {
    super("invalid_query", message);
  }
}

/** This reader cannot answer the query's shape (e.g. rollups and an hourly series). */
export class AnalyticsUnsupportedError extends AnalyticsError {
  override readonly name = "AnalyticsUnsupportedError";
  constructor(message: string) {
    super("unsupported_query", message);
  }
}

/** The store could not be read right now (503 `analytics_unavailable`). */
export class AnalyticsUnavailableError extends AnalyticsError {
  override readonly name = "AnalyticsUnavailableError";
  constructor(message: string, retryable: boolean, cause?: unknown) {
    super("analytics_unavailable", message, { retryable, cause });
  }
}

/** The store refused the query (502 `analytics_query_failed`); the message never names the dataset. */
export class AnalyticsQueryFailedError extends AnalyticsError {
  override readonly name = "AnalyticsQueryFailedError";
  constructor(cause?: unknown) {
    super("analytics_query_failed", "the analytics query failed", { cause });
  }
}

/** The daily budget of uncached live queries is spent (RFC-0006 §7.7); answer from rollups. */
export class AnalyticsBudgetExceededError extends AnalyticsError {
  override readonly name = "AnalyticsBudgetExceededError";
  constructor() {
    super("analytics_budget_exceeded", "the daily analytics query budget is spent");
  }
}

/** A settings write with a stale `rev` (409). */
export class AnalyticsSettingsConflictError extends AnalyticsError {
  override readonly name = "AnalyticsSettingsConflictError";
  constructor(message = "analytics settings changed somewhere else; reload and retry") {
    super("conflict", message);
  }
}

/** A settings value outside its allowed set (400). */
export class AnalyticsSettingsError extends AnalyticsError {
  override readonly name = "AnalyticsSettingsError";
  constructor(message: string) {
    super("invalid_settings", message);
  }
}
