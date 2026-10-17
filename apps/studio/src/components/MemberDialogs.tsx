import {
  Avatar,
  Badge,
  Banner,
  ClipboardText,
  InsetPanel,
  LayerDialog,
  Select,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  ClockCountdown,
  Crown,
  Info,
  Key,
  ShieldWarning,
  SignOut,
  Warning,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { initials } from "../lib/account.ts";
import { absoluteTime } from "../lib/activity.ts";
import { sortScopes } from "../lib/agents.ts";
import {
  api,
  errorCode,
  errorDetail,
  type KeyNarrowing,
  type Member,
  type Role,
} from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { assignableRoles, expiresIn, type RankProblem, rank } from "../lib/roles.ts";
import { ModeBadge } from "./AgentModes.tsx";
import { PasswordField } from "./PasswordField.tsx";
import { RoleBadge } from "./Roles.tsx";
import { ScopeBadge } from "./ScopeBadge.tsx";
import { useToast } from "./Toast.ts";
import { MEMBERS_KEY, useRoleRules } from "./useMe.ts";

/** Keep showing the last member while a dialog animates closed (`undefined` closes it). */
function useLast<T>(value: T | undefined): T | undefined {
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  return value ?? last.current;
}

/** Avatar, name and email (when the caller may see it), for dialog headers and table cells. */
export function MemberIdentity({
  member,
  you = false,
  size = "base",
}: {
  member: Pick<Member, "name" | "email">;
  you?: boolean;
  size?: "sm" | "base";
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar initials={initials(member.name, member.email)} size={size} />
      <div className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <Text bold as="span" truncate>
            {member.name || member.email || "—"}
          </Text>
          {you && <Badge variant="outline">{t("members.you")}</Badge>}
        </span>
        {member.email && (
          <Text variant="secondary" size="sm" as="span" truncate>
            {member.email}
          </Text>
        )}
      </div>
    </div>
  );
}

/** A 403 `rank` in the person's language (`details.problem`). */
export function useRankMessage() {
  const t = useT();
  return (error: unknown): string | undefined => {
    if (errorCode(error) !== "rank") return undefined;
    const problem = errorDetail(error, "problem") as RankProblem | undefined;
    return problem ? t(`members.rank.${problem}`) : t("members.rank.not_allowed");
  };
}

function KeyNarrowingRow({ change }: { change: KeyNarrowing }) {
  const t = useT();
  const modeChanged = change.mode.from !== change.mode.to;
  return (
    <div className="grid gap-2 py-3 first:pt-0 last:pb-0" data-narrowed-key={change.keyId}>
      <span className="flex items-center gap-2">
        <Key size={16} className="shrink-0 text-kumo-subtle" />
        <Text bold as="span">
          {change.name ?? t("agents.unnamed")}
        </Text>
      </span>
      {modeChanged && (
        <span className="flex flex-wrap items-center gap-1.5">
          <Text variant="secondary" size="sm" as="span">
            {t("members.role.narrowedMode")}
          </Text>
          <ModeBadge mode={change.mode.from} subtle />
          <ArrowRight size={12} className="text-kumo-subtle" aria-hidden />
          <ModeBadge mode={change.mode.to} />
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Text variant="secondary" size="sm" as="span">
          {t("members.role.narrowedScopes")}
        </Text>
        {sortScopes(change.scopes.to).map((s) => (
          <ScopeBadge key={s} scope={s} />
        ))}
      </div>
      {change.elevationEnded && (
        <Text variant="secondary" size="sm">
          {t("members.role.elevationEnded")}
        </Text>
      )}
    </div>
  );
}

/**
 * Change role (DESIGN.md §2q): the member, a role `Select` (every role but Owner — ownership moves
 * by transfer), what a demotion does to their agent keys, then — when keys were narrowed — the
 * server's `keysNarrowed` list before the dialog closes. A 403 `rank` stays in the dialog.
 */
export function ChangeRoleDialog({
  member: current,
  onOpenChange,
}: {
  member: Member | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useRoleRules();
  const rankMessage = useRankMessage();
  const member = useLast(current);
  const [role, setRole] = useState<Role>(current?.role ?? "contributor");
  const [narrowed, setNarrowed] = useState<KeyNarrowing[] | undefined>();
  const change = useMutation({
    mutationFn: ({ userId, to }: { userId: string; to: Role }) => api.members.setRole(userId, to),
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: MEMBERS_KEY }),
        qc.invalidateQueries({ queryKey: ["agent-keys"] }),
      ]);
      const name = result.member.name;
      const to = t(`roles.names.${result.member.role}`);
      // Keys narrowed: say which before closing (RFC-0005 §5.3); otherwise a toast is enough.
      if (result.keysNarrowed.length > 0) setNarrowed(result.keysNarrowed);
      else onOpenChange(false);
      toast.success(t("members.role.changed"), t("members.role.changedDescription", { name, to }));
    },
  });
  // Each opening starts from the member's current role.
  useEffect(() => {
    if (current) {
      setRole(current.role);
      setNarrowed(undefined);
      change.reset();
    }
  }, [current?.userId]);
  const from = member?.role ?? "contributor";
  const demotion = rank(role) < rank(from);
  const unchanged = role === from;
  const failure = change.error ? (rankMessage(change.error) ?? apiErrorText(t, change.error)) : "";

  return (
    <LayerDialog.Root
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={change.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {narrowed
            ? t("members.role.narrowedTitle")
            : t("members.role.title", { name: member?.name ?? "" })}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {narrowed
            ? t("members.role.narrowedDescription", { count: narrowed.length })
            : t("members.role.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {narrowed ? (
            <div className="grid gap-4" data-testid="keys-narrowed">
              <Banner
                variant="default"
                icon={<Info weight="fill" />}
                title={t("members.role.narrowedBanner", { count: narrowed.length })}
                description={t("members.role.narrowedBannerDescription")}
              />
              <InsetPanel label={t("members.role.narrowedTitle")}>
                <div className="divide-y divide-kumo-hairline">
                  {narrowed.map((n) => (
                    <KeyNarrowingRow key={n.keyId} change={n} />
                  ))}
                </div>
              </InsetPanel>
            </div>
          ) : (
            <div className="grid gap-5">
              {member && (
                <InsetPanel layout="row" label={t("members.role.member")}>
                  <MemberIdentity member={member} />
                  <RoleBadge value={member.role} />
                </InsetPanel>
              )}
              {change.error && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("members.role.failed")}
                  description={failure}
                />
              )}
              <Select
                className="w-full"
                label={t("members.role.newRole")}
                value={role}
                onValueChange={(v) => setRole(v as Role)}
                items={Object.fromEntries(
                  assignableRoles(rules).map((r) => [r, t(`roles.names.${r}`)]),
                )}
                description={t(`roles.summaries.${role}`)}
              />
              {!unchanged && (
                <InsetPanel layout="row" label={t("members.role.change")}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Text variant="secondary" size="sm" as="span">
                      {t("members.role.now")}
                    </Text>
                    <RoleBadge value={from} tooltip={false} />
                    <ArrowRight size={14} className="text-kumo-subtle" aria-hidden />
                    <RoleBadge value={role} tooltip={false} />
                  </span>
                  <Text variant="secondary" size="sm" as="span">
                    {t("members.role.immediate")}
                  </Text>
                </InsetPanel>
              )}
              {demotion && (
                <Banner
                  variant="alert"
                  size="sm"
                  icon={<Key weight="fill" />}
                  title={t("members.role.demotionTitle")}
                  description={t("members.role.demotion", { role: t(`roles.names.${role}`) })}
                />
              )}
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={narrowed ? t("common.close") : t("common.cancel")}>
          {narrowed ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {t("members.role.done")}
            </LayerDialog.Actions.Primary>
          ) : (
            <LayerDialog.Actions.Primary
              onClick={() => member && change.mutate({ userId: member.userId, to: role })}
              loading={change.isPending}
              disabled={unchanged}
            >
              {t("members.role.submit")}
            </LayerDialog.Actions.Primary>
          )}
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** One consequence line in a confirmation: icon aligned with the first line of text. */
function Consequence({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-lh items-center text-kumo-subtle">{icon}</span>
      <Text size="sm">{children}</Text>
    </div>
  );
}

/**
 * Remove a member (RFC-0005 §3, I13): what happens, in order — membership gone at once, signed out
 * everywhere, their agent keys disabled (counted when the caller can see every key), their pending
 * invites cancelled, their agents' waiting requests denied — then a toast with the server's counts.
 */
export function RemoveMemberDialog({
  member: current,
  keyCount,
  inviteCount,
  onOpenChange,
}: {
  member: Member | undefined;
  /** Their agent keys, when the caller can list every key; else unknown. */
  keyCount: number | undefined;
  /** Their pending invites, when the caller can list invites. */
  inviteCount: number | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const rankMessage = useRankMessage();
  const member = useLast(current);
  const remove = useMutation({
    mutationFn: (userId: string) => api.members.remove(userId),
    onSuccess: async (result) => {
      onOpenChange(false);
      toast.success(
        t("members.remove.done", { name: member?.name ?? "" }),
        t("members.remove.doneDescription", {
          keys: result.keysDisabled,
          invites: result.invitesCanceled,
          requests: result.requestsDenied,
        }),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: MEMBERS_KEY }),
        qc.invalidateQueries({ queryKey: ["invites"] }),
        qc.invalidateQueries({ queryKey: ["agent-keys"] }),
        qc.invalidateQueries({ queryKey: ["approvals"] }),
      ]);
    },
  });
  useEffect(() => {
    if (current) remove.reset();
  }, [current?.userId]);
  return (
    <LayerDialog.Alert
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={remove.isPending}
    >
      <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {t("members.remove.title", { name: member?.name ?? "" })}
        </LayerDialog.Title>
        <LayerDialog.Description>{t("members.remove.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="remove-member">
            {member && (
              <InsetPanel layout="row" label={t("members.role.member")}>
                <MemberIdentity member={member} size="sm" />
                <RoleBadge value={member.role} tooltip={false} />
              </InsetPanel>
            )}
            <div className="grid gap-2">
              <Consequence icon={<SignOut size={16} />}>{t("members.remove.signOut")}</Consequence>
              <Consequence icon={<Key size={16} />}>
                {keyCount === undefined
                  ? t("members.remove.keys")
                  : t("members.remove.keysCount", { count: keyCount })}
              </Consequence>
              <Consequence icon={<XCircle size={16} />}>
                {inviteCount === undefined
                  ? t("members.remove.invites")
                  : t("members.remove.invitesCount", { count: inviteCount })}
              </Consequence>
              <Consequence icon={<ClockCountdown size={16} />}>
                {t("members.remove.requests")}
              </Consequence>
              <Consequence icon={<Info size={16} />}>{t("members.remove.kept")}</Consequence>
            </div>
            {remove.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("members.remove.failed")}
                description={rankMessage(remove.error) ?? apiErrorText(t, remove.error)}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            loading={remove.isPending}
            onClick={() => member && remove.mutate(member.userId)}
          >
            {t("members.remove.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}

/**
 * A one-time password reset link for a member (RFC-0005 open question 6): confirm, then the link
 * once — copy, when it expires (one hour), share it privately; issuing a new one voids older ones.
 */
export function ResetLinkDialog({
  member: current,
  onOpenChange,
}: {
  member: Member | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const rankMessage = useRankMessage();
  const member = useLast(current);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | undefined>();
  const issue = useMutation({
    mutationFn: (userId: string) => api.members.passwordReset(userId),
    onSuccess: (result) => setLink(result),
  });
  useEffect(() => {
    if (current) {
      setLink(undefined);
      issue.reset();
    } else setLink(undefined);
  }, [current?.userId]);
  return (
    <LayerDialog.Root
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={issue.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {link ? t("members.reset.revealTitle") : t("members.reset.title")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {link
            ? t("members.reset.revealDescription", { name: member?.name ?? "" })
            : t("members.reset.description", { name: member?.name ?? "" })}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {link ? (
            <div className="grid gap-5" data-testid="reset-reveal">
              <Banner
                variant="alert"
                icon={<Warning weight="fill" />}
                title={t("members.reset.warningTitle")}
                description={t("members.reset.warning")}
              />
              <div className="grid min-w-0 gap-1.5">
                <Text size="sm" bold as="span">
                  {t("members.reset.link")}
                </Text>
                <ClipboardText
                  size="lg"
                  text={link.url}
                  tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
                />
              </div>
              <InsetPanel>
                <div className="flex items-start gap-2">
                  <span className="flex h-lh items-center text-kumo-subtle">
                    <ClockCountdown size={16} />
                  </span>
                  <Text variant="secondary" size="sm">
                    {t("members.reset.expires", {
                      relative: expiresIn(link.expiresAt, locale),
                      absolute: absoluteTime(link.expiresAt, locale),
                    })}
                  </Text>
                </div>
              </InsetPanel>
            </div>
          ) : (
            <div className="grid gap-4">
              {member && (
                <InsetPanel layout="row" label={t("members.role.member")}>
                  <MemberIdentity member={member} size="sm" />
                  <RoleBadge value={member.role} tooltip={false} />
                </InsetPanel>
              )}
              <div className="grid gap-2">
                <Consequence icon={<ClockCountdown size={16} />}>
                  {t("members.reset.once")}
                </Consequence>
                <Consequence icon={<SignOut size={16} />}>
                  {t("members.reset.signsOut")}
                </Consequence>
                <Consequence icon={<ShieldWarning size={16} />}>
                  {t("members.reset.replaces")}
                </Consequence>
              </div>
              {issue.error && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("members.reset.failed")}
                  description={rankMessage(issue.error) ?? apiErrorText(t, issue.error)}
                />
              )}
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={link ? t("common.close") : t("common.cancel")}>
          {link ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {t("members.reset.done")}
            </LayerDialog.Actions.Primary>
          ) : (
            <LayerDialog.Actions.Primary
              loading={issue.isPending}
              onClick={() => member && issue.mutate(member.userId)}
            >
              {t("members.reset.submit")}
            </LayerDialog.Actions.Primary>
          )}
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/**
 * Transfer ownership (RFC-0005 §3): Owner only, to an Administrator, with the password re-entered.
 * Strong words: the Owner becomes an Administrator, only the new Owner can move it back, and
 * there is exactly one Owner. `wrong_password` lands on the field; other refusals stay in the dialog.
 */
export function TransferOwnershipDialog({
  member: current,
  onOpenChange,
}: {
  member: Member | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const rankMessage = useRankMessage();
  const member = useLast(current);
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const transfer = useMutation({
    mutationFn: ({ userId, pw }: { userId: string; pw: string }) =>
      api.members.transferOwnership(userId, pw),
    onSuccess: async () => {
      onOpenChange(false);
      toast.success(
        t("members.transfer.done"),
        t("members.transfer.doneDescription", { name: member?.name ?? "" }),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: MEMBERS_KEY }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["agent-keys"] }),
      ]);
    },
  });
  useEffect(() => {
    if (current) {
      setPassword("");
      setSubmitted(false);
      transfer.reset();
    } else setPassword("");
  }, [current?.userId]);
  const code = errorCode(transfer.error);
  const passwordError =
    code === "wrong_password"
      ? t("members.transfer.wrongPassword")
      : submitted && !password
        ? t("members.transfer.passwordRequired")
        : undefined;
  const submit = () => {
    setSubmitted(true);
    if (!member || !password || transfer.isPending) return;
    transfer.mutate({ userId: member.userId, pw: password });
  };
  const other =
    transfer.error && code !== "wrong_password"
      ? code === "not_administrator"
        ? t("members.transfer.notAdministrator")
        : (rankMessage(transfer.error) ?? apiErrorText(t, transfer.error))
      : undefined;
  return (
    <LayerDialog.Alert
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={transfer.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {t("members.transfer.title", { name: member?.name ?? "" })}
        </LayerDialog.Title>
        <LayerDialog.Description>{t("members.transfer.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="transfer-ownership">
            <Banner
              variant="alert"
              icon={<Crown weight="fill" />}
              title={t("members.transfer.warningTitle")}
              description={t("members.transfer.warning", { name: member?.name ?? "" })}
            />
            {member && (
              <InsetPanel layout="row" label={t("members.transfer.to")}>
                <MemberIdentity member={member} size="sm" />
                <span className="flex items-center gap-1.5">
                  <RoleBadge value={member.role} tooltip={false} />
                  <ArrowRight size={12} className="text-kumo-subtle" aria-hidden />
                  <RoleBadge value="owner" tooltip={false} />
                </span>
              </InsetPanel>
            )}
            <div className="grid gap-2">
              <Consequence icon={<Crown size={16} />}>
                {t("members.transfer.youBecome")}
              </Consequence>
              <Consequence icon={<Key size={16} />}>{t("members.transfer.keys")}</Consequence>
              <Consequence icon={<ShieldWarning size={16} />}>
                {t("members.transfer.onlyThey")}
              </Consequence>
            </div>
            {other && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("members.transfer.failed")}
                description={other}
              />
            )}
            <PasswordField
              label={t("members.transfer.password")}
              description={t("members.transfer.passwordHint")}
              value={password}
              onValueChange={setPassword}
              error={passwordError}
              autoComplete="current-password"
              onEnter={submit}
            />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            loading={transfer.isPending}
            onClick={submit}
          >
            {t("members.transfer.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}
