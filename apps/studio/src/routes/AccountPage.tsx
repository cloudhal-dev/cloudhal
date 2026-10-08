import {
  Badge,
  Banner,
  Breadcrumbs,
  Button,
  Checkbox,
  InlineCopyText,
  Input,
  PageHeader,
  SkeletonLine,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  Desktop,
  DeviceMobile,
  DeviceTablet,
  House,
  Info,
  Question,
  ShieldWarning,
  SignIn,
  SignOut,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Content } from "../components/AppFrame.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { SettingRow, SettingsLayout, SettingsSection } from "../components/Settings.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { type MessageKey, useI18n, useT } from "../i18n/index.tsx";
import {
  type DeviceInfo,
  describeUserAgent,
  hasErrors,
  initials,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  type PasswordChange,
  type PasswordErrors,
  passwordServerError,
  sortSessions,
  toIso,
  validateName,
  validatePasswordChange,
} from "../lib/account.ts";
import { api, type InstanceFeature, type InstanceInfo, type SignUpPolicy } from "../lib/api.ts";
import {
  AuthRequestError,
  account,
  authClient,
  type CurrentUser,
  isSessionNotFresh,
  type UserSession,
} from "../lib/auth.ts";

const SECTIONS = ["profile", "password", "sessions", "access"] as const;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Avatar({ name, email }: { name: string; email: string }) {
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-kumo-tint ring ring-kumo-line"
    >
      <Text bold as="span">
        {initials(name, email)}
      </Text>
    </span>
  );
}

