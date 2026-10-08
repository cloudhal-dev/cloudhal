import {
  Badge,
  Banner,
  InlineCopyText,
  LayerDialog,
  LinkButton,
  SkeletonLine,
  Surface,
  Text,
} from "@cloudhal/ui";
import {
  GitDiff,
  Minus,
  PencilSimple,
  Plus,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef } from "react";
import { useI18n } from "../i18n/index.tsx";
import { absoluteTime } from "../lib/activity.ts";
import { type Approval, api } from "../lib/api.ts";
import { argument, publishDiffRange } from "../lib/approvals.ts";
import { useToolLabel } from "./Audit.tsx";

function Fact({ label, children }: { label: string; children: ReactNode }) {
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

/** Live version vs newest snapshot, labelled as an approximation (there is no pending-changes API). */
function PublishChanges({ siteId, active }: { siteId: string; active: boolean }) {
  const { t } = useI18n();
  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: active,
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
    enabled: active,
  });
  const range = publishDiffRange(site.data, snapshots.data);
  const diff = useQuery({
    queryKey: [
      "diff",
      siteId,
      range?.kind === "range" ? range.from : "",
      range?.kind === "range" ? range.to : "",
    ],
    queryFn: () =>
      range?.kind === "range"
        ? api.snapshots.diff(siteId, range.from, range.to)
        : Promise.reject(new Error("no range")),
    enabled: active && range?.kind === "range",
  });
  return (
    <div className="grid gap-2" data-testid="publish-changes">
      <Text bold as="span">
        {t("approvals.confirm.changes")}
      </Text>
      {!range || (range.kind === "range" && diff.isPending) ? (
        <SkeletonLine minWidth={40} maxWidth={60} />
      ) : range.kind === "first" ? (
        <Text variant="secondary">{t("approvals.confirm.first")}</Text>
      ) : range.kind === "up-to-date" ? (
        <Text variant="secondary">{t("approvals.confirm.upToDate")}</Text>
      ) : diff.data ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" icon={<Plus />}>
            {t("diff.counts.added", { count: diff.data.added.length })}
          </Badge>
          <Badge variant="warning" icon={<PencilSimple />}>
            {t("diff.counts.changed", { count: diff.data.changed.length })}
          </Badge>
          <Badge variant="error" icon={<Minus />}>
            {t("diff.counts.removed", { count: diff.data.removed.length })}
          </Badge>
          <LinkButton
            href={`/sites/${siteId}/snapshots?diff=${range.to}`}
            variant="ghost"
            size="sm"
            icon={GitDiff}
          >
            {t("approvals.confirm.viewChanges")}
          </LinkButton>
        </div>
      ) : null}
      {range?.kind === "range" && (
        <Text variant="secondary" size="sm">
          {t("approvals.confirm.changesHint")}
        </Text>
      )}
    </div>
  );
}

/**
 * Confirms approving a publish / rollback / delete (DESIGN.md §2m): the request exactly as the
 * server phrased it (plain text), what it touches, and that the approval is single-use and
 * bound to the site's current state. Always mounted; `request` undefined closes it.
 */
export function ApproveRequestDialog({
  siteId,
  request: current,
  onOpenChange,
  onConfirm,
  busy,
  error,
}: {
  siteId: string;
  request: Approval | undefined;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: Approval) => void;
  busy: boolean;
  error?: string | undefined;
}) {
  const { t, locale } = useI18n();
  const label = useToolLabel();
  const last = useRef(current);
  if (current) last.current = current;
  const request = current ?? last.current;
  const agent = request ? (request.actor.name ?? request.actor.id) : "";
  const snapshotId = request ? argument(request.input, "snapshotId") : undefined;
  const target =
    request?.tool === "delete_page"
      ? argument(request.input, "pageId")
      : request?.tool === "delete_entry"
        ? argument(request.input, "entryId")
        : undefined;
  return (
    <LayerDialog.Root
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={busy}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {request ? t("approvals.confirm.title", { tool: label(request.tool) }) : ""}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {request ? t("approvals.confirm.requestedBy", { agent }) : ""}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {request && (
            <div className="grid gap-5" data-testid="approve-dialog">
              {/* Server-built text that can quote agent-written titles: plain text only. */}
              <Surface className="rounded-lg px-4 py-3 ring ring-kumo-hairline">
                <Text>{request.prompt}</Text>
              </Surface>
              {request.tool === "publish" && (
                <PublishChanges siteId={siteId} active={current !== undefined} />
              )}
              {(snapshotId || target) && (
                <dl className="grid divide-y divide-kumo-hairline">
                  {request.tool === "rollback" && snapshotId && (
                    <Fact label={t("approvals.confirm.rollbackTarget")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <InlineCopyText>{snapshotId}</InlineCopyText>
                        <LinkButton
                          href={`/sites/${siteId}/snapshots?diff=${snapshotId}`}
                          variant="ghost"
                          size="sm"
                          icon={GitDiff}
                        >
                          {t("approvals.confirm.viewChanges")}
                        </LinkButton>
                      </div>
                    </Fact>
                  )}
                  {target && (
                    <Fact label={t("approvals.confirm.deleteTarget")}>
                      <InlineCopyText>{target}</InlineCopyText>
                    </Fact>
                  )}
                  <Fact label={t("approvals.expires")}>
                    <Text as="span">{absoluteTime(request.expiresAt, locale)}</Text>
                  </Fact>
                </dl>
              )}
              <Banner
                variant="default"
                icon={<ShieldCheck weight="fill" />}
                title={t("approvals.confirm.singleUseTitle")}
                description={t("approvals.confirm.singleUse", { agent })}
              />
              {error && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("approvals.failed")}
                  description={error}
                />
              )}
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary loading={busy} onClick={() => request && onConfirm(request)}>
            {t("approvals.confirm.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
