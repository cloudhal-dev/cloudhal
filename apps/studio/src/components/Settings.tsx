import {
  Columns,
  SectionCard,
  TableOfContents,
  Text,
  useTableOfContentsActiveId,
} from "@cloudhal/ui";
import { type ReactNode, useEffect } from "react";

export interface SettingsNavItem {
  id: string;
  label: string;
}

/** Sticky top bar (h-12) plus breathing room, so a section never hides under it. */
const HEADER_OFFSET = 72;

/**
 * Settings template (DESIGN.md §2c): `Columns variant="1-2"` — a fixed 13rem sticky
 * `TableOfContents` and the section cards (capped at a readable width). The columns follow the
 * page's content width (`@4xl/page`); below it the TOC is hidden and the cards stack.
 */
export function SettingsLayout({
  title,
  sections,
  children,
}: {
  /** Accessible name and sentence-case label of the table of contents ("On this page"). */
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
    <Columns variant="1-2" className="@4xl/page:gap-x-8">
      <div className="hidden @4xl/page:sticky @4xl/page:top-20 @4xl/page:grid @4xl/page:gap-3">
        {/* Not TableOfContents.Title: Kumo styles it all-caps; labels stay sentence case. */}
        <span aria-hidden className="pl-4">
          <Text variant="secondary" size="sm" as="span">
            {title}
          </Text>
        </span>
        <TableOfContents aria-label={title}>
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
      <div className="grid min-w-0 content-start gap-6">{children}</div>
    </Columns>
  );
}

/**
 * One settings section — the shared `SectionCard` anatomy: `Secondary` header (title, optional
 * badge/actions on the right via `aside`), `Primary` body with a muted description, and an optional
 * footer row for the section's own Save/Discard. `flush` drops the body padding for a `Table`.
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
    <SectionCard
      id={id}
      title={title}
      description={description}
      actions={aside}
      footer={footer}
      flush={flush}
    >
      {children}
    </SectionCard>
  );
}

/**
 * A label/value row in a settings card (`dl` glue): label and hint on the left, the value on the
 * right, wrapping under the label on narrow cards. Rows sit in a `dl` with
 * `divide-y divide-kumo-hairline`.
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
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
      <dd className="flex min-h-5 min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}
