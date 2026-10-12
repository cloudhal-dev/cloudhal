import { AuthLayout, Banner, Button, Input, InsetPanel, LinkButton, Text } from "@cloudhal/ui";
import { CheckCircle, ClockCountdown, SignIn, SquaresFour } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { NewPasswordFields, newPasswordErrors } from "../components/NewPassword.tsx";
import { useI18n } from "../i18n/index.tsx";
import { absoluteTime } from "../lib/activity.ts";
import { ApiRequestError, api, errorCode } from "../lib/api.ts";
import { expiresIn, forgetHashToken, RESET_TOKEN_PREFIX, takeHashToken } from "../lib/roles.ts";
import { DeadLink, LinkSkeleton } from "./InvitePage.tsx";

const isGone = (error: unknown) => error instanceof ApiRequestError && error.status === 410;

/**
 * `/reset-password#chrst_…` (DESIGN.md §2r, RFC-0005 open question 6): an Administrator-issued,
 * one-hour, single-use link. Same pattern as `/invite`: the token is taken from the fragment and
 * stripped at once, sent only in POST bodies; inspect shows whose account it is; a new password
 * (with confirmation and strength guidance) signs the person out everywhere, then they sign in.
 */
export function ResetPasswordPage() {
  const { t, locale } = useI18n();
  const [token] = useState(() => takeHashToken(RESET_TOKEN_PREFIX));
  const inspect = useQuery({
    queryKey: ["reset-inspect", token],
    queryFn: () => api.passwordReset.inspect(token as string),
    enabled: token !== undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(false);
  const complete = useMutation({
    mutationFn: () => api.passwordReset.complete(token as string, password),
    onSuccess: () => forgetHashToken(RESET_TOKEN_PREFIX),
  });
  const local = newPasswordErrors(t, password, confirm);
  const errors = {
    password:
      errorCode(complete.error) === "weak_password"
        ? t("inviteAccept.errors.weakPassword")
        : attempted
          ? local.password
          : undefined,
    confirm: attempted ? local.confirm : undefined,
  };
  const submit = () => {
    setAttempted(true);
    if (complete.isPending || local.password || local.confirm) return;
    complete.mutate();
  };
  const details = inspect.data;
  const gone = isGone(inspect.error) || isGone(complete.error);
  const done = complete.isSuccess;

  return (
    <AuthLayout
      brand={<SquaresFour size={20} weight="duotone" />}
      product={t("app.name")}
      title={done ? t("resetPassword.doneTitle") : t("resetPassword.title")}
      description={
        done
          ? t("resetPassword.doneDescription")
          : details
            ? t("resetPassword.description", { name: details.name })
            : gone || token === undefined
              ? t("resetPassword.descriptionDead")
              : t("resetPassword.descriptionGeneric")
      }
      footer={
        <>
          <Text variant="secondary" size="sm" as="span">
            {t("auth.footer")}
          </Text>
          <LanguageSwitch size="sm" />
        </>
      }
    >
      {token === undefined ? (
        <DeadLink
          title={t("resetPassword.missingTitle")}
          description={t("resetPassword.missing")}
        />
      ) : done ? (
        <div className="grid gap-4" data-testid="reset-done">
          <Banner
            variant="default"
            icon={<CheckCircle weight="fill" />}
            title={t("resetPassword.changed")}
            description={t("resetPassword.changedDescription")}
          />
          <LinkButton
            href="/login"
            variant="primary"
            icon={SignIn}
            className="w-full justify-center"
          >
            {t("auth.signIn")}
          </LinkButton>
        </div>
      ) : gone ? (
        <DeadLink title={t("resetPassword.goneTitle")} description={t("resetPassword.gone")} />
      ) : inspect.isPending ? (
        <LinkSkeleton />
      ) : inspect.error || !details ? (
        <ErrorBanner error={inspect.error} onRetry={() => inspect.refetch()} />
      ) : (
        <div className="grid gap-4" data-testid="reset-form">
          <InsetPanel>
            <div className="flex items-start gap-2">
              <span className="flex h-lh items-center text-kumo-subtle">
                <ClockCountdown size={16} />
              </span>
              <Text variant="secondary" size="sm">
                {t("resetPassword.expires", {
                  relative: expiresIn(details.expiresAt, locale),
                  absolute: absoluteTime(details.expiresAt, locale),
                })}
              </Text>
            </div>
          </InsetPanel>
          {complete.error && errorCode(complete.error) !== "weak_password" && (
            <ErrorBanner error={complete.error} />
          )}
          <Input
            className="w-full"
            label={t("auth.email")}
            value={details.email}
            type="email"
            readOnly
          />
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
            errors={errors}
            onEnter={submit}
          />
          <Text variant="secondary" size="sm">
            {t("resetPassword.signsOut")}
          </Text>
          <Button
            variant="primary"
            className="w-full"
            loading={complete.isPending}
            onClick={submit}
          >
            {t("resetPassword.submit")}
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