function ProfileSection({ me, pending }: { me: CurrentUser | null | undefined; pending: boolean }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  // The id activity and snapshots record (`user_…`), not Better Auth's internal user id.
  const actor = useQuery({ queryKey: ["me"], queryFn: api.me });
  const saved = me?.user.name ?? "";
  const [name, setName] = useState(saved);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => setName(saved), [saved]);
  const dirty = name.trim() !== saved;
  const nameError = attempted ? validateName(name) : undefined;

  const save = useMutation({
    mutationFn: (next: string) => account.updateName(next),
    onSuccess: async () => {
      setAttempted(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["auth-session"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
      toast.success(t("account.profile.saved"));
    },
  });
  const submit = () => {
    setAttempted(true);
    if (!dirty || validateName(name)) return;
    save.mutate(name.trim());
  };
  const since = toIso(me?.user.createdAt);

  return (
    <SettingsSection
      id="profile"
      title={t("account.sections.profile")}
      description={t("account.profile.description")}
      footer={
        <>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setName(saved);
                setAttempted(false);
                save.reset();
              }}
              disabled={save.isPending}
            >
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={submit}
            loading={save.isPending}
            disabled={!dirty || pending}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {pending || !me ? (
        <div className="grid gap-3" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={60} maxWidth={80} />
          <SkeletonLine minWidth={60} maxWidth={80} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Avatar name={me.user.name} email={me.user.email} />
            <div className="grid min-w-0 gap-0.5">
              <Text bold truncate as="span">
                {me.user.name || me.user.email}
              </Text>
              <Text variant="secondary" size="sm" truncate as="span">
                {me.user.email}
              </Text>
              {since && (
                <Text variant="secondary" size="sm" as="span">
                  {t("account.profile.memberSince", {
                    date: new Date(since).toLocaleDateString(locale, { dateStyle: "long" }),
                  })}
                </Text>
              )}
            </div>
          </div>
          {save.error && (
            <Banner
              variant="error"
              size="sm"
              icon={<WarningCircle weight="fill" />}
              title={t("account.profile.failed")}
              description={errorMessage(save.error)}
            />
          )}
          <Input
            className="w-full"
            label={t("account.profile.name")}
            description={t("account.profile.nameHint")}
            value={name}
            onValueChange={setName}
            autoComplete="name"
            maxLength={NAME_MAX + 50}
            error={
              nameError ? t(`account.profile.errors.${nameError}`, { max: NAME_MAX }) : undefined
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Input
            className="w-full text-kumo-subtle"
            label={t("account.profile.email")}
            description={t("account.profile.emailHint")}
            value={me.user.email}
            type="email"
            readOnly
          />
          <dl className="-my-3 border-kumo-hairline border-t">
            <SettingRow
              label={t("account.profile.actorId")}
              hint={t("account.profile.actorIdHint")}
            >
              {actor.data ? (
                <InlineCopyText>{actor.data.actor.id}</InlineCopyText>
              ) : (
                <SkeletonLine minWidth={40} maxWidth={60} />
              )}
            </SettingRow>
          </dl>
        </>
      )}
    </SettingsSection>
  );
}

const EMPTY_PASSWORDS: PasswordChange = { current: "", next: "", confirm: "" };

function passwordMessages(t: ReturnType<typeof useT>, errors: PasswordErrors) {
  const map: Record<string, MessageKey> = {
    "current:required": "account.password.errors.currentRequired",
    "current:wrong": "account.password.errors.currentWrong",
    "next:required": "account.password.errors.newRequired",
    "next:tooShort": "account.password.errors.tooShort",
    "next:tooLong": "account.password.errors.tooLong",
    "next:same": "account.password.errors.same",
    "confirm:required": "account.password.errors.confirmRequired",
    "confirm:mismatch": "account.password.errors.mismatch",
  };
  const message = (field: keyof PasswordErrors) => {
    const code = errors[field];
    const key = code ? map[`${field}:${code}`] : undefined;
    return key ? t(key, { min: PASSWORD_MIN, max: PASSWORD_MAX }) : undefined;
  };
  return { current: message("current"), next: message("next"), confirm: message("confirm") };
}

function PasswordSection() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<PasswordChange>(EMPTY_PASSWORDS);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<PasswordErrors>({});
  const change = useMutation({
    mutationFn: () =>
      account.changePassword({
        currentPassword: values.current,
        newPassword: values.next,
        revokeOtherSessions: signOutOthers,
      }),
    onSuccess: async () => {
      setValues(EMPTY_PASSWORDS);
      setAttempted(false);
      await qc.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast.success(
        t("account.password.changed"),
        signOutOthers ? t("account.password.changedOthers") : undefined,
      );
    },
    onError: (e) => {
      const fields = passwordServerError(e instanceof AuthRequestError ? e.code : undefined);
      if (fields) setServerErrors(fields);
    },
  });
  const local = attempted ? validatePasswordChange(values) : {};
  const messages = passwordMessages(t, { ...local, ...serverErrors });
  const set = (field: keyof PasswordChange) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
  };
  const submit = () => {
    setAttempted(true);
    setServerErrors({});
    if (hasErrors(validatePasswordChange(values)) || change.isPending) return;
    change.mutate();
  };
  const unmapped =
    change.error &&
    !passwordServerError(change.error instanceof AuthRequestError ? change.error.code : undefined);

  return (
    <SettingsSection
      id="password"
      title={t("account.sections.password")}
      description={t("account.password.description")}
      footer={
        <Button variant="primary" onClick={submit} loading={change.isPending}>
          {t("account.password.submit")}
        </Button>
      }
    >
      {/* No form element: Kumo's Checkbox is a button and would submit it (DESIGN.md §7). */}
      {unmapped && (
        <Banner
          variant="error"
          size="sm"
          icon={<WarningCircle weight="fill" />}
          title={t("account.password.failed")}
          description={errorMessage(change.error)}
        />
      )}
      <PasswordField
        label={t("account.password.current")}
        value={values.current}
        onValueChange={set("current")}
        error={messages.current}
        autoComplete="current-password"
        onEnter={submit}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <PasswordField
          label={t("account.password.new")}
          description={t("account.password.newHint", { min: PASSWORD_MIN })}
          value={values.next}
          onValueChange={set("next")}
          error={messages.next}
          autoComplete="new-password"
          onEnter={submit}
        />
        <PasswordField
          label={t("account.password.confirm")}
          value={values.confirm}
          onValueChange={set("confirm")}
          error={messages.confirm}
          autoComplete="new-password"
          onEnter={submit}
        />
      </div>
      <div className="grid gap-1">
        <Checkbox
          checked={signOutOthers}
          onCheckedChange={(on) => setSignOutOthers(on === true)}
          label={t("account.password.signOutOthers")}
        />
        <span className="pl-6">
          <Text variant="secondary" size="sm">
            {t("account.password.signOutOthersHint")}
          </Text>
        </span>
      </div>
    </SettingsSection>
  );
}

const DEVICE_ICONS = {
  desktop: Desktop,
  mobile: DeviceMobile,
  tablet: DeviceTablet,
  cli: TerminalWindow,
  unknown: Question,
} as const;

function deviceLabel(t: ReturnType<typeof useT>, device: DeviceInfo): string {
  if (device.browser && device.os)
    return t("account.sessions.deviceOn", { browser: device.browser, os: device.os });
  return device.browser ?? device.os ?? t("account.sessions.unknownDevice");
}

