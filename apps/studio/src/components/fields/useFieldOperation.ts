import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  api,
  type FieldOperationRequest,
  type FieldOperationResult,
  type FieldRevertResult,
} from "../../lib/api.ts";

/** Where an operation dialog is: choosing, checked (dry run), running, finished, reverted. */
export type OperationStep =
  | "choose"
  | "checking"
  | "report"
  | "running"
  | "done"
  | "reverting"
  | "reverted";

/** How many continue calls one run may make before it stops asking (a stuck server). */
const MAX_PASSES = 200;

/**
 * One field operation's lifecycle (RFC-0041 §6): the dry run, the run with `?continue=` until
 * `done`, and the revert called again while it is not done. Each step keeps the last answer; a
 * failure keeps the step it happened in and sets `error`.
 */
export function useFieldOperation(siteId: string, collection: string) {
  const qc = useQueryClient();
  const [step, setStep] = useState<OperationStep>("choose");
  const [report, setReport] = useState<FieldOperationResult>();
  const [result, setResult] = useState<FieldOperationResult>();
  const [revert, setRevert] = useState<FieldRevertResult>();
  const [rewritten, setRewritten] = useState(0);
  const [error, setError] = useState<unknown>();
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["site", siteId] }),
      qc.invalidateQueries({ queryKey: ["collections", siteId] }),
      qc.invalidateQueries({ queryKey: ["entries", siteId] }),
      qc.invalidateQueries({ queryKey: ["entry", siteId] }),
    ]);
  }, [qc, siteId]);

  const reset = useCallback(() => {
    alive.current = true;
    setStep("choose");
    setReport(undefined);
    setResult(undefined);
    setRevert(undefined);
    setRewritten(0);
    setError(undefined);
  }, []);

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

  /** Continues `first` until it is done. */
  const follow = useCallback(
    async (first: FieldOperationResult) => {
      let current = first;
      let total = first.rewritten;
      setRewritten(total);
      for (let pass = 0; !current.done && pass < MAX_PASSES && alive.current; pass++) {
        current = await api.collections.continueField(siteId, collection, current.operationId);
        total += current.rewritten;
        setRewritten(total);
      }
      setResult(current);
      if (current.done) setStep("done");
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
    async (operationId: string) => {
      setError(undefined);
      setStep("reverting");
      try {
        let current = await api.collections.revertField(siteId, collection, operationId);
        for (let pass = 0; !current.done && pass < MAX_PASSES && alive.current; pass++)
          current = await api.collections.revertField(siteId, collection, operationId);
        setRevert(current);
        setStep("reverted");
      } catch (e) {
        setError(e);
        setStep("done");
      }
      await refresh();
    },
    [siteId, collection, refresh],
  );

  /** Stops following (the dialog closed); the server keeps the operation resumable. */
  const stop = useCallback(() => {
    alive.current = false;
  }, []);

  return { step, report, result, revert, rewritten, error, check, run, resume, undo, reset, stop };
}
export type FieldOperationState = ReturnType<typeof useFieldOperation>;
