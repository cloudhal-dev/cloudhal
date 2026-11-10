import {
  Avatar,
  Badge,
  Button,
  DeleteResource,
  SectionCard,
  SectionEmpty,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { LinkBreak, PlugsConnected, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { initials } from "../lib/account.ts";
import { SCOPE_GROUPS, type ScopeGroup, scopeGroup, sortScopes } from "../lib/agents.ts";
import { type AgentGrantSummary, type AgentScope, api } from "../lib/api.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { deleteResourceProps } from "./deleteLabels.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { RoleBadge } from "./Roles.tsx";
import { TableSkeleton } from "./TableSkeleton.tsx";
import { useToast } from "./Toast.ts";
import { useMe } from "./useMe.ts";

const GROUPS = Object.keys(SCOPE_GROUPS) as ScopeGroup[];
const TONE: Record<ScopeGroup, "secondary" | "info" | "warning"> = {
  read: "secondary",
  write: "info",
  release: "warning",
};

/**
 * "Connected agents" on `/agents` (RFC-0044 §4): the apps connected by URL through OAuth, named
 * as the consent screen named them (a document client by its host first; a self-registered one
 * as not verified, with a look-alike warning), what each can do in words with its mode, when it
 * was last used and connected, and Disconnect (`DELETE /api/agent-grants/:id`, the revoke that also
 * ends the provider's consent and tokens). `all`: every member's connections (`agents:manage`).
 */
export function ConnectedAgents({ all = false }: { all?: boolean }) {
  const t = useT();
  const c = useT("connectedAgents");
  const qc = useQueryClient();
  const toast = useToast();
  const grants = useQuery({
    queryKey: ["agent-grants", all ? "all" : "mine"],
    queryFn: all ? api.agentGrants.listAll : api.agentGrants.list,
  });
  const [toRevoke, setToRevoke] = useState<AgentGrantSummary | undefined>();
  const revoke = useMutation({
    mutationFn: (grant: AgentGrantSummary) => api.agentGrants.revoke(grant.id),
    onSuccess: async (_r, grant) => {
      setToRevoke(undefined);
      await qc.invalidateQueries({ queryKey: ["agent-grants"] });
      toast.success(
        c("connectedAgents.disconnected"),
        c("connectedAgents.disconnectedDescription", { client: grant.clientName }),
      );
    },
  });
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const items = grants.data ?? [];
  const columns = all ? 5 : 4;
  // Where the server runs no OAuth for remote clients, the section shows only connections left
  // from when it did.
  if (!instance.data?.features.mcpOauth && items.length === 0) return null;
  return (
    <SectionCard
      id={all ? "connected-agents-all" : "connected-agents"}
      title={c(all ? "connectedAgents.allTitle" : "connectedAgents.title")}
      icon={<PlugsConnected size={16} />}
      description={c(all ? "connectedAgents.allDescription" : "connectedAgents.description")}
      actions={items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : undefined}
      flush
    >
      {grants.error ? (
        <div className="px-5 py-4">
          <ErrorBanner error={grants.error} onRetry={() => grants.refetch()} />
        </div>
      ) : !grants.isPending && items.length === 0 ? (
        <SectionEmpty
          icon={<PlugsConnected size={32} className="text-kumo-inactive" />}
          title={c(all ? "connectedAgents.allEmpty" : "connectedAgents.empty")}
          description={c("connectedAgents.emptyDescription")}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{c("connectedAgents.columns.agent")}</Table.Head>
                {/* Phones: member, access and last use stack under the agent (`GrantRow`), so a
                    row fits next to Disconnect without scrolling sideways (MembersPage). */}
                {all && (
                  <Table.Head className="hidden sm:table-cell">
                    {c("connectedAgents.columns.owner")}
                  </Table.Head>
                )}
                <Table.Head className="hidden sm:table-cell">
                  {c("connectedAgents.columns.access")}
                </Table.Head>
                <Table.Head className="hidden sm:table-cell">
                  {c("connectedAgents.columns.lastUsed")}
                </Table.Head>
                <Table.Head sticky="right" className="w-12">
                  <span className="sr-only">{t("site.rowMenu")}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            {grants.isPending ? (
              <TableSkeleton columns={columns} rows={2} />
            ) : (
              <Table.Body>
                {items.map((g) => (
                  <GrantRow key={g.id} grant={g} all={all} onDisconnect={() => setToRevoke(g)} />
                ))}
              </Table.Body>
            )}
          </Table>
        </div>
      )}
      <DeleteResource
        open={toRevoke !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setToRevoke(undefined);
            revoke.reset();
          }
        }}
        {...deleteResourceProps(t, c("connectedAgents.resource"), {
          action: c("connectedAgents.disconnect"),
          error: revoke.error,
        })}
        resourceName={toRevoke?.clientName ?? ""}
        isDeleting={revoke.isPending}
        onDelete={async () => {
          if (toRevoke) await revoke.mutateAsync(toRevoke).catch(() => undefined);
        }}
      />
    </SectionCard>
  );
}

