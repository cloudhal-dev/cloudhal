import {
  AuthLayout,
  Banner,
  Button,
  DirectionalIcon,
  Input,
  InsetPanel,
  LinkButton,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  ClockCountdown,
  LinkBreak,
  SignOut,
  SquaresFour,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { NewPasswordFields, newPasswordErrors } from "../components/NewPassword.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import { RoleBadge } from "../components/Roles.tsx";
import { useToast } from "../components/Toast.ts";
import { useI18n } from "../i18n/index.tsx";
import { NAME_MAX } from "../lib/account.ts";
import { absoluteTime } from "../lib/activity.ts";
import { ApiRequestError, api, errorCode, type InviteDetails } from "../lib/api.ts";
import { account, authClient } from "../lib/auth.ts";
import { expiresIn, forgetHashToken, INVITE_TOKEN_PREFIX, takeHashToken } from "../lib/roles.ts";

/** The dead-link answers: used, revoked or expired (410), or a link without its secret. */
function isGone(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 410;
}

/** A dead or incomplete link: say why plainly and offer the way to sign in. */
export function DeadLink({ title, description }: { title: string; description: string }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4" data-testid="dead-link">
      <Banner
        variant="error"
        icon={<LinkBreak weight="fill" />}
        title={title}
        description={description}
      />
      <LinkButton href="/login" variant="secondary" className="w-full justify-center">
        {t("inviteAccept.toSignIn")}
      </LinkButton>
    </div>
  );
}

/** Loading the link: skeleton lines in the card's place (never a spinner-only page). */
export function LinkSkeleton() {
  const { t } = useI18n();
  return (
    <div className="grid gap-3" role="status">
      <span className="sr-only">{t("common.loading")}</span>
      <SkeletonLine minWidth={50} maxWidth={70} />
      <SkeletonLine minWidth={80} maxWidth={95} />
      <SkeletonLine minWidth={40} maxWidth={60} />
    </div>
  );
}

