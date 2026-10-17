/**
 * "Schedule…" (RFC-0008 §15.1 Editors, §6.1): pins articles and pages in a release and schedules it
 * for a time in the site's zone, or for "as soon as it's approved". Opened from the editors next to
 * Publish (lazily: nothing here reaches the editor or the shell chunk) and from the calendar's
 * "New schedule ▾". The person approves it as they schedule it when their role publishes it, else
 * it waits in Approvals; what the items need that is not live yet joins them (the closure).
 */
import type { PublishStatus } from "@cloudhal/core-contracts";
import {
  Banner,
  Combobox,
  DateTimeField,
  type DateTimeValue,
  Input,
  InsetPanel,
  LayerDialog,
  Radio,
  Text,
} from "@cloudhal/ui";
import {
  Article,
  CheckCircle,
  FileText,
  HandPalm,
  Info,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, errorCode, type ReleaseResult } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import {
  formatWhen,
  localDateTime,
  MIN_LEAD_MINUTES,
  whenProblem,
  zonedToInstant,
} from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { problemText, scheduleKeys, useScheduleWords, useSiteZone } from "./Schedules.tsx";
import { useToast } from "./Toast.ts";
import { useCan } from "./useMe.ts";

/** An article or page to schedule. */
export interface ScheduleNode {
  id: string;
  kind: "contentEntry" | "page";
  title: string;
  status?: PublishStatus;
}

export interface ScheduleDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** From an editor: what is scheduled. Without it the dialog offers a picker. */
  nodes?: readonly ScheduleNode[] | undefined;
  /** `release` asks for a title (several items, "New release…"). */
  mode?: "publish" | "release";
  /** The editor has unsaved changes (they are saved first, by `prepare`). */
  dirty?: boolean | undefined;
  /** Editors: save unsaved changes and mark the node Published in the working copy, first. */
  prepare?: (() => unknown) | undefined;
  onScheduled?: ((result: ReleaseResult) => void) | undefined;
}

interface Option {
  value: string;
  label: string;
  kind: ScheduleNode["kind"];
  detail: string;
}

/** Tomorrow at 09:00 in the site's zone: a sensible first guess. */
function firstGuess(today: string): DateTimeValue {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { date: d.toISOString().slice(0, 10), time: "09:00" };
}

