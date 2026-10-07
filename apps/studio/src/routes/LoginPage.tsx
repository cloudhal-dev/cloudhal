import { Button, Input, LayerCard, Tabs, Text } from "@cloudhal/ui";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { LanguageSwitch } from "../components/LanguageSwitch.tsx";
import { useT } from "../i18n/index.tsx";
import { authClient } from "../lib/auth.ts";

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? t("auth.failed"));
      return;
    }
    await navigate({ to: "/sites" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-kumo-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Text variant="heading" size="lg" as="h1">
              {t("app.name")}
            </Text>
            <Text variant="secondary">{t("app.tagline")}</Text>
          </div>
          <LanguageSwitch size="xs" />
        </div>
        <LayerCard className="px-5 py-4">
          <form onSubmit={submit} className="grid gap-4" data-testid="login-form">
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
        </LayerCard>
      </div>
    </main>
  );
}
