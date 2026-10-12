/**
 * The editors' doors to schedules (RFC-0008 §15.1 Editors): a "Schedule…" button next to Publish,
 * the aside's Schedule card and the locked banner. Everything behind them — the dialog, the card,
 * the banner, the schedule blocks and the `schedules` words — loads lazily, on servers that have
 * schedules only, so an editor's own chunk and the shell carry none of it.
 */
import type { Availability, PublishStatus } from "@cloudhal/core-contracts";
import { Button, SkeletonLine } from "@cloudhal/ui";
import { CalendarPlus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useT, withMessages } from "../i18n/index.tsx";
import { api, errorCode } from "../lib/api.ts";

const loadParts = () => withMessages(import("./ScheduleCard.tsx"), ["schedules"]);
const loadDialog = () => withMessages(import("./ScheduleDialog.tsx"), ["schedules"]);
const LazyCard = lazy(() => loadParts().then((m) => ({ default: m.ScheduleCard })));
const LazyBanner = lazy(() => loadParts().then((m) => ({ default: m.LockedBanner })));
const LazyDialog = lazy(() => loadDialog().then((m) => ({ default: m.ScheduleDialog })));

/** Whether this server has schedules (and enforces time gates), from the cached `/api/instance`. */
export function useSchedulesFeature() {
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const f = instance.data?.features.schedules;
  return { available: f?.available === true, gates: f?.available === true && f.gates };
}

/** A save error the Schedule card words itself (the editor's banner leaves it out). */
export function isScheduleError(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === "gates_unsupported" || code === "invalid_availability" || code === "scheduled_locked"
  );
}

/** "Schedule…" next to Publish, and its dialog (loaded on the first hover or click). */
export function ScheduleAction({
  siteId,
  node,
  dirty,
  prepare,
  disabled,
  reason,
}: {
  siteId: string;
  node: { id: string; kind: "contentEntry" | "page"; title: string; status: PublishStatus };
  dirty: boolean;
  prepare: () => unknown;
  disabled?: boolean;
  reason?: string | undefined;
}) {
  const t = useT();
  const feature = useSchedulesFeature();
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  if (!feature.available) return null;
  return (
    <>
      <Button
        variant="secondary"
        icon={<CalendarPlus />}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        disabled={disabled}
        title={reason}
        data-testid="schedule-action"
      >
        {t("editor.schedule")}
      </Button>
      {/* Mounted on the first click (it brings its own chunk), then always rendered and
          controlled by `open`, so it opens and closes with Kumo's animation. */}
      {wanted ? (
        <Suspense fallback={null}>
          <LazyDialog
            siteId={siteId}
            open={open}
            onOpenChange={setOpen}
            nodes={[node]}
            dirty={dirty}
            prepare={prepare}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** The aside's Schedule card (embargo, expiry, the releases it is in). */
export function ScheduleAside(props: {
  siteId: string;
  nodeId: string;
  kind: "contentEntry" | "page";
  availability: Availability | undefined;
  onChange: (next: Availability | undefined) => void;
  saveError?: unknown;
  disabled?: boolean;
}) {
  const feature = useSchedulesFeature();
  // Gates need the site renderer's handshake (RFC-0008 §7.7): without it the card says why the
  // fields are off.
  if (!feature.available) return null;
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 px-5 py-4" aria-hidden>
          <SkeletonLine minWidth={30} maxWidth={50} />
          <SkeletonLine minWidth={60} maxWidth={90} />
        </div>
      }
    >
      <LazyCard {...props} gatesOff={!feature.gates} />
    </Suspense>
  );
}

/** The locked banner on content a release holds; reports the lock so the form stays read-only. */
export function ScheduleLock(props: {
  siteId: string;
  nodeId: string;
  dirty: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const feature = useSchedulesFeature();
  if (!feature.available) return null;
  return (
    <Suspense fallback={null}>
      <LazyBanner {...props} />
    </Suspense>
  );
}
