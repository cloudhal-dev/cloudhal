import {
  Badge,
  Banner,
  Button,
  ClipboardText,
  DeleteResource,
  DropdownMenu,
  Empty,
  LayerCard,
  Pagination,
  ResourceListPage,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import {
  ClockCountdown,
  Copy,
  DotsThree,
  Info,
  Key,
  PlugsConnected,
  Plus,
  Robot,
  SlidersHorizontal,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HowModesWorkCard } from "../components/AgentModes.tsx";
import { ChangeAgentModeDialog } from "../components/ChangeAgentModeDialog.tsx";
import { CreateAgentKeyDialog } from "../components/CreateAgentKeyDialog.tsx";
import { ElevateAgentKeyDialog } from "../components/ElevateAgentKeyDialog.tsx";
import {
  ElevatedKeysBanner,
  KeyModeCell,
  useElevationExpiry,
  useEndElevation,
} from "../components/Elevation.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { ScopeBadge } from "../components/ScopeBadge.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { useAgentModeRules } from "../components/useAgentModeRules.ts";
import { useNow } from "../components/useNow.ts";
import { usePaging } from "../components/usePaging.ts";
import { usePendingElevations } from "../components/usePendingApprovals.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { mcpSnippet, ownModeOf, type SnippetKind, sameScopes, sortScopes } from "../lib/agents.ts";
import { type AgentKeySummary, api, isNotEnabled, mcpEndpoint } from "../lib/api.ts";
import { activeElevation, modesAbove } from "../lib/elevation.ts";

const matches = (k: AgentKeySummary, q: string) =>
  (k.name ?? "").toLowerCase().includes(q) ||
  (k.start ?? "").toLowerCase().includes(q) ||
  (k.mode ?? "").includes(q) ||
  (k.elevation?.mode ?? "").includes(q) ||
  k.scopes.some((s) => s.includes(q));

/**
 * A key's scopes: one quiet "Mode default" badge (scopes in its tooltip) when they are exactly what
 * the mode prefills, so customised keys stand out with their full list.
 */
function KeyScopes({ agentKey }: { agentKey: AgentKeySummary }) {
  const t = useT();
  const rules = useAgentModeRules();
  const scopes = sortScopes(agentKey.scopes);
  if (sameScopes(scopes, rules.scopesFor(ownModeOf(agentKey)))) {
    return (
      <span data-scopes="mode-default" className="inline-flex">
        <Tooltip
          content={
            <span className="grid gap-0.5">
              {scopes.map((s) => (
                <span key={s} className="font-mono text-[0.9em]">
                  {s}
                </span>
              ))}
            </span>
          }
        >
          <Badge variant="outline">{t("agents.scopesModeDefault", { count: scopes.length })}</Badge>
        </Tooltip>
      </span>
    );
  }
  return (
    <div className="flex min-w-60 flex-wrap gap-1" data-scopes="custom">
      {scopes.map((s) => (
        <ScopeBadge key={s} scope={s} />
      ))}
    </div>
  );
}

/** The "Connect an MCP client" card: endpoint, header and ready-to-paste client config. */
export function ConnectMcpCard({ endpoint }: { endpoint: string }) {
  const t = useT();
  const [kind, setKind] = useState<SnippetKind>("json");
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2 px-5 py-3">
        <PlugsConnected size={16} className="text-kumo-subtle" />
        <Text variant="heading" as="h2">
          {t("agents.connect.title")}
        </Text>
      </LayerCard.Secondary>
      <LayerCard.Primary className="grid min-w-0 gap-4 px-5 py-4">
        <Text variant="secondary">{t("agents.connect.description")}</Text>
        <div className="grid gap-1.5">
          <Text size="sm" bold as="span">
            {t("agents.connect.endpoint")}
          </Text>
          <ClipboardText size="base" text={endpoint} />
        </div>
        <div className="grid gap-1.5">
          <Text size="sm" bold as="span">
            {t("agents.connect.header")}
          </Text>
          <ClipboardText size="base" text="x-api-key" />
        </div>
        <div className="grid min-w-0 gap-3">
          <Tabs
            variant="segmented"
            size="sm"
            value={kind}
            onValueChange={(v) => setKind(v as SnippetKind)}
            tabs={(["json", "claude", "stdio"] as const).map((k) => ({
              value: k,
              label: t(`agents.connect.tabs.${k}`),
            }))}
          />
          <div className="min-w-0 overflow-x-auto">
            <CodeHighlighted
              code={mcpSnippet(kind, endpoint)}
              lang={kind === "json" ? "json" : "bash"}
              showCopyButton
            />
          </div>
          {kind === "stdio" && (
            <Text variant="secondary" size="sm">
              {t("agents.connect.stdioHint")}
            </Text>
          )}
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}

function KeyMenu({
  agentKey,
  elevated,
  onChangeMode,
  onElevate,
  onEndElevation,
  onRevoke,
}: {
  agentKey: AgentKeySummary;
  /** An elevation is in force: offer to end it. */
  elevated: boolean;
  onChangeMode: () => void;
  onElevate: () => void;
  onEndElevation: () => void;
  onRevoke: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { modes } = useAgentModeRules();
  // Nothing is above Auto for a remote key (bypass is local only), so there is nothing to offer.
  const canElevate = modesAbove(ownModeOf(agentKey), modes).length > 0;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            icon={<DotsThree weight="bold" />}
            aria-label={t("site.rowMenu")}
          />
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item icon={SlidersHorizontal} onClick={onChangeMode}>
          {t("agents.changeMode.menu")}
        </DropdownMenu.Item>
        {canElevate ? (
          <DropdownMenu.Item icon={ClockCountdown} onClick={onElevate}>
            {t("agents.elevate.menu")}
          </DropdownMenu.Item>
        ) : (
          // A disabled item takes no pointer events, so the tooltip hangs on a wrapper.
          <Tooltip content={t("agents.elevate.menuDisabled")} side="left" render={<div />}>
            <DropdownMenu.Item icon={ClockCountdown} disabled>
              {t("agents.elevate.menu")}
            </DropdownMenu.Item>
          </Tooltip>
        )}
        {elevated && (
          <DropdownMenu.Item icon={Stop} onClick={onEndElevation}>
            {t("agents.elevation.endMenu")}
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Item
          icon={Copy}
          onClick={async () => {
            await navigator.clipboard?.writeText(agentKey.id);
            toast.success(t("common.copied"), agentKey.id);
          }}
        >
          {t("agents.copyId")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={Trash} variant="danger" onClick={onRevoke}>
          {t("agents.revoke")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** Account-level agent credentials (DESIGN.md §2a list + §2g one-time secret). */
export function AgentsPage() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const keys = useQuery({
    queryKey: ["agent-keys"],
    queryFn: api.agentKeys.list,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const paging = usePaging(keys.data, matches);
  const [createOpen, setCreateOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<AgentKeySummary | undefined>();
  const [toChange, setToChange] = useState<AgentKeySummary | undefined>();
  const [toElevate, setToElevate] = useState<AgentKeySummary | undefined>();
  const endpoint = mcpEndpoint(window.location.origin);
  const notEnabled = isNotEnabled(keys.error);
  // "42 min left" ages on its own; the list refetches the moment an elevation runs out.
  const now = useNow();
  useElevationExpiry(keys.data);
  const endElevation = useEndElevation();
  // Agents that asked for more autonomy and wait for a person (ADR-0016 addendum).
  const asks = usePendingElevations();

  const revoke = useMutation({
    mutationFn: (key: AgentKeySummary) => api.agentKeys.remove(key.id),
    onSuccess: async (_r, key) => {
      setToRevoke(undefined);
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
      toast.success(
        t("agents.revoked"),
        t("agents.revokedDescription", { name: key.name ?? t("agents.unnamed") }),
      );
    },
  });

  const createButton = (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => setCreateOpen(true)}
      disabled={notEnabled}
    >
      {t("agents.createKey")}
    </Button>
  );

  return (
    <ResourceListPage
      title={t("agents.title")}
      description={t("agents.description")}
      icon={<Robot size={32} className="text-kumo-subtle" />}
      usage={<ConnectMcpCard endpoint={endpoint} />}
      additionalContent={<HowModesWorkCard />}
    >
      <div className="grid gap-4">
        {notEnabled ? (
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            title={t("agents.notEnabledTitle")}
            description={t("agents.notEnabledDescription")}
          />
        ) : (
          <ErrorBanner
            error={keys.error}
            onRetry={() => keys.refetch()}
            retrying={keys.isFetching}
          />
        )}
        <ElevatedKeysBanner
          keys={keys.data}
          now={now}
          onEnd={(elevated) => endElevation.mutate(elevated)}
          ending={endElevation.isPending}
        />
        <ListToolbar
          search={paging.search}
          onSearch={paging.setSearch}
          placeholder={t("agents.search")}
          actions={createButton}
        />
        {notEnabled ? null : keys.data?.length === 0 ? (
          <Empty
            icon={<Key size={48} className="text-kumo-inactive" />}
            title={t("agents.empty")}
            description={t("agents.emptyDescription")}
            commandLine="cloudhal mcp"
            contents={createButton}
          />
        ) : (
          <LayerCard className="overflow-x-auto p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("agents.columns.name")}</Table.Head>
                  <Table.Head>{t("agents.columns.mode")}</Table.Head>
                  <Table.Head>{t("agents.columns.scopes")}</Table.Head>
                  <Table.Head>{t("agents.columns.created")}</Table.Head>
                  <Table.Head>{t("agents.columns.status")}</Table.Head>
                  <Table.Head sticky="right" />
                </Table.Row>
              </Table.Header>
              {keys.isPending ? (
                <TableSkeleton columns={6} rows={3} />
              ) : paging.pageItems.length === 0 ? (
                <Table.Body>
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Empty
                        size="sm"
                        icon={<Key size={32} className="text-kumo-inactive" />}
                        title={t("agents.noMatches", { query: paging.search })}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              ) : (
                <Table.Body>
                  {paging.pageItems.map((k) => (
                    <Table.Row key={k.id} data-key-id={k.id}>
                      <Table.Cell className="whitespace-nowrap">
                        <div className="grid gap-0.5">
                          <Text bold as="span">
                            {k.name ?? t("agents.unnamed")}
                          </Text>
                          {k.start && (
                            <Text variant="mono-secondary" as="span">
                              {t("agents.keyPrefix", { start: k.start })}
                            </Text>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <KeyModeCell agentKey={k} now={now} asks={asks.get(k.id)} />
                      </Table.Cell>
                      <Table.Cell>
                        <KeyScopes agentKey={k} />
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <div className="grid gap-0.5">
                          <RelativeTime iso={k.createdAt} />
                          {k.expiresAt ? (
                            <Text variant="secondary" size="xs" as="span">
                              {t("agents.expires", {
                                when: new Date(k.expiresAt).toLocaleDateString(locale),
                              })}
                            </Text>
                          ) : (
                            <Text variant="secondary" size="xs" as="span">
                              {t("agents.never")}
                            </Text>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        {k.enabled ? (
                          <Badge variant="success" appearance="dot">
                            {t("agents.active")}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" appearance="dot">
                            {t("agents.disabled")}
                          </Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell sticky="right" className="text-right">
                        <KeyMenu
                          agentKey={k}
                          elevated={
                            activeElevation({ mode: ownModeOf(k), elevation: k.elevation }, now) !==
                            undefined
                          }
                          onChangeMode={() => setToChange(k)}
                          onElevate={() => setToElevate(k)}
                          onEndElevation={() => endElevation.mutate([k])}
                          onRevoke={() => setToRevoke(k)}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
        {paging.total > paging.perPage && (
          <Pagination
            page={paging.page}
            perPage={paging.perPage}
            totalCount={paging.total}
            setPage={paging.setPage}
          />
        )}
      </div>
      <CreateAgentKeyDialog open={createOpen} onOpenChange={setCreateOpen} endpoint={endpoint} />
      <ChangeAgentModeDialog
        agentKey={toChange}
        onOpenChange={(o) => !o && setToChange(undefined)}
      />
      <ElevateAgentKeyDialog
        agentKey={toElevate}
        onOpenChange={(o) => !o && setToElevate(undefined)}
      />
      <DeleteResource
        open={toRevoke !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setToRevoke(undefined);
            revoke.reset();
          }
        }}
        resourceType={t("agents.keyResource")}
        resourceName={toRevoke?.name ?? toRevoke?.id ?? ""}
        deleteButtonText={t("agents.revokeKey")}
        isDeleting={revoke.isPending}
        errorMessage={revoke.error ? revoke.error.message : undefined}
        onDelete={async () => {
          if (toRevoke) await revoke.mutateAsync(toRevoke).catch(() => undefined);
        }}
      />
    </ResourceListPage>
  );
}
