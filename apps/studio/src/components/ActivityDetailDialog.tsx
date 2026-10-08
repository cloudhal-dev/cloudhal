import { Banner, InlineCopyText, LayerDialog, LinkButton, Text } from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { GitDiff, HandPalm, Lightning, Prohibit } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import { useI18n } from "../i18n/index.tsx";
import { absoluteTime, formatInput, relativeTime } from "../lib/activity.ts";
import { autoApprovalCount, isAutoApproved } from "../lib/agents.ts";
import type { AuditRow } from "../lib/api.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { ActorCell, DecisionCell, Outcome, useToolLabel } from "./Audit.tsx";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt>
        <Text variant="secondary" size="sm" as="span">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * One audit event in a `LayerDialog` (bottom sheet on phones): why the policy decided what it
 * did, who asked, what came of it, and the exact tool input.
 */
export function ActivityDetailDialog({
  siteId,
  row: current,
  onOpenChange,
}: {
  siteId: string;
  /** The event to show; `undefined` closes the dialog (it stays mounted to animate). */
  row: AuditRow | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  // Keep showing the last event while the dialog animates closed.
  const last = useRef(current);
  if (current) last.current = current;
  const row = current ?? last.current;
  const label = useToolLabel();
  const input = row ? formatInput(row.input) : undefined;
  const autoApproved = row ? isAutoApproved(row) : false;
  const autoCount = autoApprovalCount(row?.reason);
  return (
    <LayerDialog.Root open={current !== undefined} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{row ? label(row.tool) : ""}</LayerDialog.Title>
        <LayerDialog.Description>
          {row
            ? `${t("activity.detail.event", { id: row.id })} · ${relativeTime(row.at, locale)}`
            : ""}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {row && (
            <div className="grid gap-5" data-testid="activity-detail">
              {autoApproved && (
                <Banner
                  variant="alert"
                  icon={<Lightning weight="fill" />}
                  title={t("activity.autoApprovedTitle")}
                  description={
                    autoCount === undefined
                      ? t("activity.autoApprovedDescription")
                      : t("activity.autoApprovedDescriptionCount", { count: autoCount })
                  }
                />
              )}
              {row.reason && row.decision !== "allow" && (
                <Banner
                  variant={row.decision === "deny" ? "error" : "alert"}
                  icon={
                    row.decision === "deny" ? (
                      <Prohibit weight="fill" />
                    ) : (
                      <HandPalm weight="fill" />
                    )
                  }
                  title={t(`activity.decisions.${row.decision}`)}
                  description={row.reason}
                />
              )}
              <dl className="grid divide-y divide-kumo-hairline">
                <Row label={t("activity.detail.when")}>
                  <Text as="span">{absoluteTime(row.at, locale)}</Text>
                </Row>
                <Row label={t("activity.detail.actor")}>
                  <div className="grid gap-1">
                    <ActorCell actor={row.actor} />
                    <InlineCopyText>{row.actor.id}</InlineCopyText>
                  </div>
                </Row>
                <Row label={t("activity.columns.tool")}>
                  <Text variant="mono" as="span">
                    {row.tool}
                  </Text>
                </Row>
                {row.mode && row.actor.kind === "agent" && (
                  <Row label={t("activity.detail.mode")}>
                    <div className="grid gap-1">
                      <ModeBadge mode={row.mode} />
                      <Text variant="secondary" size="sm">
                        {t("activity.detail.modeHint")}
                      </Text>
                    </div>
                  </Row>
                )}
                <Row label={t("activity.detail.decision")}>
                  <DecisionCell row={row} />
                </Row>
                {row.reason && row.decision === "allow" && !autoApproved && (
                  <Row label={t("activity.detail.reason")}>
                    <Text as="span">{row.reason}</Text>
                  </Row>
                )}
                <Row label={t("activity.detail.outcome")}>
                  <Outcome outcome={row.outcome} />
                </Row>
                {row.skill && (
                  <Row label={t("activity.detail.skill")}>
                    <Text variant="mono" as="span">
                      {row.skill}
                    </Text>
                  </Row>
                )}
                {row.durationMs !== undefined && (
                  <Row label={t("activity.detail.duration")}>
                    <Text as="span">
                      {t("activity.detail.durationValue", { ms: row.durationMs })}
                    </Text>
                  </Row>
                )}
                {row.snapshotId && (
                  <Row label={t("activity.detail.snapshot")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <InlineCopyText>{row.snapshotId}</InlineCopyText>
                      <LinkButton
                        href={`/sites/${siteId}/snapshots?diff=${row.snapshotId}`}
                        variant="secondary"
                        size="sm"
                        icon={GitDiff}
                        onClick={() => onOpenChange(false)}
                      >
                        {t("activity.detail.viewChanges")}
                      </LinkButton>
                    </div>
                  </Row>
                )}
              </dl>
              <div className="grid min-w-0 gap-2">
                <Text bold as="span">
                  {t("activity.detail.input")}
                </Text>
                {input ? (
                  <div className="max-h-80 min-w-0 overflow-auto">
                    <CodeHighlighted code={input} lang="json" showCopyButton />
                  </div>
                ) : (
                  <Text variant="secondary">{t("activity.detail.noInput")}</Text>
                )}
              </div>
            </div>
          )}
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
