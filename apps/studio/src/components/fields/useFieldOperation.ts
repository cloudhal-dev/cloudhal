import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  api,
  type FieldOperationRequest,
  type FieldOperationResult,
  type FieldRevertResult,
} from "../../lib/api.ts";

/**
 * Where an operation dialog is: choosing, checked (dry run), running, finished, reverted — or
 * stuck (RFC-0045 §7): entries whose values stopped converting while it ran keep it from
 * finishing until they are cleared (`finishClearing`).
 */
export type OperationStep =
  | "choose"
  | "checking"
  | "report"
  | "running"
  | "stuck"
  | "done"
  | "reverting"
  | "reverted";

/** A run or a revert that can't finish: the entries it can't convert, and which it was. */
export interface Stuck {
  operationId: string;
  reverting: boolean;
  entries: { entryId: string; reason: string }[];
}

/** A pass that changed nothing while values no longer convert: asking again would not help. */
const blocked = (r: { done: boolean; unconvertible: unknown[] }, changed: number) =>
  !r.done && changed === 0 && r.unconvertible.length > 0;

/** How many continue calls one run may make before it stops asking (a stuck server). */
const MAX_PASSES = 200;

/** What an operation changes: the site's definitions, the registry, every entry list and editor. */
function refreshAfter(qc: ReturnType<typeof useQueryClient>, siteId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["site", siteId] }),
    qc.invalidateQueries({ queryKey: ["collections", siteId] }),
    qc.invalidateQueries({ queryKey: ["entries", siteId] }),
    qc.invalidateQueries({ queryKey: ["entry", siteId] }),
  ]);
}

/** Continues `first` until it is done, the dialog closed, or a pass is stuck; counts rewrites. */
async function continueUntil(
  first: FieldOperationResult,
  o: {
    next: (operationId: string) => Promise<FieldOperationResult>;
    alive: { current: boolean };
    onRewritten: (total: number) => void;
  },
): Promise<FieldOperationResult> {
  let current = first;
  let total = first.rewritten;
  o.onRewritten(total);
  for (let pass = 0; !current.done && pass < MAX_PASSES && o.alive.current; pass++) {
    if (blocked(current, current.rewritten)) break;
    current = await o.next(current.operationId);
    total += current.rewritten;
    o.onRewritten(total);
  }
  return current;
}

/** The lifecycle's state, and `reset` back to choosing. */
function useSteps() {
  const [step, setStep] = useState<OperationStep>("choose");
  const [report, setReport] = useState<FieldOperationResult>();
  const [result, setResult] = useState<FieldOperationResult>();
  const [revert, setRevert] = useState<FieldRevertResult>();
  const [rewritten, setRewritten] = useState(0);
  const [error, setError] = useState<unknown>();
  const [stuck, setStuck] = useState<Stuck>();
  const alive = useRef(true);
  const reset = useCallback(() => {
    alive.current = true;
    setStep("choose");
    setReport(undefined);
    setResult(undefined);
    setRevert(undefined);
    setRewritten(0);
    setError(undefined);
    setStuck(undefined);
  }, []);
  const values = { step, report, result, revert, rewritten, error, stuck };
  return {
    values,
    alive,
    reset,
    setStep,
    setReport,
    setResult,
    setRevert,
    setRewritten,
    setError,
    setStuck,
  };
}

/**
 * One field operation's lifecycle (RFC-0041 §6): the dry run, the run with `?continue=` until
 * `done`, and the revert called again while it is not done. Each step keeps the last answer; a
 * failure keeps the step it happened in and sets `error`.
 */
export function useFieldOperation(siteId: string, collection: string) {
  const qc = useQueryClient();
  const steps = useSteps();
  const { alive, reset, setStep, setReport, setResult, setRevert } = steps;
  const { setRewritten, setError, setStuck } = steps;
  const refresh = useCallback(() => refreshAfter(qc, siteId), [qc, siteId]);

  const check = useCallback(
    async (body: FieldOperationRequest) => {
      setError(undefined);
      setStep("checking");
      try {
        setReport(
          await api.collections.fieldOperation(siteId, collection, { ...body, dryRun: true }),
        );
        setStep("report");
      } catch (e) {
        setError(e);
        setStep("choose");
      }
    },
    [siteId, collection],
  );

  /** Continues `first` until it is done, or stuck on values that no longer convert. */
  const follow = useCallback(
    async (first: FieldOperationResult) => {
      const current = await continueUntil(first, {
        next: (id) => api.collections.continueField(siteId, collection, id),
        alive,
        onRewritten: setRewritten,
      });
      setResult(current);
      if (current.done) setStep("done");
      else if (blocked(current, current.rewritten)) {
        setStuck({
          operationId: current.operationId,
          reverting: false,
          entries: current.unconvertible,
        });
        setStep("stuck");
      }
      await refresh();
    },
    [siteId, collection, refresh],
  );

  const run = useCallback(
    async (body: FieldOperationRequest) => {
      setError(undefined);
      setStep("running");
      try {
        await follow(await api.collections.fieldOperation(siteId, collection, body));
      } catch (e) {
        setError(e);
        setStep("report");
        await refresh();
      }
    },
    [siteId, collection, follow, refresh],
  );

  /** Picks up an operation that is still running (another tab, an agent's, a closed dialog). */
  const resume = useCallback(
    async (operationId: string) => {
      setError(undefined);
      setStep("running");
      try {
        await follow(await api.collections.continueField(siteId, collection, operationId));
      } catch (e) {
        setError(e);
        setStep("choose");
      }
    },
    [siteId, collection, follow],
  );

  const undo = useCallback(
    async (operationId: string, clear = false) => {
      setError(undefined);
      setStuck(undefined);
      setStep("reverting");
      try {
        const call = () => api.collections.revertField(siteId, collection, operationId, clear);
        let current = await call();
        for (let pass = 0; !current.done && pass < MAX_PASSES && alive.current; pass++) {
          if (blocked(current, current.restored + current.edited.length)) break;
          current = await call();
        }
        setRevert(current);
        if (current.done) setStep("reverted");
        else {
          setStuck({ operationId, reverting: true, entries: current.unconvertible });
          setStep("stuck");
        }
      } catch (e) {
        setError(e);
        setStep("done");
      }
      await refresh();
    },
    [siteId, collection, refresh],
  );

  /**
   * Finishes a stuck run or revert by dropping the values that no longer convert (`onInvalid:
   * "clear"`); the person confirmed it first.
   */
  const finishClearing = useCallback(
    async (s: Stuck) => {
      if (s.reverting) return undo(s.operationId, true);
      setError(undefined);
      setStuck(undefined);
      setStep("running");
      try {
        await follow(await api.collections.continueField(siteId, collection, s.operationId, true));
      } catch (e) {
        setError(e);
        setStuck(s);
        setStep("stuck");
      }
    },
    [siteId, collection, follow, undo],
  );

  /** Stops following (the dialog closed); the server keeps the operation resumable. */
  const stop = useCallback(() => {
    alive.current = false;
  }, []);

  return { ...steps.values, check, run, resume, undo, finishClearing, reset, stop };
}
export type FieldOperationState = ReturnType<typeof useFieldOperation>;
