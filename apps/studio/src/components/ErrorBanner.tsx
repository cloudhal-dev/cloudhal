import { Banner } from "@cloudhal/ui";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError } from "../lib/api.ts";

/** Page/section error (DESIGN.md §5): plain-language message, optional retry action. */
export function ErrorBanner({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
}) {
  const t = useT();
  if (!error) return null;
  const message =
    error instanceof ApiRequestError
      ? error.status === 409
        ? t("errors.conflict")
        : error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div role="alert">
      <Banner
        variant="error"
        icon={<WarningCircle weight="fill" />}
        title={t("errors.title")}
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
