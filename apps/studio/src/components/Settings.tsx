import { Grid, LayerCard, TableOfContents, Text, useTableOfContentsActiveId } from "@cloudhal/ui";
import { type ReactNode, useEffect } from "react";

export interface SettingsNavItem {
  id: string;
  label: string;
}

/** Sticky top bar (h-12) plus breathing room, so a section never hides under it. */
const HEADER_OFFSET = 72;

/**
 * Settings template (DESIGN.md §2c): `Grid 1-2` with a sticky `TableOfContents` on the left (from
 * `md`; phones scroll one column) and one `LayerCard` per section on the right.
 */
export function SettingsLayout({
  title,
  sections,
  children,
}: {
  /** Heading of the table of contents ("On this page"). */
  title: string;
  sections: SettingsNavItem[];
  children: ReactNode;
}) {
  const { activeId, selectSection } = useTableOfContentsActiveId({
    ids: sections.map((s) => s.id),
    offset: HEADER_OFFSET,
  });
  const current = activeId ?? sections[0]?.id;
  // A deep link (`…/settings#domains`) lands on its section once the cards have laid out.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !sections.some((s) => s.id === id)) return;
    const timer = window.setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ block: "start" }),
      150,
    );
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <Grid variant="1-2" gap="base">
      <div className="hidden md:block">
        <div className="sticky top-20">
          <TableOfContents>
            <TableOfContents.Title>{title}</TableOfContents.Title>
            <TableOfContents.List>
              {sections.map((s) => (
                <TableOfContents.Item
                  key={s.id}
                  href={`#${s.id}`}
                  active={current === s.id}
                  onClick={(e: React.MouseEvent) => {
                    // Scroll the content column ourselves; a hash change would go through the router.
                    e.preventDefault();
                    selectSection(s.id);
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {s.label}
                </TableOfContents.Item>
              ))}
            </TableOfContents.List>
          </TableOfContents>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-6">{children}</div>
    </Grid>
  );
}

/**
 * One settings section: `LayerCard.Secondary` header (title, optional badge/actions on the right),
 * `Primary` body with a muted description, and an optional footer row for the section's actions.
 * `flush` drops the body padding for a `Table` (the description then sits above it).
 */
export function SettingsSection({
  id,
  title,
  description,
  aside,
  footer,
  flush = false,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <LayerCard id={id} className="scroll-mt-20" aria-labelledby={`${id}-title`}>
      <LayerCard.Secondary className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3">
        <span id={`${id}-title`}>
          <Text variant="heading" as="h2">
            {title}
          </Text>
        </span>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </LayerCard.Secondary>
      <LayerCard.Primary className="min-w-0 p-0">
        {description && (
          <div className={flush ? "px-5 pt-4 pb-3" : "px-5 pt-4"}>
            <Text variant="secondary">{description}</Text>
          </div>
        )}
        {flush ? (
          <div className="min-w-0 overflow-x-auto border-kumo-hairline border-t">{children}</div>
        ) : (
          <div className={description ? "grid gap-5 px-5 pt-4 pb-5" : "grid gap-5 px-5 py-4"}>
            {children}
          </div>
        )}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-kumo-hairline border-t px-5 py-3">
            {footer}
          </div>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}

/** A label/value row in a settings card (`dl` glue, DESIGN.md §2h detail style). */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5 py-3">
      <dt className="grid min-w-0 flex-[1_1_14rem] gap-0.5">
        <Text bold as="span">
          {label}
        </Text>
        {hint && (
          <Text variant="secondary" size="sm" as="span">
            {hint}
          </Text>
        )}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}
