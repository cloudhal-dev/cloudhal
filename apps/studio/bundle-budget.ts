import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/**
 * The initial-load budget of Studio: the entry chunk and every chunk it imports statically (what
 * `index.html` loads and modulepreloads before any screen). `vite build` fails when it is over
 * budget or when analytics-only code ends up in it — analytics blocks, ECharts and its Kumo
 * wrappers belong to the lazy Analytics route and the lazy Readers charts (RFC-0006 §10.4).
 *
 * Raise a budget only with a reason in the commit (a dependency every screen needs); first check
 * whether the new code can load with the screen that uses it.
 */
export const BUNDLE_BUDGET = {
  /**
   * The entry chunk alone, minified bytes. 287 kB on 2026-10-12 with the top bar's theme menu
   * (light / dark / system: its Sun, Moon and Desktop icons ship every Phosphor weight, ~8.5 kB),
   * which every screen shows (was 276 kB under a 280 kB budget). 283.5 kB on 2026-10-13 with the
   * schedule routes, nav and bell: the command palette loads with its first opening and the
   * shell's comment and avatar helpers moved out of their screens' modules.
   */
  entryBytes: 290_000,
  /**
   * Entry + its static imports, gzip bytes. 456 kB on 2026-10-12, once the analytics wording
   * moved to lazy message namespaces (was 466 kB under a 480 kB budget). 466.5 kB on 2026-10-13
   * with schedules (467.2 kB before them). 470.6 kB on 2026-10-14 with the rich body editor:
   * Tiptap stays in its own lazy chunk (560 kB minified), but the Kumo modules it shares with the
   * shell (text, input, toolbar, popover, …) split into 9 more shared chunks; no new code loads
   * first, the extra gzip is the chunks' own overhead.
   */
  initialGzipBytes: 475_000,
};

/** Modules that must never be in the initial load (analytics and comments, loaded by lazy routes). */
export const LAZY_ONLY: readonly RegExp[] = [
  /[\\/]node_modules[\\/].*[\\/](echarts|zrender)[\\/]/,
  /[\\/]@cloudflare[\\/]kumo[\\/]dist[\\/]chunks[\\/](chart|date-range-picker|date-picker)-/,
  /[\\/]packages[\\/]ui[\\/]src[\\/]charts\.ts$/,
  /[\\/]packages[\\/]ui[\\/]src[\\/]blocks[\\/](AnalyticsTimeseries|AnalyticsRangePicker|AnalyticsQuotaBanner|AnalyticsBotBanner|Breakdown|CountryMap|ReadersSummary|StatTile|analytics-format|calendar-locale|charts|useChartFrame|useChartPalette)\.tsx?$/,
  // Reader comments (RFC-0007 §14): the blocks load with the comment screens and the editor card.
  /[\\/]packages[\\/]ui[\\/]src[\\/]blocks[\\/](Comment[A-Za-z]*|ArticleCommentsSummary|comment-model)\.tsx?$/,
  // Schedules (RFC-0008 §15.9): the calendar, agenda and schedule dialogs' blocks load with the
  // lazy schedule routes and the lazily loaded "Schedule…" dialog, never with the shell.
  /[\\/]packages[\\/]ui[\\/]src[\\/]blocks[\\/](Schedule[A-Za-z]*|Calendar(Month|Nav)|AgendaList|TimezoneNote|DateTimeField|RecurrenceEditor|NextRuns|RescheduleDialog|schedule-model|recurrence)\.tsx?$/,
  /[\\/]apps[\\/]studio[\\/]src[\\/]lib[\\/]analytics\.ts$/,
  /[\\/]apps[\\/]studio[\\/]src[\\/]components[\\/](Analytics[A-Za-z]*|Readers)\.tsx$/,
  // Comment screens' own components and the settings model (the shell keeps `lib/comments-shell.ts`,
  // the router's search helpers and the bell's words).
  /[\\/]apps[\\/]studio[\\/]src[\\/]components[\\/](Comment[A-Za-z]*|ArticleCommentsCard)\.tsx$/,
  /[\\/]apps[\\/]studio[\\/]src[\\/]lib[\\/]comment-settings\.ts$/,
  // Schedule screens' own code: the client, the model, the notices' words, the dialogs and cards
  // (the shell keeps `api.scheduler`, the router's `schedules-search.ts` and the nav entry).
  /[\\/]apps[\\/]studio[\\/]src[\\/]lib[\\/](schedules|schedules-api|schedule-notices)\.ts$/,
  /[\\/]apps[\\/]studio[\\/]src[\\/]components[\\/](Schedule[A-Za-z]*|Schedules|Automation[A-Za-z]*|Release[A-Za-z]*)\.tsx$/,
  // The rich body editor (RFC-0014 phase 1): Tiptap, ProseMirror and the editor block load with
  // the first markdown body on screen (`components/BodyEditor.tsx`), never with the shell;
  // CodeMirror (Markdown mode) only with the first switch to it.
  /[\\/]node_modules[\\/].*[\\/](@tiptap|prosemirror-[a-z-]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname|@codemirror|@lezer|@marijn|crelt|style-mod)[\\/]/,
  /[\\/]packages[\\/]ui[\\/]src[\\/](editor\.ts|blocks[\\/]MarkdownEditor\.tsx|blocks[\\/]editor[\\/])/,
  // Lazy message namespaces: their words load with the screens that show them.
  /[\\/]apps[\\/]studio[\\/]src[\\/]i18n[\\/]lazy[\\/]/,
];

