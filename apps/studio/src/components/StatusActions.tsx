import type { PublishStatus } from "@cloudhal/core-contracts";
import { Button, DirectionalIcon, DropdownMenu, directional, Tooltip } from "@cloudhal/ui";
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
 *
 * Roles (DESIGN.md §2s, RFC-0005 §2.2): `allowed` limits the statuses the person may set (a
 * Contributor: draft and review, so "Submit for review" and no Publish — the Publish step stays,
 * disabled, with `publishReason`); `readOnlyReason` disables the whole lifecycle (someone else's
 * article) with the reason as the tooltip.
 *
 * `directPublish` (pages, RFC-0035): a draft's next step is Publish itself, not review; "Send to
 * review" moves into the menu.
 */
export function StatusActions({
  status,
  busy,
  onChange,
  onPublish,
  menu,
  allowed,
  publishReason,
  readOnlyReason,
  directPublish,
}: {
  status: PublishStatus;
  busy?: boolean | undefined;
  onChange: (next: PublishStatus) => void;
  onPublish: () => void;
  /** Extra `DropdownMenu.Item`s below the lifecycle group. */
  menu?: ReactNode;
  /** Statuses this person may set; all when omitted. */
  allowed?: readonly PublishStatus[] | undefined;
  /** Publishing is not this person's to do: the reason, shown on the disabled button. */
  publishReason?: string | undefined;
  /** Nothing here is this person's to change: the reason. */
  readOnlyReason?: string | undefined;
  /** A draft publishes without the review step (pages). */
  directPublish?: boolean | undefined;
}) {
  const t = useT();
  const may = (s: PublishStatus) => !allowed || allowed.includes(s);
  const draftOnly = !may("published");
  const transitions = TRANSITIONS[status].filter(may);
  const locked = readOnlyReason !== undefined;
  const publishNext = status === "review" || (status === "draft" && directPublish && !draftOnly);
  const next = publishNext ? (
    <Button
      variant="secondary"
      icon={<RocketLaunch />}
      onClick={onPublish}
      disabled={busy || locked || draftOnly}
      title={readOnlyReason ?? (draftOnly ? publishReason : undefined)}
      data-testid="publish"
    >
      {t("common.publish")}
    </Button>
  ) : status === "draft" && may("review") ? (
    <Button
      variant="secondary"
      icon={<DirectionalIcon icon={PaperPlaneTilt} />}
      onClick={() => onChange("review")}
      disabled={busy || locked}
      title={readOnlyReason}
      data-testid="send-to-review"
    >
      {draftOnly ? t("editor.submitForReview") : t("editor.sendToReview")}
    </Button>
  ) : status === "archived" && may("draft") ? (
    <Button
      variant="secondary"
      icon={<ArrowCounterClockwise />}
      onClick={() => onChange("draft")}
      disabled={busy || locked}
      title={readOnlyReason}
    >
      {t("editor.restore")}
    </Button>
  ) : null;
  const others = transitions.filter(
    (s) =>
      s !== "published" &&
      !(status === "draft" && s === "review" && !publishNext) &&
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
    s === "archived"
      ? Archive
      : s === "review"
        ? directional(PaperPlaneTilt)
        : ArrowCounterClockwise;
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
                  <DropdownMenu.Item
                    key={s}
                    icon={icon(s)}
                    onClick={() => onChange(s)}
                    disabled={locked}
                  >
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
