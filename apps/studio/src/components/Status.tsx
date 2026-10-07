import type { PublishStatus } from "@cloudhal/core-contracts";
import { StatusBadge } from "@cloudhal/ui";
import { useT } from "../i18n/index.tsx";

/** Localised StatusBadge. */
export function Status({ status }: { status: PublishStatus }) {
  const t = useT();
  return <StatusBadge status={status} label={t(`status.${status}`)} />;
}
