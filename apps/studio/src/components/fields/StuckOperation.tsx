import { Banner, Checkbox } from "@cloudhal/ui";
import { Warning } from "@phosphor-icons/react";
import type { TFunction } from "../../i18n/index.tsx";
import type { Stuck } from "./useFieldOperation.ts";

/**
 * A run or revert that can't finish (RFC-0045 §7): entries whose values stopped converting while it
 * ran — a target archived or deleted, a second entry with the same title. Finishing drops those
 * values (`onInvalid: "clear"`), which the snapshot taken before keeps; the person ticks the
 * destructive confirmation first, and the dialog's primary button becomes "Clear and finish".
 */
export function StuckOperation({
  t,
  stuck,
  confirmed,
  onConfirm,
}: {
  t: TFunction<"fields">;
  stuck: Stuck;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
}) {
  const count = stuck.entries.length;
  return (
    <div className="grid gap-3" data-testid="field-operation-stuck">
      {/* Announced as it appears: the run stopped and waits for the person. */}
      <div role="alert">
        <Banner
          variant="alert"
          icon={<Warning weight="fill" />}
          title={t("fields.operation.stuckTitle", { count })}
          description={t(
            stuck.reverting ? "fields.operation.stuckRevert" : "fields.operation.stuckRun",
          )}
        />
      </div>
      <Checkbox
        label={t("fields.operation.stuckConfirm", { count })}
        checked={confirmed}
        onCheckedChange={(v: boolean) => onConfirm(v)}
        data-testid="field-operation-stuck-confirm"
      />
    </div>
  );
}
