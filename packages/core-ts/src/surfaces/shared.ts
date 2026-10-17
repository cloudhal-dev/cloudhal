/** Limits and tiny guards shared by every surfaces module (RFC-0020 §1, §Security). */
// ── limits ───────────────────────────────────────────────────────────────────────────────────

/** RFC-0020 §1 and §Security. */
export const SURFACE_LIMITS = {
  components: 200,
  depth: 8,
  dataBytes: 65_536,
  surfacesPerPage: 30,
  pointerLength: 200,
  pointerSegments: 16,
  conditionDepth: 4,
  conditionItems: 10,
  functionArgs: 8,
  listArgItems: 20,
  /** RFC-0022 §1: calls nest at most this deep, and a surface holds at most this many. */
  callDepth: 8,
  callsPerSurface: 500,
  /** Items `sum`, `average` and `count` read from a list in the data. */
  aggregateItems: 1_000,
  /** Characters in a `calculate` expression. */
  expressionLength: 200,
  /** Keys in a `choose` call's `cases`. */
  chooseCases: 20,
  opsPerCall: 500,
  sourceLimit: 50,
} as const;

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isScalar = (v: unknown) =>
  v === null || typeof v === "string" || typeof v === "boolean" || Number.isFinite(v);

export function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[n] as number;
}
