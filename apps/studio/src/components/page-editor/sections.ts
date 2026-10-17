/** The page editor's section model: the kinds Studio offers, their icons, new and duplicated sections. */
import type { Page, Section } from "@cloudhal/core-contracts";
import {
  Cube,
  type Icon,
  Image as ImageIcon,
  ListBullets,
  Sparkle,
  TextAlignLeft,
  TextHOne,
} from "@phosphor-icons/react";
import type { NewPage } from "../../lib/api.ts";

export const KINDS: Section["kind"][] = ["hero", "richText", "image", "contentList"];
export const KIND_ICON: Record<Section["kind"], Icon> = {
  hero: TextHOne,
  richText: TextAlignLeft,
  image: ImageIcon,
  contentList: ListBullets,
  component: Cube,
  surface: Sparkle,
};

export const sectionId = () =>
  `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const copySuffix = () => `copy-${Date.now().toString(36).slice(-4)}`;

export function newSection(kind: Section["kind"], heading: string): Section {
  const id = sectionId();
  switch (kind) {
    case "hero":
      return { id, kind, heading };
    case "richText":
      return { id, kind, format: "markdown", body: "" };
    case "image":
      return { id, kind, image: { src: "/assets/image.jpg", alt: "" } };
    case "contentList":
      return { id, kind, collection: "posts", limit: 10, sort: "newest" };
    case "component":
      // Component sections start from a block type (`newBlockSection`), not from here.
      return { id, kind, type: "callout", props: {} };
    case "surface":
      // Surfaces are built by agents (RFC-0020); Studio does not offer an empty one.
      return { id, kind, catalog: "cloudhal@1", components: [{ id: "root", component: "Stack" }] };
  }
}

/** A copy of the page as a new draft (fresh section ids, a free path). */
export function duplicateOf(page: Page, title: string): NewPage {
  return {
    path: page.path === "/" ? `/${copySuffix()}` : `${page.path}-${copySuffix()}`,
    title,
    locale: page.locale,
    status: "draft",
    sections: page.sections.map((s) => ({ ...s, id: sectionId() })),
    ...(page.seo ? { seo: page.seo } : {}),
    ...(page.metadata ? { metadata: page.metadata } : {}),
  };
}

/** Field rows inside a section card: stacked on phones, side by side when there is room. */
export const FIELD_ROW = "items-start gap-x-4 gap-y-5";
