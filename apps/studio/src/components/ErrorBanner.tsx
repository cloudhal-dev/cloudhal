import { Banner } from "@cloudhal/ui";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { apiErrorText, isWordedCode } from "../lib/api-errors.ts";

/**
 * Page/section error (DESIGN.md §5): plain-language message (`apiErrorText`), optional retry
 * action; `title` names what failed ("Couldn't publish the reply"), `size="sm"` inside a form.
 */
export function ErrorBanner({
  error,
  onRetry,
  retrying,
  title,
  size,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
  title?: string | undefined;
  size?: "sm" | undefined;
}) {
  const t = useT();
  if (!error) return null;
  const message =
    // A 409 is someone else's change, unless its code has words of its own (`list_field_in_use`).
    error instanceof ApiRequestError && error.status === 409 && !isWordedCode(error.body?.error)
      ? t("errors.conflict")
      : apiErrorText(t, error);
  return (
    <div role="alert">
      <Banner
        variant="error"
        {...(size ? { size } : {})}
        icon={<WarningCircle weight="fill" />}
        title={title ?? t("errors.title")}
        description={message}
        action={
          onRetry ? (
            <Banner.Action
              variant="secondary"
              icon={<ArrowClockwise />}
              onClick={onRetry}
              loading={retrying}
            >
              {t("common.retry")}
            </Banner.Action>
          ) : undefined
        }
      />
    </div>
  );
}
