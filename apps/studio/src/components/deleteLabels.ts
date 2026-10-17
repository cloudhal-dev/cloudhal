import type { DeleteResourceLabels } from "@cloudhal/ui";
import { currentLocale, type TFunction } from "../i18n/index.tsx";
import { apiErrorText } from "../lib/api-errors.ts";

/**
 * The `DeleteResource` dialog's words for one kind of resource (DESIGN.md §2d): `type` is the
 * catalog's name for it ("Page"), `action` replaces the destructive button's words ("Revoke key"),
 * `error` is the failed delete, worded by `apiErrorText`. The block fills in `{name}`. Spread it:
 * `<DeleteResource {...deleteResourceProps(t, t("editor.page"), { error: remove.error })} />`.
 */
export function deleteResourceProps(
  t: TFunction,
  type: string,
  options: { action?: string; error?: unknown } = {},
): { labels: DeleteResourceLabels; errorMessage?: string } {
  const lower = type.toLocaleLowerCase(currentLocale());
  const labels: DeleteResourceLabels = {
    title: t("common.deleteResource.title"),
    warning: t("common.deleteResource.warning", { type: lower }),
    typeToConfirm: t("common.deleteResource.typeToConfirm"),
    copy: t("common.deleteResource.copy"),
    confirmInput: t("common.deleteResource.confirmInput"),
    close: t("common.close"),
    cancel: t("common.cancel"),
    delete: options.action ?? t("common.deleteResource.delete", { type: lower }),
  };
  return options.error ? { labels, errorMessage: apiErrorText(t, options.error) } : { labels };
}
