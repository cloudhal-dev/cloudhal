import { AuthLayout, Banner, Button, Input, LinkButton, Text } from "@cloudhal/ui";
import { EnvelopeSimple, Info, SquaresFour } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { useT } from "../i18n/index.tsx";
import { api, errorCode } from "../lib/api.ts";
import { validEmail } from "../lib/roles.ts";

/**
 * `/forgot-password` (DESIGN.md §2r, RFC-0011): one email field. The server answers the same for
 * every address, so the screen does too ("If … belongs to an account here"); a server that cannot
 * send email says to ask an Administrator, who can issue a link from Team.
 */
export function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [attempted, setAttempted] = useState(false);
  const send = useMutation({
    mutationFn: () => api.passwordReset.request(email.trim().toLowerCase()),
  });
  const unavailable = errorCode(send.error) === "email_unavailable";
  const emailError =
    attempted && !validEmail(email)
      ? email.trim()
        ? t("invites.errors.emailInvalid")
        : t("invites.errors.emailRequired")
      : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (send.isPending || !validEmail(email)) return;
    send.mutate();
  };

  return (
    <AuthLayout
      brand={<SquaresFour size={20} weight="fill" />}
      product={t("app.name")}
      title={send.isSuccess ? t("forgotPassword.sentTitle") : t("forgotPassword.title")}
      description={send.isSuccess ? undefined : t("forgotPassword.description")}
      footer={
        <>
          <Text variant="secondary" size="sm" as="span">
            {t("auth.footer")}
          </Text>
          <LanguageSwitch size="sm" />
        </>
      }
    >
      {send.isSuccess ? (
        <div className="grid gap-4" data-testid="forgot-sent">
          <Banner
            variant="default"
            icon={<EnvelopeSimple weight="fill" />}
            title={t("forgotPassword.sentTitle")}
            description={t("forgotPassword.sent", { email: email.trim() })}
          />
          <LinkButton href="/login" variant="secondary" className="w-full justify-center">
            {t("forgotPassword.back")}
          </LinkButton>
        </div>
      ) : unavailable ? (
        <div className="grid gap-4" data-testid="forgot-unavailable">
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            title={t("forgotPassword.unavailableTitle")}
            description={t("forgotPassword.unavailable")}
          />
          <LinkButton href="/login" variant="secondary" className="w-full justify-center">
            {t("forgotPassword.back")}
          </LinkButton>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" data-testid="forgot-form" noValidate>
          <Input
            label={t("auth.email")}
            name="email"
            type="email"
            value={email}
            onValueChange={setEmail}
            autoComplete="email"
            error={emailError}
            className="w-full"
          />
          {send.error && <ErrorBanner error={send.error} />}
          <Button type="submit" variant="primary" loading={send.isPending} className="w-full">
            {t("forgotPassword.submit")}
          </Button>
          <LinkButton href="/login" variant="ghost" className="w-full justify-center">
            {t("forgotPassword.back")}
          </LinkButton>
        </form>
      )}
    </AuthLayout>
  );
}
