/**
 * Build events (RFC-0020 §6, phase 20b): who is changing which page right now. MCP tools and
 * Studio saves report here; `GET …/pages/:pageId/build/events` streams it to Studio's Build view.
 *
 * In-process: one hub per server. On Node (`cloudhal studio`) that is the whole deployment. On
 * Cloudflare a request may land on another isolate than the stream it should reach; phase 20b-2
 * moves the hub into a Durable Object per page.
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
  /** Follows one page; returns the function that stops following. */
  subscribe(pageId: string, listener: (change: BuildChange) => void): () => void;
  /** How many viewers follow a page (tests, diagnostics). */
  viewers(pageId: string): number;
}

/** Most viewers one page may have; a further stream is refused (429) rather than kept. */
export const BUILD_VIEWER_LIMIT = 20;

export function createBuildHub(now: () => Date = () => new Date()): BuildHub {
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
      emit(change.page.id, { kind: "changed", ...change, at: now().toISOString() });
    },
    patchRejected(rejection) {
      emit(rejection.pageId, { kind: "rejected", ...rejection, at: now().toISOString() });
    },
    subscribe(pageId, listener) {
      let set = byPage.get(pageId);
      if (!set) {
        set = new Set();
        byPage.set(pageId, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) byPage.delete(pageId);
      };
    },
    viewers: (pageId) => byPage.get(pageId)?.size ?? 0,
  };
}
