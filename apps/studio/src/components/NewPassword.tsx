import { Meter, Text } from "@cloudhal/ui";
import { useT } from "../i18n/index.tsx";
import { PASSWORD_MAX, PASSWORD_MIN } from "../lib/account.ts";
import { passwordStrength, type Strength } from "../lib/roles.ts";
import { PasswordField } from "./PasswordField.tsx";

const LEVEL: Record<Strength, number> = { empty: 0, tooShort: 15, weak: 35, fair: 65, strong: 100 };
/** Kumo's indicator is a gradient (`from/via/to-kumo-brand`): the tone replaces its stops. */
const TONE: Record<Strength, string> = {
  empty: "",
  tooShort: "from-kumo-danger via-kumo-danger to-kumo-danger",
  weak: "from-kumo-warning via-kumo-warning to-kumo-warning",
  fair: "from-kumo-info via-kumo-info to-kumo-info",
  strong: "from-kumo-success via-kumo-success to-kumo-success",
};

/** "Strength: fair" with a Kumo `Meter` and one line of advice; guidance only (the server checks length). */
export function PasswordStrength({ password }: { password: string }) {
  const t = useT();
  const strength = passwordStrength(password, PASSWORD_MIN);
  return (
    <div className="grid gap-1.5" data-strength={strength} aria-live="polite">
      {/* Nothing to rate yet: only the advice. */}
      {strength !== "empty" && (
        <Meter
          label={t("passwords.strength", { level: t(`passwords.levels.${strength}`) })}
          value={LEVEL[strength]}
          showValue={false}
          indicatorClassName={TONE[strength]}
        />
      )}
      <Text variant="secondary" size="sm">
        {t(`passwords.advice.${strength}`, { min: PASSWORD_MIN })}
      </Text>
    </div>
  );
}

export type NewPasswordErrors = { password?: string | undefined; confirm?: string | undefined };

/** Checks a new password pair the way the server will (length), plus that both fields match. */
export function newPasswordErrors(
  t: ReturnType<typeof useT>,
  password: string,
  confirm: string,
): NewPasswordErrors {
  return {
    password: !password
      ? t("passwords.errors.required")
      : password.length < PASSWORD_MIN
        ? t("passwords.errors.tooShort", { min: PASSWORD_MIN })
        : password.length > PASSWORD_MAX
          ? t("passwords.errors.tooLong", { max: PASSWORD_MAX })
          : undefined,
    confirm: !confirm
      ? t("passwords.errors.confirmRequired")
      : confirm !== password
        ? t("passwords.errors.mismatch")
        : undefined,
  };
}

/**
 * A new password with its confirmation and strength guidance (invite and reset pages). Errors show
 * once the person tried to submit; `serverError` (e.g. `weak_password`) lands on the first field.
 */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  errors,
  onEnter,
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  errors: NewPasswordErrors;
  onEnter: () => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <PasswordField
          label={t("passwords.new")}
          value={password}
          onValueChange={onPassword}
          error={errors.password}
          autoComplete="new-password"
          onEnter={onEnter}
        />
        <PasswordStrength password={password} />
      </div>
      <PasswordField
        label={t("passwords.confirm")}
        value={confirm}
        onValueChange={onConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        onEnter={onEnter}
      />
    </div>
  );
}
