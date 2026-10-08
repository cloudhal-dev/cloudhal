import { InputGroup } from "@cloudhal/ui";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { type KeyboardEvent, useState } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Password input with a show/hide toggle — Kumo's `InputGroup` password pattern (Input +
 * `InputGroup.Button` in an end `Addon`). `error` is shown once set; `onEnter` submits the form
 * the field belongs to (screens avoid `<form>` around Kumo checkboxes, DESIGN.md §7).
 */
export function PasswordField({
  label,
  description,
  value,
  onValueChange,
  error,
  autoComplete,
  onEnter,
  disabled,
}: {
  label: string;
  description?: string | undefined;
  value: string;
  onValueChange: (value: string) => void;
  error?: string | undefined;
  autoComplete: "current-password" | "new-password";
  onEnter?: (() => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const toggle = visible ? t("account.password.hide") : t("account.password.show");
  return (
    <InputGroup
      label={label}
      description={description}
      error={error ? { message: error, match: true } : undefined}
      disabled={disabled}
    >
      <InputGroup.Input
        type={visible ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onValueChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <InputGroup.Addon align="end">
        <InputGroup.Button
          shape="square"
          variant="ghost"
          className="text-kumo-subtle"
          icon={visible ? EyeSlash : Eye}
          aria-label={toggle}
          aria-pressed={visible}
          tooltip={toggle}
          onClick={() => setVisible((v) => !v)}
        />
      </InputGroup.Addon>
    </InputGroup>
  );
}
