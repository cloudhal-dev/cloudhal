/**
 * One run in detail (RFC-0008 §11.7, §15.1 History): its state and outcome, the error, the summary
 * the job or the agent wrote (plain text), the counts, and the findings of a built-in job — broken
 * links with their redirect proposals, stale articles, feed problems, the digest's sections — each
 * with its stable code in words. Text that came from visitors or a fetched document is marked and
 * shown as plain text only.
 */

import type { ScheduleRun } from "@cloudhal/core-contracts";
import { formatNumber } from "@cloudhal/messages/format";
import {
  Badge,
  InsetPanel,
  LayerDialog,
  Link,
  ScheduleStatusBadge,
  SectionEmpty,
  SkeletonLine,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { ShieldWarning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { RunFinding } from "../lib/api.ts";
import { formatWhen } from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { type ST, scheduleKeys, useScheduleWords, useSiteZone } from "./Schedules.tsx";

const CODES = [
  "broken-internal-link",
  "broken-media-reference",
  "broken-menu-target",
  "link-to-gated-content",
  "not-found-path",
  "stale-entry",
  "feed-unreachable",
  "feed-invalid",
  "feed-item-incomplete",
  "feed-future-date",
  "feed-missing-entry",
  "feed-gated-node",
  "feed-asset-not-live",
  "digest-published",
  "digest-scheduled",
  "digest-attention",
  "digest-open-findings",
  "stale-draft",
] as const;
type Code = (typeof CODES)[number];
const isCode = (c: string): c is Code => (CODES as readonly string[]).includes(c);

const SEVERITY = { error: "error", warning: "warning", info: "secondary" } as const;

/** Where a node is edited, from its id's prefix. */
function nodeHref(siteId: string, id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.startsWith("entry_")) return `/sites/${siteId}/articles/${id}`;
  if (id.startsWith("page_")) return `/sites/${siteId}/pages/${id}`;
  if (id.startsWith("term_")) return `/sites/${siteId}/taxonomy/${id}`;
  if (id.startsWith("rel_")) return `/sites/${siteId}/schedules/releases/${id}`;
  return undefined;
}

function FindingRow({ t, siteId, finding }: { t: ST; siteId: string; finding: RunFinding }) {
  const r = "schedules.history.run" as const;
  const code = isCode(finding.code) ? finding.code : "other";
  const href = nodeHref(siteId, finding.nodeId);
  // Everything below is data from the site or from visitors: plain text, never HTML or a link out.
  const lines = [finding.title, finding.path, finding.href, finding.url, finding.detail].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return (
    <div className="grid gap-1.5 py-3" data-finding={finding.code}>
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant={SEVERITY[finding.severity] ?? "secondary"}>
          {t(`${r}.severity.${finding.severity ?? "info"}`)}
        </Badge>
        <Text bold as="span">
          {t(`${r}.codes.${code}`)}
        </Text>
        {typeof finding.count === "number" && <Badge variant="outline">{finding.count}</Badge>}
        {finding.untrusted && (
          <Tooltip content={t(`${r}.untrustedHint`)}>
            <Badge variant="warning" icon={<ShieldWarning />}>
              {t(`${r}.untrusted`)}
            </Badge>
          </Tooltip>
        )}
      </span>
      {lines.map((line) => (
        <Text key={line} variant="secondary" size="sm" as="span">
          <span className="wrap-anywhere">{line}</span>
        </Text>
      ))}
      {(typeof finding.hits === "number" || typeof finding.ageDays === "number") && (
        <Text variant="secondary" size="sm" as="span">
          {typeof finding.hits === "number"
            ? t(`${r}.hits`, { count: finding.hits })
            : t(`${r}.age`, { count: finding.ageDays ?? 0 })}
        </Text>
      )}
      {finding.proposal && (
        <Text size="sm" as="span">
          {t(`${r}.proposal`, { path: finding.proposal.path })}
        </Text>
      )}
      {finding.items && finding.items.length > 0 && (
        <span className="grid gap-1">
          {finding.items.map((item) => {
            const link = nodeHref(siteId, item.id);
            return (
              <Text key={item.id} size="sm" as="span">
                {link ? <Link href={link}>{item.title}</Link> : item.title}
              </Text>
            );
          })}
        </span>
      )}
      {href && (
        <span>
          <Link href={href}>{t(`${r}.open`)}</Link>
        </span>
      )}
    </div>
  );
}

export function ScheduleRunDialog({
  siteId,
  run,
  title,
  onOpenChange,
}: {
  siteId: string;
  run: ScheduleRun | undefined;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale, words } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const detail = useQuery({
    queryKey: [...scheduleKeys.runs(siteId), "run", run?.id ?? ""],
    queryFn: () => schedulesApi.runs.get(siteId, run?.id ?? ""),
    enabled: run !== undefined,
  });
  const r = "schedules.history.run" as const;
  const d = detail.data;
  const shown = d?.run ?? run;
  const counts = Object.entries(shown?.counts ?? {}).filter(
    (e): e is [string, number] => typeof e[1] === "number",
  );
  return (
    <LayerDialog.Root open={run !== undefined} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t(`${r}.close`)}>
        <LayerDialog.Title>{t("schedules.history.detailsOf", { name: title })}</LayerDialog.Title>
        <LayerDialog.Description>
          {shown
            ? formatWhen(shown.startedAt ?? shown.occurrenceAt, locale, zone.timeZone, "long")
            : ""}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="run-detail">
            {shown && (
              <span className="flex flex-wrap items-center gap-2">
                <ScheduleStatusBadge
                  status={{ subject: "run", state: shown.state }}
                  words={words}
                />
                {shown.outcome && (
                  <Badge variant="outline">
                    {t(`schedules.history.row.outcome.${shown.outcome}`)}
                  </Badge>
                )}
                {shown.trigger && (
                  <Badge variant="outline">
                    {t(`schedules.history.row.trigger.${shown.trigger}`)}
                  </Badge>
                )}
              </span>
            )}
            {shown?.error && (
              <InsetPanel>
                <Text variant="secondary" size="xs" as="span">
                  {t(`${r}.error`)}
                </Text>
                <Text variant="mono">{shown.error.code}</Text>
                {shown.error.message && <Text size="sm">{shown.error.message}</Text>}
              </InsetPanel>
            )}
            {shown?.summary && (
              <InsetPanel variant="recessed">
                <Text variant="secondary" size="xs" as="span">
                  {t(`${r}.summary`)}
                </Text>
                {/* Written by a job or an agent: plain text only. */}
                <Text data-testid="run-summary">{shown.summary}</Text>
                <Text variant="secondary" size="xs" as="span">
                  {t(`${r}.summaryHint`)}
                </Text>
              </InsetPanel>
            )}
            {counts.length > 0 && (
              <div className="grid gap-2">
                <Text bold as="span">
                  {t(`${r}.counts`)}
                </Text>
                <span className="flex flex-wrap gap-1.5">
                  {counts.map(([key, n]) => (
                    <Badge key={key} variant="outline">
                      {isCode(key) ? t(`${r}.codes.${key}`) : key}: {formatNumber(locale, n)}
                    </Badge>
                  ))}
                </span>
              </div>
            )}
            <div className="grid gap-1">
              <Text bold as="span">
                {d && d.findings.length > 0
                  ? t(`${r}.findingsCount`, { count: d.findings.length })
                  : t(`${r}.findings`)}
              </Text>
              {detail.isPending ? (
                <div className="grid gap-2" role="status">
                  <span className="sr-only">{t(`${r}.loading`)}</span>
                  <SkeletonLine />
                  <SkeletonLine />
                </div>
              ) : !d || d.findings.length === 0 ? (
                <SectionEmpty title={t(`${r}.noFindings`)} />
              ) : (
                <div className="divide-y divide-kumo-hairline" data-testid="run-findings">
                  {d.findings.map((f, i) => (
                    // Findings have no id; their order is the job's and stable.
                    <FindingRow key={`${f.code}-${i}`} t={t} siteId={siteId} finding={f} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