export function ScheduleDialog({
  siteId,
  open,
  onOpenChange,
  nodes,
  mode = "publish",
  dirty,
  prepare,
  onScheduled,
}: ScheduleDialogProps) {
  const { t, locale, field } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const approveAny = useCan("releases.approveAny");
  const approveOwn = useCan("releases.approve");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const horizonDays = instance.data?.features.schedules?.limits.horizonDays ?? 366;
  const [when, setWhen] = useState<"at" | "on-approval">("at");
  const [value, setValue] = useState<DateTimeValue>(() => firstGuess(zone.today));
  const [picked, setPicked] = useState<Option[]>([]);
  const [title, setTitle] = useState("");
  const [attempted, setAttempted] = useState(false);
  // Starts over each time it opens, never while open (the site arriving must not wipe the form).
  const today = useRef(zone.today);
  today.current = zone.today;
  useEffect(() => {
    if (!open) return;
    setWhen("at");
    setValue(firstGuess(today.current));
    setPicked([]);
    setTitle("");
    setAttempted(false);
  }, [open]);

  // The picker's options: articles and pages (only when no node was given).
  const choose = !nodes || nodes.length === 0;
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: open && choose,
  });
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: open && choose,
  });
  const options: Option[] = [
    ...(entries.data ?? []).map((e) => ({
      value: e.id,
      label: e.title || e.slug,
      kind: "contentEntry" as const,
      detail: `/${e.collection}/${e.slug}`,
    })),
    ...(pages.data ?? []).map((p) => ({
      value: p.id,
      label: p.title || p.path,
      kind: "page" as const,
      detail: p.path,
    })),
  ];
  const chosen: ScheduleNode[] = choose
    ? picked.map((o) => ({ id: o.value, kind: o.kind, title: o.label }))
    : [...nodes];

  const problem =
    when === "at"
      ? whenProblem(value, zone.timeZone, { leadMinutes: MIN_LEAD_MINUTES, horizonDays })
      : undefined;
  const blocking = problem && problem.code !== "gap";
  const fieldError =
    problem && (attempted || problem.code !== "incomplete")
      ? problemText(t, locale, problem, { value, timeZone: zone.timeZone })
      : undefined;
  const needsNodes = chosen.length === 0;
  const selfApproves = approveAny || approveOwn;
  const draft = chosen.find(
    (n) => n.kind === "contentEntry" && n.status && n.status !== "published",
  );

  const schedule = useMutation({
    mutationFn: async () => {
      await prepare?.();
      const created = await schedulesApi.releases.create(siteId, {
        nodeIds: chosen.map((n) => n.id),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      try {
        const result = await schedulesApi.releases.schedule(
          siteId,
          created.release.id,
          created.release.rev,
          when === "on-approval"
            ? "on-approval"
            : {
                localTime: localDateTime({ date: value.date ?? "", time: value.time ?? "" }),
                timeZone: zone.timeZone,
              },
        );
        return { result, closureAdded: created.closureAdded };
      } catch (e) {
        // Don't leave a draft nobody asked for behind.
        await schedulesApi.releases
          .cancel(siteId, created.release.id, created.release.rev)
          .catch(() => undefined);
        throw e;
      }
    },
    onSuccess: async ({ result, closureAdded }) => {
      onOpenChange(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) }),
        qc.invalidateQueries({ queryKey: ["approvals", siteId] }),
      ]);
      onScheduled?.(result);
      const s = "schedules.scheduleDialog" as const;
      const at =
        when === "at" && value.date && value.time
          ? formatWhen(
              zonedToInstant({ date: value.date, time: value.time }, zone.timeZone).at,
              locale,
              zone.timeZone,
            )
          : "";
      const closure =
        closureAdded.length === 0
          ? undefined
          : closureAdded.length === 1
            ? t(`${s}.closureAddedOne`)
            : t(`${s}.closureAdded`, { count: closureAdded.length });
      const waiting =
        result.status === "approval-pending" || result.release.state === "awaiting_approval";
      toast.notice({
        id: `scheduled:${result.release.id}`,
        title: waiting
          ? t(`${s}.requested`)
          : when === "at"
            ? t(`${s}.scheduled`, { time: at })
            : t(`${s}.scheduledOnApproval`),
        description: [waiting ? t(`${s}.requestedDescription`) : undefined, closure]
          .filter(Boolean)
          .join(" "),
        tone: "info",
        actions: [
          {
            label: t(`${s}.openRelease`),
            onClick: () =>
              void navigate({
                to: "/sites/$siteId/schedules/releases/$releaseId",
                params: { siteId, releaseId: result.release.id },
              }),
          },
        ],
      });
    },
  });

  const submit = () => {
    setAttempted(true);
    if (needsNodes || blocking) return;
    schedule.mutate();
  };
  const code = errorCode(schedule.error);
  const s = "schedules.scheduleDialog" as const;
  const knownError =
    code === "nothing_to_publish" || code === "scheduled_locked" || code === "too_far_for_request"
      ? t(`${s}.errors.${code}`)
      : undefined;

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={schedule.isPending}>
      <LayerDialog.Content size="base" closeLabel={t(`${s}.close`)}>
        <LayerDialog.Title>
          {mode === "release" ? t(`${s}.titleRelease`) : t(`${s}.title`)}
        </LayerDialog.Title>
        <LayerDialog.Description>{t(`${s}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="schedule-dialog">
            {choose ? (
              <div data-testid="schedule-nodes">
                <Combobox
                  items={options}
                  multiple
                  value={picked}
                  onValueChange={(v) => setPicked((v as Option[] | null) ?? [])}
                  isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
                  itemToStringLabel={(o: Option) => o.label}
                  label={t(`${s}.nodes.label`)}
                  error={attempted && needsNodes ? t(`${s}.nodes.required`) : undefined}
                >
                  <Combobox.TriggerMultipleWithInput
                    placeholder={t(`${s}.nodes.placeholder`)}
                    renderItem={(o: Option) => (
                      <Combobox.Chip key={o.value} removeLabel={t(`${s}.nodes.clear`)}>
                        {o.label}
                      </Combobox.Chip>
                    )}
                  />
                  <Combobox.Content>
                    <Combobox.Empty>{t(`${s}.nodes.empty`)}</Combobox.Empty>
                    <Combobox.List>
                      {(o: Option) => (
                        <Combobox.Item key={o.value} value={o}>
                          <span className="flex min-w-0 items-center gap-2" data-option={o.value}>
                            {o.kind === "page" ? (
                              <FileText size={16} className="shrink-0 text-kumo-subtle" />
                            ) : (
                              <Article size={16} className="shrink-0 text-kumo-subtle" />
                            )}
                            <span className="min-w-0 truncate">{o.label}</span>
                            <Text variant="mono-secondary" as="span" truncate>
                              {o.detail}
                            </Text>
                          </span>
                        </Combobox.Item>
                      )}
                    </Combobox.List>
                  </Combobox.Content>
                </Combobox>
              </div>
            ) : (
              <InsetPanel label={t(`${s}.items`)}>
                <Text variant="secondary" size="sm" as="span">
                  {t(`${s}.items`)}
                </Text>
                <div className="grid gap-1.5" data-testid="schedule-items">
                  {chosen.map((n) => (
                    <span key={n.id} className="flex min-w-0 items-center gap-2">
                      {n.kind === "page" ? (
                        <FileText size={16} className="shrink-0 text-kumo-subtle" />
                      ) : (
                        <Article size={16} className="shrink-0 text-kumo-subtle" />
                      )}
                      <Text as="span" bold truncate>
                        {n.title}
                      </Text>
                    </span>
                  ))}
                </div>
              </InsetPanel>
            )}
            {mode === "release" && (
              <Input
                className="w-full"
                label={t(`${s}.titleField.label`)}
                description={t(`${s}.titleField.hint`)}
                placeholder={t(`${s}.titleField.placeholder`)}
                value={title}
                maxLength={200}
                onValueChange={setTitle}
              />
            )}
            <Radio.Group
              appearance="card"
              value={when}
              onValueChange={(v) => setWhen(v === "on-approval" ? "on-approval" : "at")}
            >
              <Radio.Legend>{t(`${s}.when.legend`)}</Radio.Legend>
              <Radio.Item
                value="at"
                label={t(`${s}.when.at`)}
                description={t(`${s}.when.atHint`)}
              />
              <Radio.Item
                value="on-approval"
                label={t(`${s}.when.onApproval`)}
                description={t(`${s}.when.onApprovalHint`)}
              />
            </Radio.Group>
            {when === "at" && (
              <DateTimeField
                label={t(`${s}.field`)}
                value={value}
                onChange={setValue}
                locale={locale}
                timeZone={zone.timeZone}
                zoneLabel={zone.zoneLabel}
                hourCycle={zone.hourCycle}
                labels={field}
                error={fieldError}
                min={zone.today}
                today={zone.today}
                className="w-full"
              />
            )}
            <Text variant="secondary" size="sm">
              {t(`${s}.closure`)}
            </Text>
            {draft && (
              <Banner
                variant="secondary"
                size="sm"
                icon={<Info weight="fill" />}
                description={t(`${s}.draft`)}
              />
            )}
            {dirty && (
              <Banner
                variant="secondary"
                size="sm"
                icon={<Info weight="fill" />}
                description={t(`${s}.dirty`)}
              />
            )}
            <div data-approval-effect={selfApproves ? "self" : "request"}>
              {selfApproves ? (
                <Banner
                  size="sm"
                  icon={<CheckCircle weight="fill" />}
                  description={t(`${s}.approvalSelf`)}
                />
              ) : (
                <Banner
                  variant="alert"
                  size="sm"
                  icon={<HandPalm weight="fill" />}
                  description={t(`${s}.approvalRequest`)}
                />
              )}
            </div>
            {schedule.error && (
              <Banner
                variant="error"
                icon={<WarningCircle weight="fill" />}
                title={t(`${s}.failed`)}
                description={knownError ?? apiErrorText(t, schedule.error)}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t(`${s}.cancel`)}>
          <LayerDialog.Actions.Primary
            loading={schedule.isPending}
            onClick={submit}
            data-testid="schedule-confirm"
          >
            {selfApproves ? t(`${s}.confirm`) : t(`${s}.confirmRequest`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

export default ScheduleDialog;
