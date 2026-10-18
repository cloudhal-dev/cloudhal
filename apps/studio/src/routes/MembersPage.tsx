import {
  Badge,
  Banner,
  Button,
  DropdownMenu,
  Empty,
  LayerCard,
  PageLayout,
  Pagination,
  SectionCard,
  SectionEmpty,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  Crown,
  DotsThree,
  EnvelopeSimple,
  Globe,
  Info,
  Key,
  LinkSimple,
  Password,
  ShieldCheck,
  Trash,
  UserCircleGear,
  UserPlus,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { InviteDialog, type InviteDraft } from "../components/InviteDialog.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import {
  ChangeRoleDialog,
  MemberIdentity,
  RemoveMemberDialog,
  ResetLinkDialog,
  TransferOwnershipDialog,
} from "../components/MemberDialogs.tsx";
import { MemberSitesDialog } from "../components/MemberSitesDialog.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { RoleBadge, RoleList } from "../components/Roles.tsx";
import { isSiteRole, useSites } from "../components/SiteAccessField.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import {
  useCan,
  useGate,
  useInviteRules,
  useMe,
  useMembers,
  useRoleRules,
} from "../components/useMe.ts";
import { useNow } from "../components/useNow.ts";
import { type Fold, usePaging } from "../components/usePaging.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { absoluteTime } from "../lib/activity.ts";
import { api, type Invite, isNotEnabled, type Member } from "../lib/api.ts";
import { formatDuration } from "../lib/elevation.ts";
import {
  expiresIn,
  inviteExpired,
  inviteMaxHours,
  type RankProblem,
  roleChangeProblem,
  sortMembers,
} from "../lib/roles.ts";
import { ActivityList } from "./ActivityPage.tsx";

export type TeamView = "members" | "activity";

const matches = (m: Member, q: string, fold: Fold) =>
  fold(m.name).includes(q) || fold(m.email ?? "").includes(q) || m.role.includes(q);

/** A menu item that cannot be used right now keeps its place and says why (DESIGN.md §2s). */
function GatedItem({
  icon,
  reason,
  onClick,
  variant,
  children,
}: {
  icon: typeof Key;
  reason: string | undefined;
  onClick: () => void;
  variant?: "danger";
  children: ReactNode;
}) {
  if (!reason)
    return (
      <DropdownMenu.Item icon={icon} onClick={onClick} variant={variant}>
        {children}
      </DropdownMenu.Item>
    );
  // A disabled item takes no pointer events, so the tooltip hangs on a wrapper.
  return (
    <Tooltip content={reason} side="left" render={<div />}>
      <DropdownMenu.Item icon={icon} disabled variant={variant}>
        {children}
      </DropdownMenu.Item>
    </Tooltip>
  );
}