function SessionsSection({ currentToken }: { currentToken: string | undefined }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: account.sessions,
    retry: (count, error) => !isSessionNotFresh(error) && count < 1,
  });
  const [toRevoke, setToRevoke] = useState<UserSession | undefined>();
  const [othersOpen, setOthersOpen] = useState(false);
  const revoke = useMutation({
    mutationFn: (s: UserSession) => account.revokeSession(s.token),
    onSuccess: async () => {
      setToRevoke(undefined);
      await qc.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast.success(t("account.sessions.revoked"));
    },
  });
  const revokeOthers = useMutation({
    mutationFn: account.revokeOtherSessions,
    onSuccess: async () => {
      setOthersOpen(false);
      await qc.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast.success(t("account.sessions.revokedOthers"));
    },
  });
  const rows = sortSessions(sessions.data ?? [], currentToken);
  const others = rows.filter((s) => s.token !== currentToken).length;
  const stale = isSessionNotFresh(sessions.error);
  const describe = (s: UserSession) => deviceLabel(t, describeUserAgent(s.userAgent));

  return (
    <SettingsSection
      id="sessions"
      title={t("account.sections.sessions")}
      description={t("account.sessions.description")}
      flush
      aside={
        <>
          {sessions.data && (
            <Badge variant="secondary">
              {t("account.sessions.count", { count: sessions.data.length })}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<SignOut />}
            disabled={others === 0}
            onClick={() => setOthersOpen(true)}
          >
            {t("account.sessions.signOutOthers")}
          </Button>
        </>
      }
    >
      {stale ? (
        <div className="px-5 py-4">
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            title={t("account.sessions.staleTitle")}
            description={t("account.sessions.staleDescription")}
            action={
              <Banner.Action
                variant="secondary"
                icon={<SignIn />}
                onClick={async () => {
                  await authClient.signOut();
                  await navigate({ to: "/login" });
                }}
              >
                {t("account.sessions.signInAgain")}
              </Banner.Action>
            }
          />
        </div>
      ) : sessions.error ? (
        <div className="px-5 py-4">
          <ErrorBanner
            error={sessions.error}
            onRetry={() => sessions.refetch()}
            retrying={sessions.isFetching}
          />
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("account.sessions.columns.device")}</Table.Head>
              <Table.Head>{t("account.sessions.columns.ip")}</Table.Head>
              <Table.Head>{t("account.sessions.columns.lastActive")}</Table.Head>
              <Table.Head>{t("account.sessions.columns.signedIn")}</Table.Head>
              <Table.Head sticky="right" />
            </Table.Row>
          </Table.Header>
          {sessions.isPending ? (
            <TableSkeleton columns={5} rows={2} />
          ) : (
            <Table.Body>
              {rows.map((s) => {
                const device = describeUserAgent(s.userAgent);
                const Icon = DEVICE_ICONS[device.kind];
                const isCurrent = s.token === currentToken;
                const label = deviceLabel(t, device);
                const lastActive = toIso(s.updatedAt);
                const signedIn = toIso(s.createdAt);
                return (
                  <Table.Row
                    key={s.id}
                    data-session-id={s.id}
                    data-current={isCurrent || undefined}
                  >
                    <Table.Cell className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <Icon size={20} className="shrink-0 text-kumo-subtle" />
                        <div className="grid gap-0.5">
                          <Tooltip content={s.userAgent ?? t("account.sessions.unknownDevice")}>
                            <Text bold as="span">
                              {label}
                            </Text>
                          </Tooltip>
                          {isCurrent && (
                            <span>
                              <Badge variant="info">{t("account.sessions.current")}</Badge>
                            </span>
                          )}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {s.ipAddress ? (
                        <Text variant="mono-secondary" as="span">
                          {s.ipAddress}
                        </Text>
                      ) : (
                        <Text variant="secondary" as="span">
                          {t("account.sessions.unknownIp")}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {lastActive && <RelativeTime iso={lastActive} />}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {signedIn && <RelativeTime iso={signedIn} />}
                    </Table.Cell>
                    <Table.Cell sticky="right" className="text-right">
                      {!isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<SignOut />}
                          aria-label={t("account.sessions.revokeLabel", { device: label })}
                          onClick={() => setToRevoke(s)}
                        >
                          {t("account.sessions.revoke")}
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
              {others === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={5}>
                    <Text variant="secondary" size="sm">
                      {t("account.sessions.onlyThis")}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          )}
        </Table>
      )}
      <ConfirmDialog
        open={toRevoke !== undefined}
        onOpenChange={(o) => {
          if (!o) {
            setToRevoke(undefined);
            revoke.reset();
          }
        }}
        title={t("account.sessions.revokeTitle")}
        description={t("account.sessions.revokeDescription", {
          device: toRevoke ? describe(toRevoke) : "",
        })}
        detail={toRevoke?.ipAddress ?? undefined}
        confirmLabel={t("account.sessions.revoke")}
        busy={revoke.isPending}
        error={revoke.error ? errorMessage(revoke.error) : undefined}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
      <ConfirmDialog
        open={othersOpen}
        onOpenChange={(o) => {
          setOthersOpen(o);
          if (!o) revokeOthers.reset();
        }}
        title={t("account.sessions.revokeOthersTitle")}
        description={t("account.sessions.revokeOthersDescription")}
        confirmLabel={t("account.sessions.signOutOthers")}
        busy={revokeOthers.isPending}
        error={revokeOthers.error ? errorMessage(revokeOthers.error) : undefined}
        onConfirm={() => revokeOthers.mutate()}
      />
    </SettingsSection>
  );
}

const POLICY_BADGE: Record<SignUpPolicy, "success" | "warning" | "neutral"> = {
  "first-user": "success",
  closed: "success",
  open: "warning",
  unknown: "neutral",
};
const FEATURES: InstanceFeature[] = [
  "mcp",
  "agentKeys",
  "activity",
  "previewLinks",
  "deployTransfer",
];

function AccessSection({
  instance,
  pending,
  error,
  onRetry,
}: {
  instance: InstanceInfo | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useT();
  const policy = instance?.signUp;
  return (
    <SettingsSection
      id="access"
      title={t("account.sections.access")}
      description={t("account.access.description")}
    >
      <ErrorBanner error={error} onRetry={onRetry} />
      {pending ? (
        <div className="grid gap-3" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <SkeletonLine minWidth={40} maxWidth={60} />
          <SkeletonLine minWidth={70} maxWidth={90} />
        </div>
      ) : (
        instance &&
        policy && (
          <>
            <dl className="-my-3" data-sign-up={policy}>
              <SettingRow
                label={t("account.access.signUp")}
                hint={t(`account.access.explanations.${policy}`)}
              >
                <Badge variant={POLICY_BADGE[policy]} appearance="dot">
                  {t(`account.access.policies.${policy}`)}
                </Badge>
              </SettingRow>
            </dl>
            {policy === "open" && (
              <Banner
                variant="alert"
                icon={<ShieldWarning weight="fill" />}
                title={t("account.access.openWarningTitle")}
                description={t("account.access.openWarning")}
              />
            )}
            <Text variant="secondary" size="sm">
              {t("account.access.howToChange")}
            </Text>
            <div className="grid gap-1 border-kumo-hairline border-t pt-4">
              <Text variant="heading" as="h3">
                {t("account.access.server")}
              </Text>
              <Text variant="secondary" size="sm">
                {t("account.access.serverDescription")}
              </Text>
              <dl className="divide-y divide-kumo-hairline">
                {FEATURES.map((f) => (
                  <SettingRow
                    key={f}
                    label={t(`account.access.features.${f}`)}
                    hint={t(`account.access.featureHints.${f}`)}
                  >
                    <span data-feature={f} data-enabled={instance.features[f]}>
                      {instance.features[f] ? (
                        <Badge variant="success" appearance="dot">
                          {t("common.on")}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" appearance="dot">
                          {t("common.off")}
                        </Badge>
                      )}
                    </span>
                  </SettingRow>
                ))}
              </dl>
            </div>
          </>
        )
      )}
    </SettingsSection>
  );
}

/** Account surface › Account (DESIGN.md §2c settings template, §2j). */
export function AccountPage() {
  const t = useT();
  const me = useQuery({ queryKey: ["auth-session"], queryFn: account.current });
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance });
  return (
    <Content>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs>
            <Breadcrumbs.Link href="/sites" icon={<House size={16} />}>
              {t("sites.title")}
            </Breadcrumbs.Link>
            <Breadcrumbs.Separator />
            <Breadcrumbs.Current>{t("account.title")}</Breadcrumbs.Current>
          </Breadcrumbs>
        }
        title={t("account.title")}
        description={t("account.description")}
      />
      <ErrorBanner error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />
      <SettingsLayout
        title={t("common.onThisPage")}
        sections={SECTIONS.map((id) => ({ id, label: t(`account.sections.${id}`) }))}
      >
        <ProfileSection me={me.data} pending={me.isPending} />
        <PasswordSection />
        <SessionsSection currentToken={me.data?.session.token} />
        <AccessSection
          instance={instance.data}
          pending={instance.isPending}
          error={instance.error}
          onRetry={() => instance.refetch()}
        />
      </SettingsLayout>
    </Content>
  );
}
