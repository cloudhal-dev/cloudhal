/**
 * The editors' schedule parts (RFC-0008 §15.1 Editors, §6.2, §7): the aside's "Schedule" card —
 * embargo ("Visible from…") and expiry ("Hide after…") in the site's zone, saved with the article
 * or page as UTC instants, and the releases it is in — and the banner on content a release holds:
 * "Locked: publishes 2 November 09:00" with "Unschedule and edit" and "Edit and re-approve" (or
 * "Edit and send for approval"). Loaded lazily with the `schedules` words, so neither the editors'
 * chunks nor the shell carry the schedule blocks.
 */
import type { Availability } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  DateTimeField,
  type DateTimeValue,
  LinkButton,
  SectionCard,
  SectionEmpty,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  CalendarCheck,
  LockSimple,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorCode, type ReleaseView } from "../lib/api.ts";
import {
  formatWhen,
  holdsOf,
  releaseAt,
  wallClockOf,
  whenInputOf,
  zonedToInstant,
} from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import {
  itemsLabel,
  problemText,
  scheduleKeys,
  useReleaseAbilities,
  useScheduleWords,
  useSiteZone,
} from "./Schedules.tsx";
import { useToast } from "./Toast.ts";

type Edge = "from" | "until";

/** The releases of a site (shared with the calendar's cache). */
function useReleases(siteId: string) {
  return useQuery({
    queryKey: scheduleKeys.releases(siteId),
    queryFn: () => schedulesApi.releases.list(siteId),
    retry: false,
  });
}

/** What a wall-clock value means as an instant, and whether the time is in a clock change. */
function instantOf(value: DateTimeValue | undefined, timeZone: string) {
  if (!value?.date || !value.time) return undefined;
  return zonedToInstant({ date: value.date, time: value.time }, timeZone);
}

/**
 * Availability as the person edits it: each gate as a wall-clock date and time in the site's zone.
 * `onChange` receives the contract's value (UTC instants), or `undefined` when no gate is left.
 */
