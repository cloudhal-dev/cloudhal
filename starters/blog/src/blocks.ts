/**
 * This theme's block types (RFC-0015 §6): pure data, read by Studio, agents (`list_block_types`)
 * and the store, and bundled by `cloudhal deploy`. Their components are in `theme.ts` (`blocks`).
 *
 * Names are plain English words shared by every theme (`testimonial`, `pricing-table`), never
 * prefixed with the theme: content written under one theme renders under any other that defines
 * the same name. The built-ins (`callout`, `button`, `embed`, `faq`) are reserved; restyle them
 * through `blocks` in `theme.ts` instead.
 *
 * Keep this file data only, with type imports only: the CLI loads it on its own (Studio, agents,
 * deploy) and checks every type, so it needs nothing from the project at run time.
 */
import type { BlockType } from "@cloudhal/core-ts/blocks";

export const blockTypes: readonly BlockType[] = [
  {
    name: "testimonial",
    title: { en: "Testimonial", tr: "Referans" },
    description: {
      en: "A quote from a reader or customer, with who said it.",
      tr: "Bir okurdan ya da müşteriden alıntı ve kimin söylediği.",
    },
    icon: "Quotes",
    category: "text",
    where: ["section", "body"],
    content: "markdown",
    props: {
      type: "object",
      additionalProperties: false,
      required: ["author"],
      properties: {
        author: { type: "string", minLength: 1, maxLength: 120, title: { en: "Name", tr: "Ad" } },
        role: {
          type: "string",
          maxLength: 120,
          title: { en: "Role or company", tr: "Unvan ya da şirket" },
        },
      },
    },
    example: {
      props: { author: "Ada Lovelace", role: "Analyst" },
      markdown: "This changed how we publish.",
    },
  },
];
