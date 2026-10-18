import { Badge, Button, cn, DropdownMenu, Link, Popover, Tooltip } from "@cloudflare/kumo";
import { PencilSimple, Plus } from "@phosphor-icons/react";

/** A language version's state in a list row, or that the language has no version yet. */
export type LanguageChipState = "published" | "draft" | "outdated" | "review" | "missing";

export interface LanguageChipItem {
  /** The BCP 47 tag, shown on the chip. */
  locale: string;
  state: LanguageChipState;
  /** The version's editor; absent when it is missing. */
  href?: string;
}

export interface LanguageChipsLabels {
  /** The chip row's accessible name ("Languages"). */
  group: string;
  /** "English: published" — the chip's accessible name and tooltip. */
  describe: (item: LanguageChipItem) => string;
  /** The collapsed cell ("2/6"), shown with more than `collapseAfter` languages. */
  summary: string;
  /** The collapsed cell's accessible name ("2 of 6 languages"). */
  summaryLabel: string;
  /** The missing chip's menu item that starts a new draft. */
  writeByHand: string;
}

export interface LanguageChipsProps {
  items: readonly LanguageChipItem[];
  labels: LanguageChipsLabels;
  /** A person may start a missing language; without it, missing chips are inert. */
  onWriteByHand?: ((locale: string) => void) | undefined;
  /** The language whose draft is being created. */
  busyLocale?: string | undefined;
  /** More languages than this collapse into a summary with a popover. */
  collapseAfter?: number;
}

const VARIANT: Record<
  Exclude<LanguageChipState, "missing">,
  "success" | "secondary" | "warning" | "info"
> = {
  published: "success",
  draft: "secondary",
  outdated: "warning",
  review: "info",
};

function Chip({
  item,
  labels,
  onWriteByHand,
  busy,
}: {
  item: LanguageChipItem;
  labels: LanguageChipsLabels;
  onWriteByHand?: ((locale: string) => void) | undefined;
  busy: boolean;
}) {
  const name = labels.describe(item);
  if (item.state !== "missing" && item.href)
    return (
      <Tooltip content={name}>
        <span className="inline-flex" data-locale={item.locale} data-state={item.state}>
          <Link href={item.href} variant="plain" aria-label={name}>
            <Badge variant={VARIANT[item.state]}>{item.locale}</Badge>
          </Link>
        </span>
      </Tooltip>
    );
  const trigger = (
    <Button
      variant="outline"
      size="xs"
      icon={<Plus />}
      aria-label={name}
      loading={busy}
      disabled={!onWriteByHand}
    >
      {item.locale}
    </Button>
  );
  return (
    <span className="inline-flex" data-locale={item.locale} data-state="missing">
      {onWriteByHand ? (
        <DropdownMenu>
          <Tooltip content={name} render={<DropdownMenu.Trigger render={trigger} />} />
          <DropdownMenu.Content align="start">
            <DropdownMenu.Item icon={PencilSimple} onClick={() => onWriteByHand(item.locale)}>
              {labels.writeByHand}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      ) : (
        <Tooltip content={name} render={<span className="inline-flex" />}>
          {trigger}
        </Tooltip>
      )}
    </span>
  );
}

/**
 * A list row's languages (docs/reports/2026-10-multilingual-studio-ux.md §4a): one chip per site
 * language in the site's order — published, draft, outdated or needs review, each opening that
 * version — and a missing language that a person can start by hand. Past `collapseAfter`
 * languages the cell shows "2/6" with every chip in a popover.
 */
export function LanguageChips({
  items,
  labels,
  onWriteByHand,
  busyLocale,
  collapseAfter = 4,
}: LanguageChipsProps) {
  const collapsed = items.length > collapseAfter;
  // Inline, at most `collapseAfter` chips stay on one line; the popover wraps.
  const wrap = collapsed;
  const chips = (
    // biome-ignore lint/a11y/useSemanticElements: a chip row, not a form control group
    <div
      role="group"
      aria-label={labels.group}
      className={cn("flex items-center gap-1", wrap ? "flex-wrap" : "flex-nowrap")}
    >
      {items.map((item) => (
        <Chip
          key={item.locale}
          item={item}
          labels={labels}
          onWriteByHand={onWriteByHand}
          busy={busyLocale === item.locale}
        />
      ))}
    </div>
  );
  if (!collapsed) return chips;
  return (
    <Popover>
      <Popover.Trigger
        render={<Button variant="outline" size="xs" aria-label={labels.summaryLabel} />}
      >
        {labels.summary}
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Title>{labels.group}</Popover.Title>
        <div className="max-w-64 pt-2">{chips}</div>
      </Popover.Content>
    </Popover>
  );
}