export function ScheduleCard({
  siteId,
  nodeId,
  kind,
  availability,
  onChange,
  saveError,
  disabled: disabledProp,
  gatesOff,
}: {
  siteId: string;
  nodeId: string;
  kind: "contentEntry" | "page";
  availability: Availability | undefined;
  onChange: (next: Availability | undefined) => void;
  /** The editor's last save error: `gates_unsupported` and `invalid_availability` are worded here. */
  saveError?: unknown;
  disabled?: boolean;
  /** The site renderer has not confirmed it enforces gates (§7.7): the fields stay off. */
  gatesOff?: boolean;
}) {
  const disabled = disabledProp || gatesOff;
  const { t, locale, field } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const releases = useReleases(siteId);
  // Wall-clock drafts per gate: a half-typed time stays on screen until it can be read.
  const [values, setValues] = useState<Record<Edge, DateTimeValue | undefined>>({
    from: undefined,
    until: undefined,
  });
  const [shown, setShown] = useState<Record<Edge, boolean>>({ from: false, until: false });
  const fromAt = availability?.from;
  const untilAt = availability?.until;
  useEffect(() => {
    setValues({
      from: fromAt ? wallClockOf(fromAt, zone.timeZone) : undefined,
      until: untilAt ? wallClockOf(untilAt, zone.timeZone) : undefined,
    });
    setShown({ from: !!fromAt, until: !!untilAt });
  }, [fromAt, untilAt, zone.timeZone]);

  const emit = (next: Record<Edge, DateTimeValue | undefined>) => {
    const from = instantOf(next.from, zone.timeZone)?.at;
    const until = instantOf(next.until, zone.timeZone)?.at;
    const out: Availability = { ...(from ? { from } : {}), ...(until ? { until } : {}) };
    onChange(out.from || out.until ? out : undefined);
  };
  const set = (edge: Edge, value: DateTimeValue | undefined) => {
    const next = { ...values, [edge]: value };
    setValues(next);
    emit(next);
  };
  const c = "schedules.card" as const;
  const code = errorCode(saveError);
  const fromI = instantOf(values.from, zone.timeZone);
  const untilI = instantOf(values.until, zone.timeZone);
  const order = fromI && untilI && Date.parse(fromI.at) >= Date.parse(untilI.at);
  const gapText = (edge: Edge) => {
    const i = edge === "from" ? fromI : untilI;
    return i?.gap
      ? problemText(
          t,
          locale,
          { code: "gap", runsAt: i.gap.runsAt },
          {
            value: values[edge],
            timeZone: zone.timeZone,
          },
        )
      : undefined;
  };
  const now = Date.now();
  const state =
    fromAt && Date.parse(fromAt) > now
      ? t(`${c}.state.embargoed`, { time: formatWhen(fromAt, locale, zone.timeZone) })
      : untilAt
        ? Date.parse(untilAt) > now
          ? t(`${c}.state.expires`, { time: formatWhen(untilAt, locale, zone.timeZone) })
          : t(`${c}.state.expired`, { time: formatWhen(untilAt, locale, zone.timeZone) })
        : undefined;

  const mine = (releases.data ?? []).filter(
    (r) =>
      (r.state === "draft" ||
        r.state === "awaiting_approval" ||
        r.state === "scheduled" ||
        r.state === "running") &&
      r.items.some((i) => i.nodeId === nodeId),
  );

  const gate = (edge: Edge) => {
    const g = `${c}.${edge}` as const;
    if (!shown[edge])
      return (
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            disabled={disabled}
            onClick={() => {
              setShown((s) => ({ ...s, [edge]: true }));
              setValues((v) => ({ ...v, [edge]: { time: "09:00" } }));
            }}
            data-add-gate={edge}
          >
            {t(`${g}.add`)}
          </Button>
        </div>
      );
    return (
      <div className="grid gap-2" data-gate={edge}>
        <DateTimeField
          label={t(`${g}.label`)}
          description={t(`${g}.description`)}
          value={values[edge]}
          onChange={(v) => set(edge, v)}
          locale={locale}
          timeZone={zone.timeZone}
          zoneLabel={zone.zoneLabel}
          hourCycle={zone.hourCycle}
          labels={field}
          today={zone.today}
          error={edge === "until" && order ? t("schedules.field.problems.order") : gapText(edge)}
          disabled={disabled}
          className="w-full"
        />
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash />}
            disabled={disabled}
            onClick={() => {
              setShown((s) => ({ ...s, [edge]: false }));
              set(edge, undefined);
            }}
          >
            {t(`${c}.remove`)}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <SectionCard
      title={t(`${c}.title`)}
      icon={<CalendarCheck size={16} />}
      description={t(`${c}.description`, { zone: zone.zoneLabel })}
      actions={
        state ? (
          <Badge variant={fromAt && Date.parse(fromAt) > now ? "info" : "secondary"}>{state}</Badge>
        ) : undefined
      }
    >
      <div className="grid gap-5" data-testid="schedule-card">
        {gatesOff && (
          <Banner
            variant="secondary"
            size="sm"
            icon={<WarningCircle weight="fill" />}
            title={t(`${c}.gatesOff.title`)}
            description={t(`${c}.gatesOff.description`)}
          />
        )}
        {(code === "gates_unsupported" || code === "invalid_availability") && (
          <Banner
            variant={code === "gates_unsupported" ? "alert" : "error"}
            size="sm"
            icon={<WarningCircle weight="fill" />}
            title={t(`${c}.errors.${code}.title`)}
            description={t(`${c}.errors.${code}.description`)}
          />
        )}
        {gate("from")}
        {gate("until")}
        <Text variant="secondary" size="sm">
          {kind === "page" ? t(`${c}.saveHintPage`) : t(`${c}.saveHint`)}
        </Text>
        <div className="grid gap-2 border-kumo-hairline border-t pt-4">
          <Text bold as="span">
            {t(`${c}.releases.title`)}
          </Text>
          {mine.length === 0 ? (
            <SectionEmpty title={t(`${c}.releases.none`)} />
          ) : (
            <div className="grid divide-y divide-kumo-hairline" data-testid="node-releases">
              {mine.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Text size="sm" as="span">
                    {r.state === "draft"
                      ? t(`${c}.releases.draft`)
                      : r.state === "awaiting_approval"
                        ? t(`${c}.releases.waiting`, {
                            time: releaseAt(r)
                              ? formatWhen(releaseAt(r) as string, locale, zone.timeZone)
                              : "—",
                          })
                        : t(`${c}.releases.publishes`, {
                            time: releaseAt(r)
                              ? formatWhen(releaseAt(r) as string, locale, zone.timeZone)
                              : "—",
                          })}
                  </Text>
                  <LinkButton
                    href={`/sites/${siteId}/schedules/releases/${r.id}`}
                    variant="ghost"
                    size="sm"
                    icon={ArrowRight}
                  >
                    {t(`${c}.releases.open`)}
                  </LinkButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/**
 * The banner on held content (§6.2): it publishes exactly as pinned, so edits are refused until the
 * release is unscheduled or the person edits and approves it again. Reports the lock to the editor,
 * which keeps its fields read-only meanwhile.
 */
export function LockedBanner({
  siteId,
  nodeId,
  dirty,
  onLockChange,
}: {
  siteId: string;
  nodeId: string;
  dirty: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const { t, locale } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const releases = useReleases(siteId);
  const hold: ReleaseView | undefined = holdsOf(releases.data ?? [], nodeId)[0];
  const abilities = useReleaseAbilities(hold);
  // "Edit and re-approve": the release this edit will be re-approved into, once saved.
  const [editing, setEditing] = useState<ReleaseView | undefined>();
  const locked = hold !== undefined && editing === undefined;
  useEffect(() => onLockChange(locked), [locked, onLockChange]);
  const refresh = () => qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });

  const unschedule = useMutation({
    mutationFn: (input: { release: ReleaseView; reapprove: boolean }) =>
      schedulesApi.releases.unschedule(siteId, input.release.id, input.release.rev),
    onSuccess: async (result, input) => {
      await refresh();
      if (input.reapprove) setEditing({ ...input.release, ...result.release } as ReleaseView);
      else
        toast.success(t("schedules.lock.unscheduled"), t("schedules.lock.unscheduledDescription"));
    },
    onError: (e) =>
      toast.error(t("schedules.actions.failed"), e instanceof Error ? e.message : String(e)),
  });
  const reapprove = useMutation({
    mutationFn: async (release: ReleaseView) => {
      const fresh = await schedulesApi.releases.get(siteId, release.id);
      const repinned = await schedulesApi.releases.repin(
        siteId,
        fresh.id,
        fresh.rev,
        abilities.approve,
      );
      // A person who may not approve: the draft goes back to its time as a request.
      if (repinned.release.state === "draft") {
        const when = whenInputOf(fresh.when);
        if (when)
          return schedulesApi.releases.schedule(siteId, fresh.id, repinned.release.rev, when);
      }
      return repinned;
    },
    onSuccess: async (result) => {
      setEditing(undefined);
      await refresh();
      const at = result.release.when?.kind === "at" ? result.release.when.at : undefined;
      toast.success(
        result.release.state === "scheduled"
          ? t("schedules.lock.editing.done", {
              time: at ? formatWhen(at, locale, zone.timeZone) : "",
            })
          : t("schedules.lock.editing.sent"),
      );
    },
    onError: (e) =>
      toast.error(t("schedules.actions.failed"), e instanceof Error ? e.message : String(e)),
  });

  const l = "schedules.lock" as const;
  if (editing) {
    const at =
      editing.when?.kind === "at" ? formatWhen(editing.when.at, locale, zone.timeZone) : "";
    return (
      <div role="status" data-testid="lock-editing">
        <Banner
          variant="default"
          icon={<PencilSimple weight="fill" />}
          title={t(`${l}.editing.title`)}
          description={
            dirty
              ? t(`${l}.editing.saveFirst`)
              : abilities.approve
                ? t(`${l}.editing.description`, { time: at })
                : t(`${l}.editing.descriptionRequest`, { time: at })
          }
          action={
            <Banner.Action
              variant="primary"
              loading={reapprove.isPending}
              disabled={dirty}
              onClick={() => reapprove.mutate(editing)}
            >
              {abilities.approve ? t(`${l}.editing.reapprove`) : t(`${l}.editing.send`)}
            </Banner.Action>
          }
        />
      </div>
    );
  }
  if (!hold) return null;
  const at = releaseAt(hold);
  const name = hold.title ?? itemsLabel(t, hold.items.length);
  return (
    <div role="status" data-testid="locked-banner">
      <Banner
        variant="alert"
        icon={<LockSimple weight="fill" />}
        title={
          hold.when?.kind === "on-approval"
            ? t(`${l}.titleOnApproval`)
            : hold.state === "awaiting_approval"
              ? t(`${l}.titleWaiting`, { time: at ? formatWhen(at, locale, zone.timeZone) : "" })
              : t(`${l}.title`, { time: at ? formatWhen(at, locale, zone.timeZone) : "" })
        }
        description={t(`${l}.description`, { release: name })}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Banner.Action
              variant="secondary"
              loading={unschedule.isPending && !unschedule.variables?.reapprove}
              disabled={!abilities.write || hold.state === "running"}
              onClick={() => unschedule.mutate({ release: hold, reapprove: false })}
              data-testid="unschedule-and-edit"
            >
              {t(`${l}.unschedule`)}
            </Banner.Action>
            <Banner.Action
              variant="secondary"
              loading={unschedule.isPending && unschedule.variables?.reapprove}
              disabled={!abilities.write || hold.state === "running"}
              onClick={() => unschedule.mutate({ release: hold, reapprove: true })}
              data-testid="edit-and-reapprove"
            >
              {abilities.approve ? t(`${l}.reapprove`) : t(`${l}.sendForApproval`)}
            </Banner.Action>
            <LinkButton
              href={`/sites/${siteId}/schedules/releases/${hold.id}`}
              variant="ghost"
              size="sm"
              icon={ArrowRight}
            >
              {t(`${l}.open`)}
            </LinkButton>
          </span>
        }
      />
    </div>
  );
}
