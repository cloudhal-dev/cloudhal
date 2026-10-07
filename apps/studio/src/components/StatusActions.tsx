import type { PublishStatus } from "@cloudhal/core-contracts";
import { Button, DropdownMenu } from "@cloudhal/ui";
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  PaperPlaneTilt,
  RocketLaunch,
} from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { TRANSITIONS } from "../lib/workflow.ts";

/**
 * Explicit lifecycle actions instead of a status dropdown: one primary next step
 * (review → publish) and the rest behind "More". Publishing goes through `onPublish` (approval).
 */
export function StatusActions({
  status,
  busy,
  onChange,
  onPublish,
}: {
  status: PublishStatus;
  busy?: boolean | undefined;
  onChange: (next: PublishStatus) => void;
  onPublish: () => void;
}) {
  const t = useT();
  const allowed = TRANSITIONS[status];
  const primary =
    status === "draft" ? (
      <Button
        variant="secondary"
        icon={<PaperPlaneTilt />}
        onClick={() => onChange("review")}
        disabled={busy}
      >
        {t("editor.sendToReview")}
      </Button>
    ) : status === "review" ? (
      <Button
        variant="primary"
        icon={<RocketLaunch />}
        onClick={onPublish}
        disabled={busy}
        data-testid="publish"
      >
        {t("common.publish")}
      </Button>
    ) : status === "archived" ? (
      <Button
        variant="secondary"
        icon={<ArrowCounterClockwise />}
        onClick={() => onChange("draft")}
        disabled={busy}
      >
        {t("editor.restore")}
      </Button>
    ) : null;
  const secondary = allowed.filter(
    (s) =>
      !(status === "draft" && s === "review") &&
      !(status === "review" && s === "published") &&
      !(status === "archived" && s === "draft"),
  );
  const label = (s: PublishStatus) =>
    s === "draft"
      ? t("editor.backToDraft")
      : s === "archived"
        ? t("editor.archive")
        : t(`status.${s}`);
  const icon = (s: PublishStatus) => (s === "archived" ? Archive : ArrowCounterClockwise);
  return (
    <div className="flex items-center gap-2">
      {primary}
      {secondary.length > 0 && (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                shape="square"
                aria-label={t("common.more")}
                disabled={busy}
              />
            }
          >
            <CaretDown />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {secondary.map((s) => (
              <DropdownMenu.Item
                key={s}
                icon={icon(s)}
                onClick={() => onChange(s)}
                variant={s === "archived" ? "danger" : "default"}
              >
                {label(s)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
    </div>
  );
}
