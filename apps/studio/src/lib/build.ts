/**
 * Studio's Build view (RFC-0020 §6): follows a page's build events over server-sent events. The
 * browser's `EventSource` reconnects on its own; every (re)connection starts with a snapshot, so
 * the preview never misses a change.
 */
import { useEffect, useState } from "react";
import { api } from "./api.ts";

export interface BuildActor {
  kind: string;
  name: string;
}

/** One event as the server sends it (AG-UI-shaped). */
export type BuildEvent =
  | { type: "STATE_SNAPSHOT"; snapshot: { rev: number; title: string; html: string } }
  | {
      type: "STATE_DELTA";
      rev: number;
      title: string;
      html: string;
      delta: unknown[];
      repairs: string[];
      changed: string[];
      tool: string;
      actor: BuildActor;
      at: string;
    }
  | {
      type: "CUSTOM";
      name: "validation_failed";
      value: {
        issues: { path?: string; message?: string }[];
        tool: string;
        actor: BuildActor;
        at: string;
      };
    };

export type BuildEntry =
  | {
      id: string;
      kind: "change";
      tool: string;
      actor: BuildActor;
      at: string;
      ops: number;
      changed: string[];
      repairs: string[];
    }
  | { id: string; kind: "rejected"; tool: string; actor: BuildActor; at: string; issues: string[] };

export interface BuildState {
  status: "connecting" | "live" | "lost";
  rev: number | undefined;
  title: string | undefined;
  html: string | undefined;
  /** Sections the latest change touched (the preview outlines them). */
  highlight: string[];
  /** Newest first, at most 100. */
  entries: BuildEntry[];
}

const INITIAL: BuildState = {
  status: "connecting",
  rev: undefined,
  title: undefined,
  html: undefined,
  highlight: [],
  entries: [],
};

/** Applies one event to the state (pure, for tests). */
export function reduceBuild(state: BuildState, event: BuildEvent, id: string): BuildState {
  switch (event.type) {
    case "STATE_SNAPSHOT":
      return {
        ...state,
        status: "live",
        rev: event.snapshot.rev,
        title: event.snapshot.title,
        html: event.snapshot.html,
        highlight: [],
      };
    case "STATE_DELTA":
      return {
        ...state,
        status: "live",
        rev: event.rev,
        title: event.title,
        html: event.html,
        highlight: event.changed,
        entries: [
          {
            id,
            kind: "change" as const,
            tool: event.tool,
            actor: event.actor,
            at: event.at,
            ops: event.delta.length,
            changed: event.changed,
            repairs: event.repairs,
          },
          ...state.entries,
        ].slice(0, 100),
      };
    case "CUSTOM":
      return {
        ...state,
        entries: [
          {
            id,
            kind: "rejected" as const,
            tool: event.value.tool,
            actor: event.value.actor,
            at: event.value.at,
            issues: event.value.issues.map((i) => `${i.path ?? "/"} ${i.message ?? ""}`.trim()),
          },
          ...state.entries,
        ].slice(0, 100),
      };
  }
}

export function useBuildEvents(siteId: string, pageId: string): BuildState {
  const [state, setState] = useState<BuildState>(INITIAL);
  useEffect(() => {
    setState(INITIAL);
    const source = new EventSource(api.preview.buildEvents(siteId, pageId), {
      withCredentials: true,
    });
    let seq = 0;
    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as BuildEvent;
        const id = `${Date.now()}-${++seq}`;
        setState((s) => reduceBuild(s, event, id));
      } catch {
        // A malformed event is skipped; the next snapshot puts the view right again.
      }
    };
    source.onerror = () => setState((s) => ({ ...s, status: "lost" }));
    return () => source.close();
  }, [siteId, pageId]);
  return state;
}
