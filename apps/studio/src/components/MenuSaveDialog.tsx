import { Banner, cn, InsetPanel, LayerDialog, Text } from "@cloudhal/ui";
import { Camera, WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import type { DeltaLine, MenuDelta, TargetSummary } from "../lib/menus.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { useHiddenReason } from "./Menus.tsx";

/** The sign's colour: added, removed, moved, edited, stays hidden. */
const SIGN_TONE: Record<DeltaLine["sign"], string> = {
  "+": "text-kumo-success",
  "−": "text-kumo-danger",
  "↕": "text-kumo-info",
  "↳": "text-kumo-info",
  "~": "text-kumo-warning",
  "!": "text-kumo-warning",
};

/** The RFC-0003 §6.3 sentence of one delta line, in Studio's language. */
export function useDeltaText(taxonomyName: (key: string) => string) {
  const t = useT("menus");
  const reason = useHiddenReason();
  const quoted = (label: string, fallback: boolean) =>
    fallback ? t("menus.delta.quotedTitle", { label }) : t("menus.delta.quoted", { label });
  const where = (s: TargetSummary): string => {
    if (s.missing)
      return t(`menus.delta.where.missing.${s.kind as "page" | "contentEntry" | "term"}`);
    switch (s.kind) {
      case "page":
      case "contentEntry":
        return t(`menus.delta.where.${s.kind}`, { where: s.where ?? "" });
      case "term":
        return t("menus.delta.where.term", {
          where: s.where ?? t("menus.delta.noArchive"),
          taxonomy: s.taxonomy ? taxonomyName(s.taxonomy).toLocaleLowerCase() : "",
          name: s.title ?? "",
        });
      case "collection":
        return t("menus.delta.where.collection", { where: s.where ?? "" });
      case "url":
        return s.newTab
          ? t("menus.delta.where.urlNewTab", { host: s.where ?? "" })
          : t("menus.delta.where.url", { host: s.where ?? "" });
      case "group":
        return t("menus.delta.where.group");
    }
  };
  return (line: DeltaLine): string => {
    const label = quoted(line.label, line.fallback);
    switch (line.sign) {
      case "+": {
        const place = line.parent
          ? t("menus.delta.under", { parent: line.parent, position: line.position })
          : t("menus.delta.topLevel", { position: line.position });
        const below = line.below === 0 ? "" : t("menus.delta.withBelow", { count: line.below });
        return t("menus.delta.add", { label, where: where(line.target), place, below });
      }
      case "−":
        return line.below > 0
          ? t("menus.delta.removeTree", { label, count: line.below })
          : t("menus.delta.remove", { label, where: where(line.target) });
      case "↕":
        return t("menus.delta.move", { label, from: line.from, to: line.to });
      case "↳":
        return line.parent
          ? line.was
            ? t("menus.delta.reparent", { label, parent: line.parent, was: line.was })
            : t("menus.delta.reparentFromTop", { label, parent: line.parent })
          : t("menus.delta.toTop", { label, was: line.was ?? "" });
      case "~":
        if (line.change === "label")
          return t("menus.delta.label", {
            label,
            locale: line.locale,
            from: line.from !== undefined ? `“${line.from}”` : t("menus.delta.none"),
            to: line.to !== undefined ? `“${line.to}”` : t("menus.delta.none"),
          });
        if (line.change === "target")
          return t("menus.delta.target", { label, from: where(line.from), to: where(line.to) });
        return line.to
          ? t("menus.delta.newTabOn", { label })
          : t("menus.delta.newTabOff", { label });
      case "!":
        return t("menus.delta.hidden", { label, reason: reason(line.reason, line.kind, "badge") });
    }
  };
}

/**
 * Save confirmation (RFC-0003 §8): the change in the §6.3 delta format — `+` added, `−` removed,
 * `↕` reordered, `↳` moved to another parent, `~` edited, `!` stays hidden — before one `PUT` with
 * the menu's `rev`. One change, one snapshot; live with the next publish.
 */
export function MenuSaveDialog({
  open,
  onOpenChange,
  title,
  delta,
  lines,
  busy,
  error,
  onConfirm,
  taxonomyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Header (primary)". */
  title: string;
  delta: MenuDelta | undefined;
  lines: DeltaLine[];
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  taxonomyName: (key: string) => string;
}) {
  const t = useT("menus");
  const text = useDeltaText(taxonomyName);
  const changes = delta?.changes ?? 0;
  const hidden = lines.filter((l) => l.sign === "!").length;
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("menus.save.title", { name: title })}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("menus.save.summary", {
            count: changes,
            before: delta?.before ?? 0,
            after: delta?.after ?? 0,
          })}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="menu-save-dialog">
            <InsetPanel label={t("menus.save.changes")}>
              <div className="grid divide-y divide-kumo-hairline" data-testid="menu-delta">
                {lines.length === 0 ? (
                  <Text variant="secondary" size="sm">
                    {t("menus.save.onlyDepth")}
                  </Text>
                ) : (
                  lines.map((line, i) => (
                    <div
                      key={`${line.id}${line.sign}${i}`}
                      className="flex min-w-0 items-start gap-3 py-2 first:pt-0 last:pb-0"
                      data-delta-sign={line.sign}
                      data-item-id={line.id}
                    >
                      <span
                        className={cn(
                          "flex h-lh w-4 shrink-0 items-center justify-center font-mono",
                          SIGN_TONE[line.sign],
                        )}
                        aria-hidden
                      >
                        {line.sign}
                      </span>
                      <Text as="span">
                        <span className="break-words">{text(line)}</span>
                      </Text>
                    </div>
                  ))
                )}
              </div>
            </InsetPanel>
            {hidden > 0 && (
              <Banner
                variant="alert"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("menus.save.hidden", { count: hidden })}
                description={t("menus.save.hiddenDescription")}
              />
            )}
            <ErrorBanner error={error} />
            <div className="flex items-start gap-2" data-testid="one-snapshot">
              <span className="flex h-lh items-center text-kumo-subtle">
                <Camera size={16} />
              </span>
              <Text variant="secondary" size="sm" as="span">
                {t("governance.oneSnapshot")}
              </Text>
            </div>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={busy}
            onClick={onConfirm}
            data-testid="menu-save-confirm"
          >
            {t("menus.save.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
