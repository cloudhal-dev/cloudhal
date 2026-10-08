import { Banner, Button, Input, Surface, Tabs, Text } from "@cloudhal/ui";
import { Key, SquaresFour } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { useT } from "../i18n/index.tsx";
import { authClient } from "../lib/auth.ts";

const SETUP_KEY = "cloudhal.setupToken";

/**
 * A fresh deployment's owner arrives with `/login?setup=<token>` (printed by `cloudhal deploy`).
 * The token is moved out of the URL at once (screenshots, history, referrers) and kept for this
 * tab only; the server requires it for the first account.
 */
export function takeSetupToken(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("setup");
    if (fromUrl) {
      sessionStorage.setItem(SETUP_KEY, fromUrl);
      url.searchParams.delete("setup");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
    <main className="flex min-h-screen items-center justify-center bg-kumo-overlay px-4">
      <div className="grid w-full max-w-sm gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <SquaresFour size={24} className="text-kumo-brand" />
            <div className="grid gap-0.5">
              <Text variant="heading" size="lg" as="h1">
                {t("app.name")}
              </Text>
              <Text variant="secondary" size="sm">
                {t("app.tagline")}
              </Text>
            </div>
          </div>
          <LanguageSwitch size="xs" />
        </div>
        <Surface className="rounded-xl bg-kumo-base px-6 py-5 ring ring-kumo-line">
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
              onValueChange={(v) => setMode(v as "signin" | "signup")}
              variant="segmented"
              size="sm"
            />
            {mode === "signup" && (
              <Input
                label={t("auth.name")}
                name="name"
                value={name}
                onValueChange={setName}
                required
                autoComplete="name"
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
            />
            <Input
              label={t("auth.password")}
              name="password"
              type="password"
              value={password}
              onValueChange={setPassword}
              required
              description={t("auth.passwordHint")}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <ErrorBanner error={error} />
            <Button type="submit" variant="primary" loading={busy} className="w-full">
              {mode === "signup" ? t("auth.createAccount") : t("auth.signIn")}
            </Button>
          </form>
        </Surface>
      </div>
    </main>
  );
}
