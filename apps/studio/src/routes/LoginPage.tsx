import { AuthLayout, Banner, Button, Input, Tabs, Text } from "@cloudhal/ui";
import { Key, SquaresFour } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { PasswordField } from "../components/PasswordField.tsx";
import { useT } from "../i18n/index.tsx";
import { authClient } from "../lib/auth.ts";

const SETUP_KEY = "cloudhal.setupToken";

/**
 * A fresh deployment's owner arrives with `/login#setup=<token>` (printed by `cloudhal deploy`):
 * in the fragment, the token never reaches a server, its logs or a referrer. `?setup=` (links
 * printed by earlier versions) works too. The token is moved out of the URL at once (screenshots,
 * history) and kept for this tab only; the server requires it for the first account.
 */
export function takeSetupToken(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("setup");
    const fromQuery = url.searchParams.get("setup");
    const fromUrl = fromHash || fromQuery;
    if (fromUrl) {
      sessionStorage.setItem(SETUP_KEY, fromUrl);
      url.searchParams.delete("setup");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${fromHash ? "" : url.hash}`,
      );
      return fromUrl;
    }
    return sessionStorage.getItem(SETUP_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [setupToken] = useState(takeSetupToken);
  const [mode, setMode] = useState<"signin" | "signup">(setupToken ? "signup" : "signin");
  useEffect(() => {
    if (setupToken) setMode("signup");
  }, [setupToken]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const result =
      mode === "signup"
        ? await authClient.signUp.email(
            { name, email, password },
            setupToken ? { headers: { "x-cloudhal-setup-token": setupToken } } : undefined,
          )
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? t("auth.failed"));
      return;
    }
    try {
      sessionStorage.removeItem(SETUP_KEY);
    } catch {
      // storage unavailable
    }
    await navigate({ to: "/sites" });
  }

  return (
    <AuthLayout
      brand={<SquaresFour size={20} weight="duotone" />}
      product={t("app.name")}
      title={mode === "signup" ? t("auth.signUpTitle") : t("auth.signInTitle")}
      description={mode === "signup" ? t("auth.signUpDescription") : t("app.tagline")}
      footer={
        <>
          <Text variant="secondary" size="sm" as="span">
            {t("auth.footer")}
          </Text>
          <LanguageSwitch size="sm" />
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" data-testid="login-form">
        {setupToken && mode === "signup" && (
          <Banner
            variant="default"
            icon={<Key weight="fill" />}
            title={t("auth.setupTitle")}
            description={t("auth.setupDescription")}
          />
        )}
        <Tabs
          tabs={[
            { value: "signin", label: t("auth.signIn") },
            { value: "signup", label: t("auth.createAccount") },
          ]}
          value={mode}
          onValueChange={(v) => {
            setMode(v as "signin" | "signup");
            setError(undefined);
          }}
          variant="segmented"
          className="w-full"
        />
        {mode === "signup" && (
          <Input
            label={t("auth.name")}
            name="name"
            value={name}
            onValueChange={setName}
            required
            autoComplete="name"
            className="w-full"
          />
        )}
        <Input
          label={t("auth.email")}
          name="email"
          type="email"
          value={email}
          onValueChange={setEmail}
          required
          autoComplete="email"
          className="w-full"
        />
        <PasswordField
          label={t("auth.password")}
          value={password}
          onValueChange={setPassword}
          description={mode === "signup" ? t("auth.passwordHint") : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        <ErrorBanner error={error} />
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {mode === "signup" ? t("auth.createAccount") : t("auth.signIn")}
        </Button>
      </form>
    </AuthLayout>
  );
}