/** The part of a Rollup/Rolldown output chunk the check reads. */
export interface BudgetChunk {
  type: "chunk" | "asset";
  fileName: string;
  isEntry?: boolean;
  imports?: string[];
  code?: string;
  moduleIds?: readonly string[];
}

export interface BudgetReport {
  entry: string;
  entryBytes: number;
  initial: { fileName: string; bytes: number; gzipBytes: number }[];
  initialBytes: number;
  initialGzipBytes: number;
  problems: string[];
}

/** Measures the initial load of a bundle and lists what breaks the budget. */
export function checkBundleBudget(
  bundle: Record<string, BudgetChunk>,
  budget = BUNDLE_BUDGET,
  lazyOnly = LAZY_ONLY,
): BudgetReport {
  const entries = Object.values(bundle).filter((c) => c.type === "chunk" && c.isEntry);
  if (entries.length !== 1) throw new Error(`expected one entry chunk, found ${entries.length}`);
  const entry = entries[0] as BudgetChunk;
  const seen = new Set<string>();
  const visit = (fileName: string) => {
    if (seen.has(fileName)) return;
    seen.add(fileName);
    for (const next of bundle[fileName]?.imports ?? []) visit(next);
  };
  visit(entry.fileName);

  const problems: string[] = [];
  const initial = [...seen].map((fileName) => {
    const code = bundle[fileName]?.code ?? "";
    for (const id of bundle[fileName]?.moduleIds ?? []) {
      if (lazyOnly.some((re) => re.test(id))) problems.push(`${fileName} contains ${id}`);
    }
    return {
      fileName,
      bytes: Buffer.byteLength(code),
      gzipBytes: gzipSync(code).length,
    };
  });
  const entryBytes = Buffer.byteLength(entry.code ?? "");
  const initialBytes = initial.reduce((n, c) => n + c.bytes, 0);
  const initialGzipBytes = initial.reduce((n, c) => n + c.gzipBytes, 0);
  if (entryBytes > budget.entryBytes)
    problems.push(
      `entry chunk ${entry.fileName} is ${entryBytes} B (budget ${budget.entryBytes} B)`,
    );
  if (initialGzipBytes > budget.initialGzipBytes)
    problems.push(
      `initial load is ${initialGzipBytes} B gzip (budget ${budget.initialGzipBytes} B) in ${initial.length} chunks`,
    );
  return {
    entry: entry.fileName,
    entryBytes,
    initial,
    initialBytes,
    initialGzipBytes,
    problems,
  };
}

/** Fails `vite build` when the initial load breaks {@link BUNDLE_BUDGET} or {@link LAZY_ONLY}. */
export function bundleBudget(): Plugin {
  return {
    name: "cloudhal:bundle-budget",
    apply: "build",
    enforce: "post",
    // After Vite has filled in the preload lists: the chunks as they are written.
    writeBundle(_options, bundle) {
      const report = checkBundleBudget(bundle as unknown as Record<string, BudgetChunk>);
      const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;
      this.info(
        `initial load: entry ${kb(report.entryBytes)}, ${report.initial.length} chunks, ` +
          `${kb(report.initialBytes)} (gzip ${kb(report.initialGzipBytes)})`,
      );
      if (report.problems.length > 0)
        this.error(
          `Studio bundle budget (apps/studio/bundle-budget.ts):\n  ${report.problems.join("\n  ")}`,
        );
    },
  };
}
