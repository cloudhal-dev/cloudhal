/** The fields of one page section, by kind (surfaces, blocks, hero, rich text, image, content list). */
import type { Section } from "@cloudhal/core-contracts";
import type { BlockType } from "@cloudhal/core-ts/blocks";
import { Grid, Input, InputArea, Select } from "@cloudhal/ui";
import { useT } from "../../i18n/index.tsx";
import { validateImageRef } from "../../lib/seo.ts";
import { setOptional } from "../../lib/util.ts";
import { ComponentSectionForm } from "../BlockSection.tsx";
import { BodyEditor } from "../BodyEditor.tsx";
import { ImageRefField } from "../MediaPicker.tsx";
import { SurfaceSectionEditor } from "../SurfaceSectionEditor.tsx";
import { FIELD_ROW } from "./sections.ts";

/** Where a section's image comes from: the site (media library, primary domain). */
export interface MediaContext {
  siteId: string;
  defaultLocale: string;
  host: string | undefined;
  /** The page (in-editor AI's context, RFC-0016) and its language. */
  nodeId: string;
  locale: string;
}

export function SectionForm({
  section,
  onChange,
  media,
  blocks,
  readOnly,
}: {
  section: Section;
  onChange: (s: Section) => void;
  media: MediaContext;
  /** The deployment's block types (RFC-0015), for component sections. */
  blocks: readonly BlockType[];
  /** The fieldset turns off native fields; the rich body editor needs telling. */
  readOnly: boolean;
}) {
  const t = useT();
  switch (section.kind) {
    // RFC-0020 surfaces: an outline with editable texts; layout changes go to Build chat.
    case "surface":
      return (
        <SurfaceSectionEditor
          section={section}
          onChange={onChange}
          readOnly={readOnly}
          buildHref={(componentId) =>
            `/sites/${media.siteId}/pages/${media.nodeId}/build?section=${encodeURIComponent(section.id)}${componentId ? `&component=${encodeURIComponent(componentId)}` : ""}`
          }
        />
      );
    case "component":
      return (
        <ComponentSectionForm
          section={section}
          onChange={onChange}
          types={blocks}
          readOnly={readOnly}
        />
      );
    case "hero":
      return (
        <>
          <Input
            label={t("editor.heading")}
            value={section.heading}
            onValueChange={(v) => onChange({ ...section, heading: v })}
            className="w-full"
          />
          <Input
            label={t("editor.subheading")}
            value={section.subheading ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "subheading", v))}
            required={false}
            className="w-full"
          />
          {/* The hero's picture is optional (RFC-0004 §2.2 slot `HeroSection.image`). */}
          <ImageRefField
            siteId={media.siteId}
            defaultLocale={media.defaultLocale}
            image={section.image}
            savedSrc={undefined}
            host={media.host}
            errors={validateImageRef(section.image)}
            showErrors={false}
            onChange={(image) => onChange(setOptional(section, "image", image))}
            testId={`hero-${section.id}`}
            labels={{ empty: t("editor.heroNoImage") }}
          />
        </>
      );
    case "richText":
      return section.format === "markdown" ? (
        <BodyEditor
          siteId={media.siteId}
          defaultLocale={media.defaultLocale}
          host={media.host}
          nodeId={media.nodeId}
          pageLocale={media.locale}
          value={section.body}
          onChange={(v) => onChange({ ...section, body: v })}
          size="sm"
          readOnly={readOnly}
        />
      ) : (
        <InputArea
          label={t("editor.body")}
          value={section.body}
          onValueChange={(v) => onChange({ ...section, body: v })}
          autoResize
          minRows={6}
          maxRows={24}
          className="w-full font-mono"
        />
      );
    case "image":
      return (
        <>
          <ImageRefField
            siteId={media.siteId}
            defaultLocale={media.defaultLocale}
            image={section.image}
            savedSrc={undefined}
            host={media.host}
            errors={validateImageRef(section.image)}
            showErrors={false}
            // The section needs an image: clearing the fields keeps an empty address to fill in.
            onChange={(image) => onChange({ ...section, image: image ?? { src: "", alt: "" } })}
            testId={`image-${section.id}`}
          />
          <Input
            label={t("editor.caption")}
            value={section.caption ?? ""}
            onValueChange={(v) => onChange(setOptional(section, "caption", v))}
            required={false}
            className="w-full"
          />
        </>
      );
    case "contentList":
      return <ContentListFields section={section} onChange={onChange} />;
  }
}

/** A content list: which collection, how many entries, in which order. */
function ContentListFields({
  section,
  onChange,
}: {
  section: Extract<Section, { kind: "contentList" }>;
  onChange: (s: Section) => void;
}) {
  const t = useT();
  return (
    <Grid variant="3up" gap="none" className={FIELD_ROW}>
      <Input
        label={t("editor.collection")}
        value={section.collection}
        onValueChange={(v) => onChange({ ...section, collection: v })}
        className="w-full"
      />
      <Input
        label={t("editor.limit")}
        type="number"
        min={1}
        max={100}
        value={String(section.limit)}
        onValueChange={(v) =>
          onChange({ ...section, limit: Math.max(1, Math.min(100, Number(v) || 1)) })
        }
        className="w-full"
      />
      <Select
        label={t("editor.sort")}
        value={section.sort}
        onValueChange={(v) => onChange({ ...section, sort: v as typeof section.sort })}
        items={{
          newest: t("editor.sortNewest"),
          oldest: t("editor.sortOldest"),
          title: t("editor.sortTitle"),
        }}
        className="w-full"
      />
    </Grid>
  );
}