function MemberMenu({
  member,
  problem,
  isOwner,
  onRole,
  onSites,
  onReset,
  onTransfer,
  onRemove,
}: {
  member: Member;
  problem: RankProblem | undefined;
  /** The signed-in person is the Owner (may transfer ownership). */
  isOwner: boolean;
  onRole: () => void;
  /** RFC-0034 A2: which sites they work on (multi-site installations, site roles only). */
  onSites?: (() => void) | undefined;
  onReset: () => void;
  onTransfer: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const manage = useGate("members.manage");
  const reason = problem ? (manage.reason ?? t(`members.rank.${problem}`)) : undefined;
  const label = t("members.menu", { name: member.name });
  // Nobody may act on this row at all: one disabled trigger with the reason, not a menu of no's.
  if (problem === "not_allowed")
    return (
      <Button
        variant="ghost"
        size="xs"
        shape="square"
        icon={<DotsThree weight="bold" />}
        aria-label={label}
        disabled
        title={reason}
      />
    );
  const transferReason =
    member.role === "administrator" ? reason : t("members.transfer.needsAdministrator");
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            icon={<DotsThree weight="bold" />}
            aria-label={label}
          />
        }
      />
      <DropdownMenu.Content align="end">
        <GatedItem icon={UserCircleGear} reason={reason} onClick={onRole}>
          {t("members.changeRole")}
        </GatedItem>
        {onSites && (
          <GatedItem icon={Globe} reason={reason} onClick={onSites}>
            {t("siteAccess.menu")}
          </GatedItem>
        )}
        <GatedItem icon={Password} reason={reason} onClick={onReset}>
          {t("members.resetLink")}
        </GatedItem>
        {isOwner && (
          <GatedItem icon={Crown} reason={transferReason} onClick={onTransfer}>
            {t("members.transferOwnership")}
          </GatedItem>
        )}
        <DropdownMenu.Separator />
        <GatedItem icon={Trash} reason={reason} onClick={onRemove} variant="danger">
          {t("members.remove.menu")}
        </GatedItem>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** "In 6 days" with the absolute time in a tooltip; expired invites say so in warning tone. */
function InviteExpiry({ invite, now }: { invite: Invite; now: number }) {
  const { t, locale } = useI18n();
  if (inviteExpired(invite, now))
    return (
      <span data-expired className="inline-flex">
        <Badge variant="warning" appearance="dot">
          {t("members.invites.expired")}
        </Badge>
      </span>
    );
  // Rounded ("in 7 days"), the absolute time sits under it.
  return (
    <Text variant="secondary" size="sm" as="span">
      {expiresIn(invite.expiresAt, locale, now)}
    </Text>
  );
}

/** Re-invite (replaces the pending invite) and Revoke, in the row's menu like every table. */
function InviteMenu({
  invite,
  reason,
  onReinvite,
  onRevoke,
}: {
  invite: Invite;
  /** The person's role cannot give this invite's role. */
  reason: string | undefined;
  onReinvite: () => void;
  onRevoke: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            icon={<DotsThree weight="bold" />}
            aria-label={t("members.invites.menu", { email: invite.email })}
          />
        }
      />
      <DropdownMenu.Content align="end">
        <GatedItem icon={ArrowClockwise} reason={reason} onClick={onReinvite}>
          {t("members.invites.reinvite")}
        </GatedItem>
        {invite.status === "pending" && (
          <>
            <DropdownMenu.Separator />
            <GatedItem icon={X} reason={reason} onClick={onRevoke} variant="danger">
              {t("members.invites.revoke")}
            </GatedItem>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

function InvitesCard({
  onReinvite,
  onInvite,
}: {
  onReinvite: (draft: InviteDraft) => void;
  onInvite: () => void;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const me = useMe().data;
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: api.invites.list,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const [toRevoke, setToRevoke] = useState<Invite | undefined>();
  const revoke = useMutation({
    mutationFn: (invite: Invite) => api.invites.revoke(invite.id),
    onSuccess: async (_r, invite) => {
      setToRevoke(undefined);
      toast.success(
        t("members.invites.revoked"),
        t("members.invites.revokedDescription", { email: invite.email }),
      );
      await qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  const items = invites.data ?? [];
  const canGive = (invite: Invite) => me?.invitableRoles?.includes(invite.role) !== false;
  return (
    <SectionCard
      id="invites"
      title={t("members.invites.title")}
      icon={<EnvelopeSimple size={16} />}
      description={t("members.invites.description")}
      actions={items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : undefined}
      flush
    >
      {invites.error ? (
        <div className="px-5 py-4">
          <ErrorBanner error={invites.error} onRetry={() => invites.refetch()} />
        </div>
      ) : !invites.isPending && items.length === 0 ? (
        <SectionEmpty
          icon={<EnvelopeSimple size={32} className="text-kumo-inactive" />}
          title={t("members.invites.empty")}
          description={t("members.invites.emptyDescription")}
          contents={
            <Button variant="secondary" icon={<UserPlus />} onClick={onInvite}>
              {t("members.invite")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("members.invites.columns.email")}</Table.Head>
                <Table.Head>{t("members.invites.columns.role")}</Table.Head>
                <Table.Head>{t("members.invites.columns.expires")}</Table.Head>
                <Table.Head>{t("members.invites.columns.inviter")}</Table.Head>
                <Table.Head sticky="right">
                  <span className="sr-only">{t("members.invites.columns.actions")}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            {invites.isPending ? (
              <TableSkeleton columns={5} rows={2} />
            ) : (
              <Table.Body>
                {items.map((invite) => {
                  const incomplete = invite.status === "accepted" && !invite.acceptedUserId;
                  const mine = canGive(invite);
                  const notMine = mine ? undefined : t("members.rank.role_too_high");
                  return (
                    <Table.Row key={invite.id} data-invite-id={invite.id}>
                      <Table.Cell>
                        <div className="grid min-w-48 gap-0.5">
                          <Text bold as="span" truncate>
                            {invite.email}
                          </Text>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {invite.delivery === "email" ? (
                              <Text variant="secondary" size="sm" as="span">
                                {t("members.invites.byEmail")}
                              </Text>
                            ) : (
                              <Text variant="secondary" size="sm" as="span">
                                {t("members.invites.byLink")}
                              </Text>
                            )}
                            {incomplete && (
                              <Tooltip content={t("members.invites.incompleteHint")}>
                                <Badge variant="warning" icon={<Warning />}>
                                  {t("members.invites.incomplete")}
                                </Badge>
                              </Tooltip>
                            )}
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <RoleBadge value={invite.role} />
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <div className="grid gap-0.5">
                          <InviteExpiry invite={invite} now={now} />
                          <Text variant="secondary" size="xs" as="span">
                            {absoluteTime(invite.expiresAt, locale)}
                          </Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <div className="grid gap-0.5">
                          <Text as="span">
                            {invite.inviter.userId === me?.userId
                              ? t("members.invites.you")
                              : (invite.inviter.name ?? t("members.invites.someone"))}
                          </Text>
                          <RelativeTime iso={invite.createdAt} size="xs" />
                        </div>
                      </Table.Cell>
                      <Table.Cell sticky="right" className="w-12 text-end">
                        <InviteMenu
                          invite={invite}
                          reason={mine ? undefined : notMine}
                          onReinvite={() => onReinvite({ email: invite.email, role: invite.role })}
                          onRevoke={() => setToRevoke(invite)}
                        />
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            )}
          </Table>
        </div>
      )}
      <ConfirmDialog
        open={toRevoke !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setToRevoke(undefined);
            revoke.reset();
          }
        }}
        title={t("members.invites.revokeTitle")}
        description={t("members.invites.revokeDescription", { email: toRevoke?.email ?? "" })}
        confirmLabel={t("members.invites.revoke")}
        busy={revoke.isPending}
        error={revoke.error}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
    </SectionCard>
  );
}

/** "How invites work": single use, expiry, bound to email and role, revocable; ownership. */
function HowInvitesWork() {
  const { t, locale } = useI18n();
  const rules = useInviteRules();
  const lines: { icon: ReactNode; text: string }[] = [
    { icon: <LinkSimple size={16} />, text: t("members.how.single") },
    {
      icon: <EnvelopeSimple size={16} />,
      text: t("members.how.bound"),
    },
    {
      icon: <Key size={16} />,
      text: t("members.how.expiry", {
        default: formatDuration(rules.defaultHours * 60, locale, "long"),
        admin: formatDuration(inviteMaxHours(rules, "administrator") * 60, locale, "long"),
      }),
    },
    { icon: <ShieldCheck size={16} />, text: t("members.how.keys") },
    { icon: <Crown size={16} />, text: t("members.how.owner") },
  ];
  return (
    <SectionCard title={t("members.how.title")} icon={<Info size={16} />}>
      <div className="grid gap-3">
        {lines.map((l) => (
          <div key={l.text} className="flex items-start gap-2">
            <span className="flex h-lh items-center text-kumo-subtle">{l.icon}</span>
            <Text variant="secondary" size="sm">
              {l.text}
            </Text>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/**
 * Account surface › Settings › Team (DESIGN.md §2q, RFC-0005 §10.3): who works on this deployment
 * and as what. List template — members table (initials, name, email for Administrators, role,
 * joined, row menu), pending invites, the role explainer and how invites work in the aside — plus
 * an Activity sub-view with the deployment's own events (`audit:read`). Every control follows the
 * server's rank rule and is disabled with the reason when it does not apply; the server decides.
 */
type MemberSetters = Record<
  "setToRole" | "setToSites" | "setToReset" | "setToTransfer" | "setToRemove",
  (m: Member) => void
>;

/** One member: identity, role (and their sites when limited), joined, and the actions menu. */
function MemberTableRow({
  member: m,
  you,
  problem,
  isOwner,
  multiSite,
  on,
}: {
  member: Member;
  you: boolean;
  problem: RankProblem | undefined;
  isOwner: boolean;
  multiSite: boolean;
  on: MemberSetters;
}) {
  const t = useT();
  const count = m.sites ? Object.keys(m.sites).length : 0;
  const role = (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <RoleBadge value={m.role} />
      {count > 0 && (
        <span data-site-limited>
          <Badge variant="secondary">{t("siteAccess.count", { count })}</Badge>
        </span>
      )}
    </span>
  );
  return (
    <Table.Row data-member-id={m.userId} data-role={m.role}>
      <Table.Cell>
        <div className="grid min-w-0 gap-1.5 sm:min-w-56">
          <MemberIdentity member={m} you={you} />
          <span className="ps-11 sm:hidden">{role}</span>
        </div>
      </Table.Cell>
      <Table.Cell className="hidden whitespace-nowrap sm:table-cell">{role}</Table.Cell>
      <Table.Cell className="hidden whitespace-nowrap sm:table-cell">
        <RelativeTime iso={m.joinedAt} />
      </Table.Cell>
      <Table.Cell sticky="right" className="w-12 text-end">
        <MemberMenu
          member={m}
          problem={problem}
          isOwner={isOwner}
          onRole={() => on.setToRole(m)}
          onSites={multiSite && isSiteRole(m.role) ? () => on.setToSites(m) : undefined}
          onReset={() => on.setToReset(m)}
          onTransfer={() => on.setToTransfer(m)}
          onRemove={() => on.setToRemove(m)}
        />
      </Table.Cell>
    </Table.Row>
  );
}

export function MembersPage() {
  const t = useT();
  const navigate = useNavigate();
  const { view = "members" } = useSearch({ strict: false }) as { view?: TeamView };
  const me = useMe().data;
  const members = useMembers();
  const rules = useRoleRules();
  const invite = useGate("members.invite");
  const canManage = useCan("members.manage");
  const seesActivity = useGate("activity.all");
  // Administrators see every key, so the removal dialog can say how many get disabled.
  const seesAllKeys = useCan("agents.manage") && me?.can !== undefined;
  const allKeys = useQuery({
    queryKey: ["agent-keys", "all"],
    queryFn: api.agentKeys.listAll,
    enabled: seesAllKeys,
    retry: false,
  });
  const sorted = useMemo(() => sortMembers(members.data ?? []), [members.data]);
  const paging = usePaging(sorted, matches);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [draft, setDraft] = useState<InviteDraft | undefined>();
  const [toRole, setToRole] = useState<Member | undefined>();
  const [toSites, setToSites] = useState<Member | undefined>();
  const multiSite = (useSites().data?.length ?? 0) > 1;
  const [toRemove, setToRemove] = useState<Member | undefined>();
  const [toReset, setToReset] = useState<Member | undefined>();
  const [toTransfer, setToTransfer] = useState<Member | undefined>();
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: api.invites.list,
    enabled: invite.allowed && me?.can !== undefined,
    retry: false,
  });
  const notEnabled = isNotEnabled(members.error);
  const manager = { userId: me?.userId, canManage };
  const isOwner = me?.role === "owner";
  const openInvite = (from?: InviteDraft) => {
    setDraft(from);
    setInviteOpen(true);
  };
  const setView = (next: string) =>
    navigate({ to: "/team", search: next === "activity" ? { view: "activity" } : {} });

  return (
    <PageLayout
      crumbs={<Crumbs trail={[{ label: t("pageHeaders.team.title") }]} />}
      icon={<UsersThree size={24} />}
      title={t("pageHeaders.team.title")}
      description={t("pageHeaders.team.description")}
      tabs={[
        { value: "members", label: t("members.tabs.members") },
        { value: "activity", label: t("members.tabs.activity") },
      ]}
      tab={view}
      onTabChange={setView}
      actions={
        <Button
          variant="primary"
          icon={<UserPlus />}
          onClick={() => openInvite()}
          disabled={!invite.allowed || notEnabled}
          title={invite.reason}
        >
          {t("members.invite")}
        </Button>
      }
      aside={
        view === "members" ? (
          <>
            <SectionCard
              title={t("members.roles.title")}
              icon={<ShieldCheck size={16} />}
              description={t("members.roles.description")}
              flush
            >
              <RoleList roles={rules.names} current={me?.role ?? undefined} />
            </SectionCard>
            <HowInvitesWork />
          </>
        ) : undefined
      }
    >
      {notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("members.notEnabledTitle")}
          description={t("members.notEnabledDescription")}
        />
      ) : view === "activity" ? (
        seesActivity.allowed ? (
          <ActivityList source={{ kind: "deployment" }} />
        ) : (
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            title={t("members.activity.restrictedTitle")}
            description={seesActivity.reason ?? ""}
          />
        )
      ) : (
        <>
          <ErrorBanner
            error={members.error}
            onRetry={() => members.refetch()}
            retrying={members.isFetching}
          />
          <ListToolbar
            search={paging.search}
            onSearch={paging.setSearch}
            placeholder={t("members.search")}
          />
          {members.isSuccess && sorted.length === 0 ? (
            <Empty
              icon={<UsersThree size={48} className="text-kumo-inactive" />}
              title={t("members.empty")}
              description={t("members.emptyDescription")}
            />
          ) : (
            <LayerCard className="overflow-x-auto p-0">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{t("members.columns.member")}</Table.Head>
                    {/* Phones: the role sits under the name and Joined is left out, so the
                        row fits next to its menu without scrolling sideways. */}
                    <Table.Head className="hidden sm:table-cell">
                      {t("members.columns.role")}
                    </Table.Head>
                    <Table.Head className="hidden sm:table-cell">
                      {t("members.columns.joined")}
                    </Table.Head>
                    <Table.Head sticky="right" className="w-12">
                      <span className="sr-only">{t("members.columns.actions")}</span>
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                {members.isPending ? (
                  <TableSkeleton columns={4} rows={3} />
                ) : paging.pageItems.length === 0 ? (
                  <Table.Body>
                    <Table.Row>
                      <Table.Cell colSpan={4}>
                        <SectionEmpty
                          icon={<UsersThree size={32} className="text-kumo-inactive" />}
                          title={t("members.noMatches", { query: paging.search })}
                        />
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                ) : (
                  <Table.Body>
                    {paging.pageItems.map((m) => (
                      <MemberTableRow
                        key={m.userId}
                        member={m}
                        you={m.userId === me?.userId}
                        problem={roleChangeProblem(manager, m)}
                        isOwner={isOwner}
                        multiSite={multiSite}
                        on={{ setToRole, setToSites, setToReset, setToTransfer, setToRemove }}
                      />
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
              controls="simple"
            />
          )}
          {/* Pending invites need `members:invite`; wait for /api/me so others never see a 403. */}
          {invite.allowed && me && (
            <InvitesCard onReinvite={(d) => openInvite(d)} onInvite={() => openInvite()} />
          )}
        </>
      )}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) setDraft(undefined);
        }}
        draft={draft}
      />
      <ChangeRoleDialog member={toRole} onOpenChange={(o) => !o && setToRole(undefined)} />
      <MemberSitesDialog member={toSites} onOpenChange={(o) => !o && setToSites(undefined)} />
      <RemoveMemberDialog
        member={toRemove}
        keyCount={
          toRemove && allKeys.data
            ? allKeys.data.filter((k) => k.owner?.userId === toRemove.userId && k.enabled).length
            : undefined
        }
        inviteCount={
          toRemove && invites.data
            ? invites.data.filter(
                (i) => i.inviter.userId === toRemove.userId && i.status === "pending",
              ).length
            : undefined
        }
        onOpenChange={(o) => !o && setToRemove(undefined)}
      />
      <ResetLinkDialog member={toReset} onOpenChange={(o) => !o && setToReset(undefined)} />
      <TransferOwnershipDialog
        member={toTransfer}
        onOpenChange={(o) => !o && setToTransfer(undefined)}
      />
    </PageLayout>
  );
}
