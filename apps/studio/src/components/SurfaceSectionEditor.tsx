/**
 * A generated section (RFC-0020 surface) in the page editor, for people rather than agents: an
 * outline of its components with readable names and what each shows, its texts editable in
 * place, "Change with AI" opening Build chat aimed at it, and the data behind "Show JSON". The
 * page preview beside the form shows how it looks.
 */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import {
  Banner,
  Collapsible,
  InputArea,
  LinkButton,
  SurfaceOutline,
  type SurfaceOutlineField,
  type SurfaceOutlineNode,
} from "@cloudhal/ui";
import { Sparkle } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useI18n } from "../i18n/index.tsx";

const catalog = createCatalog();

/** Literal text props a person may change in place, in the order they are shown. */
const TEXT_PROPS = [
  "text",
  "content",
  "label",
  "title",
  "caption",
  "summary",
  "detail",
  "cite",
  "help",
  "placeholder",
];
const MULTILINE = new Set(["text", "content"]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The component's name in the person's language (the catalog's title), else its catalog name. */
function titleOf(c: SurfaceComponent, locale: string): string {
  const entry = catalog.get(c.component);
  const title = entry?.type.title as Record<string, string> | string | undefined;
  if (typeof title === "string") return title;
  return title?.[locale] ?? title?.en ?? c.component;
}

/** A few words for what the component shows: its text, then where its value comes from. */
function summaryOf(
  c: SurfaceComponent,
  t: (k: "editor.surface.bound" | "editor.surface.computed", p: Record<string, string>) => string,
): string | undefined {
  const props = isObj(c.props) ? c.props : {};
  const parts: string[] = [];
  const text = TEXT_PROPS.map((k) => props[k]).find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  if (text) {
    // Markdown marks are not what a reader sees.
    const plain = text
      .replace(/[*_`#>]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(plain.length > 80 ? `${plain.slice(0, 79)}…` : plain);
  }
  for (const key of ["value", "checked", "data", "rows", ...TEXT_PROPS]) {
    const v = props[key];
    if (isObj(v) && typeof v.path === "string") {
      parts.push(t("editor.surface.bound", { path: v.path }));
      break;
    }
    if (isObj(v) && typeof v.call === "string") {
      parts.push(t("editor.surface.computed", { fn: v.call }));
      break;
    }
  }
  return parts.length ? parts.join(" · ") : undefined;
}

/** The editable texts of a component: its literal string props the catalog declares as text. */
function fieldsOf(c: SurfaceComponent, locale: string): SurfaceOutlineField[] {
  const props = isObj(c.props) ? c.props : {};
  const schema = catalog.get(c.component)?.schema.properties ?? {};
  const fields: SurfaceOutlineField[] = [];
  for (const prop of TEXT_PROPS) {
    const s = schema[prop] as
      | { type?: string; maxLength?: number; title?: Record<string, string> }
      | undefined;
    const v = props[prop];
    if (s?.type !== "string" || typeof v !== "string") continue;
    fields.push({
      prop,
      label: s.title?.[locale] ?? s.title?.en ?? prop[0]?.toUpperCase() + prop.slice(1),
      value: v,
      multiline: MULTILINE.has(prop),
      ...(s.maxLength ? { maxLength: s.maxLength } : {}),
    });
  }
  return fields;
}

export function SurfaceSectionEditor({
  section,
  onChange,
  readOnly,
  buildHref,
}: {
  section: SurfaceSection;
  onChange: (s: SurfaceSection) => void;
  readOnly: boolean;
  /** Build chat for this page, aimed at a part of it (`?section=…&component=…`). */
  buildHref: (componentId?: string) => string;
}) {
  const { t, locale } = useI18n();
  const nodes = useMemo(() => {
    const byId = new Map(section.components.map((c) => [c.id, c]));
    const placed = new Set<string>();
    const node = (id: string, trail: Set<string>): SurfaceOutlineNode | undefined => {
      const c = byId.get(id);
      if (!c || trail.has(id)) return undefined;
      placed.add(id);
      const next = new Set(trail).add(id);
      const children = (Array.isArray(c.children) ? c.children : [])
        .map((k) => node(k, next))
        .filter((n): n is SurfaceOutlineNode => n !== undefined);
      const summary = summaryOf(c, t);
      return {
        id: c.id,
        title: titleOf(c, locale),
        ...(summary ? { summary } : {}),
        fields: fieldsOf(c, locale),
        ...(children.length ? { children } : {}),
      };
    };
    const root = node("root", new Set());
    // Components no parent lists are kept but not shown on the page.
    const loose = section.components
      .filter((c) => !placed.has(c.id))
      .map((c) => {
        const summary = summaryOf(c, t);
        return {
          id: c.id,
          title: titleOf(c, locale),
          ...(summary ? { summary } : {}),
          fields: fieldsOf(c, locale),
          status: t("editor.surface.notPlaced"),
        };
      });
    return [...(root ? [root] : []), ...loose];
  }, [section, locale, t]);

  const setField = (id: string, prop: string, value: string) =>
    onChange({
      ...section,
      components: section.components.map((c) =>
        c.id === id ? { ...c, props: { ...(isObj(c.props) ? c.props : {}), [prop]: value } } : c,
      ) as SurfaceSection["components"],
    });

  return (
    <div className="grid min-w-0 gap-3" data-surface={section.id}>
      <Banner
        icon={<Sparkle weight="fill" />}
        title={t("editor.surface.title", { count: section.components.length })}
        description={t("editor.surface.hint")}
        action={
          <LinkButton href={buildHref()} variant="secondary" icon={Sparkle}>
            {t("editor.surface.changeWithAi")}
          </LinkButton>
        }
      />
      <SurfaceOutline
        nodes={nodes}
        readOnly={readOnly}
        onField={setField}
        labels={{
          tree: t("editor.surface.outline"),
          expand: (title) => t("editor.surface.expand", { title }),
          collapse: (title) => t("editor.surface.collapse", { title }),
          editTexts: (title) => t("editor.surface.editTexts", { title }),
        }}
        actions={(n) => (
          <LinkButton
            href={buildHref(n.id)}
            variant="ghost"
            size="sm"
            shape="square"
            aria-label={t("editor.surface.changePart", { title: n.title })}
            icon={Sparkle}
          />
        )}
      />
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>{t("editor.surface.showJson")}</Collapsible.DefaultTrigger>
        <Collapsible.Panel>
          <div className="pt-3">
            <InputArea
              aria-label={t("editor.surface.json")}
              value={JSON.stringify(
                { components: section.components, data: section.data ?? {} },
                null,
                2,
              )}
              readOnly
              autoResize
              maxRows={16}
              className="w-full font-mono"
            />
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}
