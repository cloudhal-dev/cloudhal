import { Columns, SectionCard, TableOfContents, Text, usePageScrollRoot } from "@cloudhal/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface SettingsNavItem {
  id: string;
  label: string;
}

/**
 * Where a section counts as "current", from the top of the scrolling column: below the sticky top
 * bar (h-12) and below where a jump lands a card (`SectionCard` is `scroll-mt-20`).
 */
const ACTIVE_LINE = 96;

/** Input that means the person is scrolling themselves (a jump's smooth scroll sends none). */
const MANUAL_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * Scrollspy for the settings table of contents, on the shell's scrolling column (Kumo's
 * `useTableOfContentsActiveId` watches the window, which never scrolls here). The current section
 * is the last one whose top passed the line; at the end of the page — where short last sections
 * can never reach it — the last section is current. A click pins its section until the person
 * scrolls again, so a jump to a short section near the end doesn't snap back to its neighbour.
 */
function useSectionSpy(ids: string[]) {
  const root = usePageScrollRoot();
  const [activeId, setActiveId] = useState<string>();
  const pinned = useRef(false);
  const idsKey = ids.join("\0");
  useEffect(() => {
    const sectionIds = idsKey.split("\0");
    const target: HTMLElement | Window = root ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (pinned.current) return;
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      const last = sections.at(-1);
      if (!last) return;
      const top = root ? root.getBoundingClientRect().top : 0;
      const scrollTop = root ? root.scrollTop : window.scrollY;
      const visible = root ? root.clientHeight : window.innerHeight;
      const height = root ? root.scrollHeight : document.documentElement.scrollHeight;
      if (scrollTop > 0 && scrollTop + visible >= height - 2) {
        setActiveId(last.id);
        return;
      }
      let current = sections[0]?.id;
      for (const el of sections)
        if (el.getBoundingClientRect().top - top <= ACTIVE_LINE) current = el.id;
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const release = () => {
      pinned.current = false;
    };
    measure();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    for (const type of MANUAL_SCROLL_EVENTS)
      target.addEventListener(type, release, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const type of MANUAL_SCROLL_EVENTS) target.removeEventListener(type, release);
    };
  }, [root, idsKey]);
  const selectSection = useCallback((id: string) => {
    pinned.current = true;
    setActiveId(id);
  }, []);
  return { activeId, selectSection };
}

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
  const { activeId, selectSection } = useSectionSpy(sections.map((s) => s.id));
  const current = activeId ?? sections[0]?.id;
  // A deep link (`…/settings#domains`) lands on its section once the cards have laid out.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !sections.some((s) => s.id === id)) return;
    selectSection(id);
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