function InviteSummary({ invite }: { invite: InviteDetails }) {
  const { t, locale } = useI18n();
  return (
    <InsetPanel label={t("inviteAccept.summary")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" variant="secondary" as="span">
          {t("inviteAccept.as")}
        </Text>
        <RoleBadge value={invite.role} />
      </div>
      <Text variant="secondary" size="sm">
        {t(`roles.summaries.${invite.role}`)}
      </Text>
      <div className="flex items-start gap-2">
        <span className="flex h-lh items-center text-kumo-subtle">
          <ClockCountdown size={16} />
        </span>
        <Text variant="secondary" size="sm">
          {t("inviteAccept.expires", {
            relative: expiresIn(invite.expiresAt, locale),
            absolute: absoluteTime(invite.expiresAt, locale),
          })}
        </Text>
      </div>
    </InsetPanel>
  );
}

/**
 * `/invite#chinv_…` (DESIGN.md §2r, RFC-0005 §7.3–7.4): the token is taken from the fragment and
 * stripped from the address bar at once; it is sent only in POST bodies. Inspect shows who invited
 * whom, as what, to which deployment, for which email (read-only — the invite fixes it). A new
 * account adds a name and a password (with strength guidance); an existing one (a removed person
 * invited back) enters its password. Accepting signs in and lands in Studio. Dead links (410),
 * someone else's session and every refusal are explained in place.
 */
export function InvitePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [token] = useState(() => takeHashToken(INVITE_TOKEN_PREFIX));
  const inspect = useQuery({
    queryKey: ["invite-inspect", token],
    queryFn: () => api.invites.inspect(token as string),
    enabled: token !== undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const session = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => account.current().catch(() => null),
    retry: false,
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(false);
  const invite = inspect.data;
  const isNew = invite?.account === "new";
  const signedInAs = session.data?.user.email;
  const otherSession =
    invite && signedInAs && signedInAs.toLowerCase() !== invite.email.toLowerCase();

  const accept = useMutation({
    mutationFn: () =>
      api.invites.accept({
        token: token as string,
        password,
        ...(isNew ? { name: name.replace(/\s+/g, " ").trim() } : {}),
      }),
    onSuccess: async (result) => {
      forgetHashToken(INVITE_TOKEN_PREFIX);
      // A new person is signed in: drop everything cached for whoever was before, but keep this
      // page's inspect answer so it is not asked again (the link is used now: 410).
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "invite-inspect" });
      toast.success(
        t("inviteAccept.welcome", { name: invite?.deploymentName ?? "" }),
        t("inviteAccept.welcomeDescription", { role: t(`roles.names.${result.role}`) }),
      );
      await navigate({ to: "/sites" });
    },
  });
  const signOut = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth-session"] }),
  });

  const code = errorCode(accept.error);
  const local = isNew
    ? newPasswordErrors(t, password, confirm)
    : { password: password ? undefined : t("passwords.errors.required") };
  const nameError = isNew
    ? !name.trim()
      ? t("inviteAccept.errors.nameRequired")
      : name.trim().length > NAME_MAX
        ? t("inviteAccept.errors.nameTooLong", { max: NAME_MAX })
        : undefined
    : undefined;
  const shown = {
    name:
      code === "name_required"
        ? t("inviteAccept.errors.nameRequired")
        : attempted
          ? nameError
          : undefined,
    password:
      code === "weak_password"
        ? t("inviteAccept.errors.weakPassword")
        : code === "wrong_password"
          ? t("inviteAccept.errors.wrongPassword")
          : attempted
            ? local.password
            : undefined,
    confirm: attempted && "confirm" in local ? local.confirm : undefined,
  };
  const submit = () => {
    setAttempted(true);
    accept.reset();
    if (accept.isPending || nameError || local.password || ("confirm" in local && local.confirm))
      return;
    accept.mutate();
  };
  const gone = isGone(inspect.error) || isGone(accept.error);

  const footer = (
    <>
      <Text variant="secondary" size="sm" as="span">
        {t("auth.footer")}
      </Text>
      <LanguageSwitch size="sm" />
    </>
  );
  const title = invite
    ? t("inviteAccept.title", { name: invite.deploymentName })
    : t("inviteAccept.titleGeneric");
  const description = invite
    ? t("inviteAccept.description", {
        inviter: invite.inviterName ?? t("inviteAccept.someone"),
        role: t(`roles.names.${invite.role}`),
      })
    : gone || token === undefined
      ? t("inviteAccept.descriptionDead")
      : t("inviteAccept.descriptionGeneric");

  return (
    <AuthLayout
      brand={<SquaresFour size={20} weight="fill" />}
      product={t("app.name")}
      title={title}
      description={description}
      footer={footer}
    >
      {token === undefined ? (
        <DeadLink title={t("inviteAccept.missingTitle")} description={t("inviteAccept.missing")} />
      ) : gone ? (
        <DeadLink title={t("inviteAccept.goneTitle")} description={t("inviteAccept.gone")} />
      ) : inspect.isPending ? (
        <LinkSkeleton />
      ) : inspect.error || !invite ? (
        <ErrorBanner error={inspect.error} onRetry={() => inspect.refetch()} />
      ) : (
        <div className="grid gap-4" data-testid="invite-form" data-account={invite.account}>
          <InviteSummary invite={invite} />
          {otherSession && (
            <Banner
              variant="alert"
              icon={<UserCircle weight="fill" />}
              title={t("inviteAccept.otherSessionTitle", { email: signedInAs })}
              description={t("inviteAccept.otherSession", { email: invite.email })}
              action={
                <Banner.Action
                  variant="secondary"
                  icon={<DirectionalIcon icon={SignOut} />}
                  loading={signOut.isPending}
                  onClick={() => signOut.mutate()}
                >
                  {t("common.signOut")}
                </Banner.Action>
              }
            />
          )}
          {code === "signed_in_as_other" && !otherSession && (
            <Banner
              variant="alert"
              icon={<UserCircle weight="fill" />}
              title={t("inviteAccept.otherSessionTitleGeneric")}
              description={t("inviteAccept.otherSession", { email: invite.email })}
            />
          )}
          {code === "already_member" && (
            <Banner
              variant="default"
              icon={<WarningCircle weight="fill" />}
              title={t("inviteAccept.alreadyMemberTitle")}
              description={t("inviteAccept.alreadyMember")}
              action={
                <Banner.Action
                  variant="secondary"
                  icon={<DirectionalIcon icon={ArrowRight} />}
                  onClick={() => navigate({ to: "/login" })}
                >
                  {t("inviteAccept.toSignIn")}
                </Banner.Action>
              }
            />
          )}
          {accept.error &&
            !code?.match(
              /^(signed_in_as_other|already_member|weak_password|wrong_password|name_required)$/,
            ) && <ErrorBanner error={accept.error} />}
          <Input
            className="w-full"
            label={t("auth.email")}
            description={t("inviteAccept.emailHint")}
            value={invite.email}
            type="email"
            readOnly
          />
          {isNew ? (
            <>
              <Input
                className="w-full"
                label={t("auth.name")}
                description={t("inviteAccept.nameHint")}
                value={name}
                onValueChange={setName}
                autoComplete="name"
                error={shown.name}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <NewPasswordFields
                password={password}
                confirm={confirm}
                onPassword={(v) => {
                  setPassword(v);
                  if (code) accept.reset();
                }}
                onConfirm={setConfirm}
                errors={{ password: shown.password, confirm: shown.confirm }}
                onEnter={submit}
              />
            </>
          ) : (
            <>
              <Banner
                variant="secondary"
                icon={<UserCircle weight="fill" />}
                title={t("inviteAccept.existingTitle")}
                description={t("inviteAccept.existing")}
              />
              <PasswordField
                label={t("auth.password")}
                value={password}
                onValueChange={(v) => {
                  setPassword(v);
                  if (code) accept.reset();
                }}
                error={shown.password}
                autoComplete="current-password"
                onEnter={submit}
              />
            </>
          )}
          <Button
            variant="primary"
            className="w-full"
            loading={accept.isPending}
            disabled={Boolean(otherSession)}
            title={otherSession ? t("inviteAccept.signOutFirst") : undefined}
            onClick={submit}
          >
            {t("inviteAccept.submit")}
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
