import type { PublishStatus } from "@cloudhal/core-contracts";
import { Button, DropdownMenu, Tooltip } from "@cloudhal/ui";
import {
  Archive,
  ArrowCounterClockwise,
  DotsThree,
  PaperPlaneTilt,
  RocketLaunch,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";
import { TRANSITIONS } from "../lib/workflow.ts";

/**
 * Explicit lifecycle actions instead of a status dropdown (DESIGN.md §2b): the next step as a
 * labelled button (send to review → publish → …) and the other transitions in a labelled "More
 * actions" menu, which also carries the editor's own items (`menu`: duplicate, delete).
 * Publishing never changes the status directly — it calls `onPublish`, which opens the approval.
 */
export function StatusActions({
  status,
  busy,
  onChange,
  onPublish,
  menu,
}: {
  status: PublishStatus;
  busy?: boolean | undefined;
  onChange: (next: PublishStatus) => void;
  onPublish: () => void;
  /** Extra `DropdownMenu.Item`s below the lifecycle group. */
  menu?: ReactNode;
}) {
  const t = useT();
  const allowed = TRANSITIONS[status];
  const next =
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
        variant="secondary"
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
  const others = allowed.filter(
    (s) =>
      s !== "published" &&
      !(status === "draft" && s === "review") &&
      !(status === "archived" && s === "draft"),
  );
  const label = (s: PublishStatus) =>
    s === "draft"
      ? status === "published"
        ? t("editor.unpublish")
        : t("editor.backToDraft")
      : s === "archived"
        ? t("editor.archive")
        : t("editor.sendToReview");
  const icon = (s: PublishStatus) =>
    s === "archived" ? Archive : s === "review" ? PaperPlaneTilt : ArrowCounterClockwise;
  const moreLabel = t("editor.moreActions");
  return (
    <>
      {(others.length > 0 || menu) && (
        <DropdownMenu>
          {/* Tooltip outside, menu trigger inside: Kumo's Tooltip forwards only its own trigger props. */}
          <Tooltip
            content={moreLabel}
            render={
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="secondary"
                    shape="square"
                    icon={<DotsThree weight="bold" />}
                    aria-label={moreLabel}
                    disabled={busy}
                  />
                }
              />
            }
          />
          <DropdownMenu.Content align="end">
            {others.length > 0 && (
              <DropdownMenu.Group>
                <DropdownMenu.Label>{t("editor.status")}</DropdownMenu.Label>
                {others.map((s) => (
                  <DropdownMenu.Item key={s} icon={icon(s)} onClick={() => onChange(s)}>
                    {label(s)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Group>
            )}
            {others.length > 0 && menu && <DropdownMenu.Separator />}
            {menu}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
      {next}
    </>
  );
}
