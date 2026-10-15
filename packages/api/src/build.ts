/**
 * Build events (RFC-0020 §6, phase 20b): who is changing which page right now. MCP tools and
 * Studio saves report here; `GET …/pages/:pageId/build/events` streams it to Studio's Build view.
 *
 * `createBuildHub` is in-process: on Node (`cloudhal studio`) one process is the whole
 * deployment. On Cloudflare, `@cloudhal/cloudflare` implements the same interface with a Durable
 * Object per page, so a change made on one isolate reaches viewers streaming from any other.
 */
import type { Actor, Page } from "@cloudhal/core-contracts";
import type { BuildObserver } from "@cloudhal/mcp-server";

export type BuildChange =
  | {
      readonly kind: "changed";
      readonly siteId: string;
      readonly page: Page;
      readonly tool: string;
      readonly actor: Actor;
      readonly ops?: readonly unknown[] | undefined;
      readonly repairs?: readonly string[] | undefined;
      readonly at: string;
    }
  | {
      readonly kind: "rejected";
      readonly siteId: string;
      readonly pageId: string;
      readonly tool: string;
      readonly actor: Actor;
      readonly issues: readonly unknown[];
      readonly at: string;
    };

export interface BuildHub extends BuildObserver {
  /**
   * Follows one page; resolves to the function that stops following. Refuses a viewer past
   * `BUILD_VIEWER_LIMIT` with `BuildViewerLimitError`.
   */
  subscribe(
    pageId: string,
    listener: (change: BuildChange) => void,
  ): (() => void) | Promise<() => void>;
}

/** Most viewers one page may have; a further stream is refused (429) rather than kept. */
export const BUILD_VIEWER_LIMIT = 20;

export class BuildViewerLimitError extends Error {
  override readonly name = "BuildViewerLimitError";
  constructor() {
    super(`at most ${BUILD_VIEWER_LIMIT} viewers per page`);
  }
}

/** A change as every hub sends it: what the observer was told, with the time it happened. */
export function buildChange(
  input:
    | ({ kind: "changed" } & Parameters<BuildObserver["pageChanged"]>[0])
    | ({ kind: "rejected" } & Parameters<BuildObserver["patchRejected"]>[0]),
  now: Date,
): BuildChange {
  return { ...input, at: now.toISOString() } as BuildChange;
}

/** The in-process hub, with a viewer count for tests and diagnostics. */
export interface LocalBuildHub extends BuildHub {
  viewers(pageId: string): number;
}

export function createBuildHub(now: () => Date = () => new Date()): LocalBuildHub {
  const byPage = new Map<string, Set<(change: BuildChange) => void>>();
  const emit = (pageId: string, change: BuildChange) => {
    for (const listener of byPage.get(pageId) ?? []) {
      try {
        listener(change);
      } catch {
        // A viewer that fails must not break the write that reported it.
      }
    }
  };
  return {
    pageChanged(change) {
      emit(change.page.id, buildChange({ kind: "changed", ...change }, now()));
    },
    patchRejected(rejection) {
      emit(rejection.pageId, buildChange({ kind: "rejected", ...rejection }, now()));
    },
    subscribe(pageId, listener) {
      let set = byPage.get(pageId);
      if (!set) {
        set = new Set();
        byPage.set(pageId, set);
      }
      if (set.size >= BUILD_VIEWER_LIMIT) throw new BuildViewerLimitError();
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) byPage.delete(pageId);
      };
    },
    viewers: (pageId) => byPage.get(pageId)?.size ?? 0,
  };
}