function GrantRow({
  grant,
  all,
  onDisconnect,
}: {
  grant: AgentGrantSummary;
  all: boolean;
  onDisconnect: () => void;
}) {
  const c = useT("connectedAgents");
  return (
    <Table.Row data-grant-id={grant.id} data-client-kind={grant.client.kind}>
      <Table.Cell>
        <div className="grid min-w-0 gap-2 sm:min-w-44">
          <ClientIdentity grant={grant} />
          {/* Below `sm` the other columns are hidden and their content stacks here. */}
          <div className="grid justify-items-start gap-2 sm:hidden" data-narrow>
            {all && <GrantOwner grant={grant} />}
            <GrantAccess grant={grant} />
            <span className="flex flex-wrap items-center gap-1">
              <Text variant="secondary" size="sm" as="span">
                {c("connectedAgents.columns.lastUsed")}
              </Text>
              <GrantLastUsed grant={grant} />
            </span>
          </div>
        </div>
      </Table.Cell>
      {all && (
        <Table.Cell className="hidden whitespace-nowrap sm:table-cell" data-cell="owner">
          <GrantOwner grant={grant} />
        </Table.Cell>
      )}
      <Table.Cell className="hidden sm:table-cell" data-cell="access">
        <GrantAccess grant={grant} />
      </Table.Cell>
      <Table.Cell className="hidden whitespace-nowrap sm:table-cell" data-cell="lastUsed">
        <GrantLastUsed grant={grant} />
      </Table.Cell>
      <Table.Cell sticky="right" className="w-12 text-end">
        <Tooltip
          content={c("connectedAgents.disconnect")}
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<LinkBreak />}
              onClick={onDisconnect}
              aria-label={c("connectedAgents.disconnectLabel", { client: grant.clientName })}
            />
          }
        />
      </Table.Cell>
    </Table.Row>
  );
}

/** The member a connection works for (admin view): avatar, name ("You" for oneself), role. */
function GrantOwner({ grant }: { grant: AgentGrantSummary }) {
  const t = useT();
  const me = useMe().data;
  const owner = grant.owner;
  return (
    <div className="flex items-center gap-2">
      <Avatar initials={initials(owner?.name ?? "?")} size="sm" />
      <span className="grid justify-items-start gap-0.5">
        <Text as="span">
          {owner?.userId === me?.userId ? t("members.you") : (owner?.name ?? "")}
        </Text>
        {owner?.role && <RoleBadge value={owner.role} />}
      </span>
    </div>
  );
}

/** What it may do, then how (its mode): one column, so the table fits beside the aside. */
function GrantAccess({ grant }: { grant: AgentGrantSummary }) {
  return (
    <div className="grid justify-items-start gap-1.5">
      <GrantScopes scopes={grant.effectiveScopes} />
      <ModeBadge mode={grant.effectiveMode} />
    </div>
  );
}

function GrantLastUsed({ grant }: { grant: AgentGrantSummary }) {
  const c = useT("connectedAgents");
  return grant.lastUsedAt ? (
    <RelativeTime iso={grant.lastUsedAt} />
  ) : (
    <Text variant="secondary" size="sm" as="span">
      {c("connectedAgents.never")}
    </Text>
  );
}

/** As the consent screen named the client: a document's host first, never the name alone. */
function ClientIdentity({ grant }: { grant: AgentGrantSummary }) {
  const c = useT("connectedAgents");
  const { host, kind, lookalike } = grant.client;
  return (
    <div className="grid justify-items-start gap-0.5">
      {host && (
        <Text bold as="span">
          {c("connectedAgents.identifiedBy", { host })}
        </Text>
      )}
      <Text as="span">{grant.clientName}</Text>
      {!host && kind === "self-registered" && (
        <Text variant="secondary" size="sm" as="span">
          {c("connectedAgents.selfRegistered")}
        </Text>
      )}
      {lookalike && (
        <Badge variant="warning" icon={<Warning size={12} />}>
          {c("connectedAgents.lookalike", { client: lookalike })}
        </Badge>
      )}
      {/* When it was connected, here rather than in a column of its own: the table fits beside
          the aside at 1440 px. */}
      <span className="flex items-center gap-1">
        <Text variant="secondary" size="xs" as="span">
          {c("connectedAgents.columns.connected")}
        </Text>
        <RelativeTime iso={grant.createdAt} size="xs" />
      </span>
    </div>
  );
}

/** What a connection can do, in words: one pill per scope group, its scopes in the tooltip. */
function GrantScopes({ scopes }: { scopes: readonly AgentScope[] }) {
  const t = useT();
  const sorted = sortScopes(scopes);
  return (
    <div className="flex flex-wrap gap-1">
      {GROUPS.map((group) => {
        const held = sorted.filter((s) => s !== "*" && scopeGroup(s) === group);
        if (held.length === 0) return null;
        return (
          <Tooltip
            key={group}
            content={
              <span className="grid gap-1">
                {held.map((s) => (
                  <Text as="span" size="sm" key={s}>
                    {t(`agents.scopes.${s as Exclude<AgentScope, "*">}`)}
                  </Text>
                ))}
              </span>
            }
          >
            <Badge variant={TONE[group]}>{t(`agents.create.groups.${group}`)}</Badge>
          </Tooltip>
        );
      })}
    </div>
  );
}
