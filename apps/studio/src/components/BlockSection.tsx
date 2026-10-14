/**
 * Component sections in the page editor (RFC-0015 §8, DESIGN.md §2aa): the deployment's block
 * types, their icons, a new section from a type's example, and the props form generated from the
 * type's schema (`BlockPropsForm`). A section whose type this deployment does not know is kept
 * as is and shown read-only.
 */
import type { ComponentSection } from "@cloudhal/core-contracts";
import { type BlockType, localized, sectionSchema, validateProps } from "@cloudhal/core-ts/blocks";
import { Banner, BlockPropsForm, blockIcon, InputArea } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export { blockIcon };

/** The deployment's block types (rarely change: cached for the session). */
export function useBlockTypes(siteId: string): BlockType[] {
  const query = useQuery({
    queryKey: ["block-types", siteId],
    queryFn: () => api.blockTypes(siteId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return query.data ?? [];
}

/** A new component section from a type's example (a container's example text as `content`). */
export function newBlockSection(id: string, type: BlockType): ComponentSection {
  return {
    id,
    kind: "component",
    type: type.name,
    props: {
      ...type.example.props,
      ...(type.content === "markdown" && type.example.markdown
        ? { content: type.example.markdown }
        : {}),
    },
  };
}

export function ComponentSectionForm({
  section,
  onChange,
  types,
  readOnly,
}: {
  section: ComponentSection;
  onChange: (next: ComponentSection) => void;
  types: readonly BlockType[];
  readOnly: boolean;
}) {
  const { t, locale } = useI18n();
  const type = types.find((x) => x.name === section.type);
  const schema = useMemo(() => (type ? sectionSchema(type) : undefined), [type]);
  const issues = useMemo(
    () => (schema ? validateProps(schema, section.props) : []),
    [schema, section.props],
  );
  if (!type || !schema)
    return (
      <div className="grid min-w-0 gap-3" data-unknown-block={section.type}>
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          title={t("editor.blocks.unknown", { type: section.type })}
          description={t("editor.blocks.unknownHint")}
        />
        <InputArea
          aria-label={t("editor.blocks.unknown", { type: section.type })}
          value={JSON.stringify(section.props, null, 2)}
          readOnly
          autoResize
          maxRows={16}
          className="w-full font-mono"
        />
      </div>
    );
  const values = useBlockEnumLabel();
  return (
    <BlockPropsForm
      schema={schema}
      value={section.props}
      onChange={(props) => onChange({ ...section, props })}
      issues={issues}
      locale={locale}
      disabled={readOnly}
      enumLabel={values}
      labels={{
        item: t("editor.blocks.item"),
        addItem: t("editor.blocks.addItem"),
        removeItem: t("editor.blocks.removeItem"),
        moveUp: t("editor.blocks.moveUp"),
        moveDown: t("editor.blocks.moveDown"),
      }}
    />
  );
}

/** Words for the built-ins' enum values (`tone` → "Warning"); other values show as written. */
export function useBlockEnumLabel() {
  const { t } = useI18n();
  return useCallback(
    (prop: string, value: string) => {
      const known: Record<string, Record<string, string>> = {
        tone: {
          info: t("editor.blocks.values.tone.info"),
          success: t("editor.blocks.values.tone.success"),
          warning: t("editor.blocks.values.tone.warning"),
          danger: t("editor.blocks.values.tone.danger"),
        },
        variant: {
          primary: t("editor.blocks.values.variant.primary"),
          secondary: t("editor.blocks.values.variant.secondary"),
        },
      };
      return known[prop]?.[value] ?? value;
    },
    [t],
  );
}

/** A component section's card title: its type's title, or "Unknown block · name". */
export function useBlockTitle(types: readonly BlockType[]) {
  const { t, locale } = useI18n();
  return (name: string) => {
    const type = types.find((x) => x.name === name);
    return type ? localized(type.title, locale) : t("editor.blocks.unknown", { type: name });
  };
}
