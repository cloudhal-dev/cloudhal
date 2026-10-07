import { Banner } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError } from "../lib/api.ts";

export function ErrorBanner({ error }: { error: unknown }) {
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
      />
    </div>
  );
}
