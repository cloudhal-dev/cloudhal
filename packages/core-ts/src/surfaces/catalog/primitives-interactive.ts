/** Interactive primitives: Tabs … Lightbox (scrollytelling, carousels, overlays). */
import { COMPONENT_ID, href, label, type PrimitiveType, schema, space } from "./props.ts";

export const INTERACTIVE_PRIMITIVES: readonly PrimitiveType[] = [
  {
    name: "Tabs",
    title: { en: "Tabs", tr: "Sekmeler" },
    description: {
      en: "One panel shown at a time; works without JavaScript.",
      tr: "Bir seferde bir panel.",
    },
    category: "interactive",
    props: schema({}),
    children: ["TabPanel"],
    example: { props: {} },
  },
  {
    name: "TabPanel",
    title: { en: "Tab", tr: "Sekme" },
    category: "interactive",
    props: schema({ label: label(60) }, ["label"]),
    children: "any",
    example: { props: { label: "Monthly" } },
  },
  {
    name: "Accordion",
    title: { en: "Accordion", tr: "Akordeon" },
    category: "interactive",
    props: schema({}),
    children: ["Disclosure"],
    example: { props: {} },
  },
  {
    name: "Disclosure",
    title: { en: "Disclosure", tr: "Açılır bölüm" },
    description: { en: "A summary that opens to show its children.", tr: "Açılan bir özet." },
    category: "interactive",
    props: schema({ summary: label(200), open: { type: "boolean" } }, ["summary"]),
    children: "any",
    example: { props: { summary: "Can I cancel any time?" } },
  },
  // RFC-0024 §3: scroll storytelling and progress.
  {
    name: "Scrolly",
    title: { en: "Scroll story", tr: "Kaydırmalı anlatım" },
    description: {
      en: "Scroll storytelling: the first child (a chart, a stat, an image) stays in view while the Step children scroll past, and the step being read is written to `step` (a binding), so the first child can change with it through `visible` conditions or `choose`.",
      tr: "Kaydırmalı anlatım: ilk öğe görünür kalır, Step'ler kayarken okunan adımın numarası `step` yoluna yazılır.",
    },
    category: "interactive",
    props: schema(
      {
        step: {
          type: "object",
          additionalProperties: false,
          required: ["path"],
          properties: { path: { type: "string", pattern: "^/[^\\s]{0,199}$" } },
          title: { en: "Step number", tr: "Adım numarası" },
        },
        side: { type: "string", enum: ["start", "end"] },
        ratio: { type: "string", enum: ["1-1", "2-1", "1-2"] },
      },
      ["step"],
    ),
    children: "any",
    example: { props: { step: { path: "/step" }, side: "start", ratio: "1-1" } },
  },
  {
    name: "Step",
    title: { en: "Step", tr: "Adım" },
    description: {
      en: "One step of a scroll story (inside Scrolly).",
      tr: "Kaydırmalı anlatımın bir adımı.",
    },
    category: "interactive",
    props: schema({}),
    children: "any",
    example: { props: {} },
  },
  {
    name: "ScrollProgress",
    title: { en: "Scroll progress", tr: "Okuma ilerlemesi" },
    description: {
      en: "A thin bar showing how far the reader is through the page (placement page) or this section.",
      tr: "Okurun sayfada ya da bu bölümde ne kadar ilerlediğini gösteren ince çubuk.",
    },
    category: "content",
    props: schema({
      placement: { type: "string", enum: ["page", "section"] },
      tone: { type: "string", enum: ["brand", "accent", "neutral"] },
    }),
    children: "none",
    example: { props: { placement: "page", tone: "brand" } },
  },
  // RFC-0024 §3: moving rows and counting numbers.
  {
    name: "Marquee",
    title: { en: "Marquee", tr: "Kayan şerit" },
    description: {
      en: "A row that moves by itself (logos or quotes passing by, tags); at least 3 children. Readers can pause it; at low motion levels it is a still row. When the reader should move through the items themselves (scroll, swipe, arrows), use a Carousel rail instead.",
      tr: "Kendiliğinden kayan bir sıra (logolar, alıntılar); en az 3 öğe. Okur öğeler arasında kendisi gezecekse Carousel rail kullanın.",
    },
    category: "layout",
    props: schema({
      speed: { type: "string", enum: ["slow", "normal", "fast"] },
      direction: { type: "string", enum: ["start", "end"] },
      pauseOnHover: { type: "boolean" },
      gap: space({ en: "Gap", tr: "Boşluk" }),
    }),
    children: "any",
    example: { props: { speed: "slow", direction: "start", pauseOnHover: true, gap: "l" } },
  },
  {
    name: "Counter",
    title: { en: "Counter", tr: "Sayaç" },
    description: {
      en: "A number that counts up once as it comes into view; the final number is in the page.",
      tr: "Görünür olunca bir kez sayan bir sayı; son değer sayfada yazılıdır.",
    },
    category: "content",
    props: schema(
      {
        value: { type: "number", minimum: -1e12, maximum: 1e12 },
        from: { type: "number", minimum: -1e12, maximum: 1e12 },
        decimals: { type: "integer", minimum: 0, maximum: 3 },
        prefix: { type: "string", maxLength: 8 },
        suffix: { type: "string", maxLength: 16 },
        label: label(80),
        duration: { type: "string", enum: ["fast", "normal", "slow"] },
      },
      ["value"],
    ),
    children: "none",
    example: { props: { value: 38000, prefix: "", suffix: "+", label: "Freelancers" } },
  },
  // RFC-0027: slides a reader moves through; works without JavaScript (scroll snap, link markers).
  {
    name: "Carousel",
    title: { en: "Carousel", tr: "Kaydırmalı alan" },
    description: {
      en: "Slides a reader moves through: each child is one slide. hero: 2–5 full-width slides (one frame size, aspect); rail: 2–12 cards or logos side by side, perView or as many as fit; gallery: up to 24 images, one at a time, with thumbnails (markers thumbs); testimonials: 2–12 quotes, centred, the neighbours peeking in. Prefer a static hero; never put the only way to something on a later slide.",
      tr: "Okurun gezdiği slaytlar; her alt öğe bir slayt. hero: 2–5 tam genişlik slayt; rail: yan yana 2–12 kart.",
    },
    category: "interactive",
    props: schema(
      {
        label: label(80),
        variant: { type: "string", enum: ["hero", "rail", "gallery", "testimonials"] },
        perView: { type: "integer", minimum: 1, maximum: 4 },
        itemWidth: { type: "string", enum: ["s", "m", "l"] },
        peek: { type: "string", enum: ["none", "s", "m"] },
        align: { type: "string", enum: ["start", "center"] },
        gap: space({ en: "Gap", tr: "Boşluk" }),
        aspect: { type: "string", enum: ["16:9", "21:9", "4:3", "1:1", "3:4"] },
        controls: { type: "string", enum: ["both", "arrows", "markers", "none"] },
        markers: { type: "string", enum: ["numbers", "dots", "thumbs"] },
        // RFC-0027 27d: a hero only; autoplay off unless the site asks, and guarded.
        loop: { type: "boolean" },
        autoplay: { type: "string", enum: ["off", "slow", "normal"] },
      },
      ["label"],
    ),
    children: "any",
    example: { props: { label: "Customer stories", variant: "rail", peek: "s", gap: "m" } },
  },
  // RFC-0025 §3: overlays. Their children are their content; they open only from a reader's action.
  {
    name: "Dialog",
    title: { en: "Dialog", tr: "İletişim kutusu" },
    description: {
      en: 'Short, optional detail over the page (terms, a video, filters), opened by a Button with onClick {action:"open",target:"<this id>"}. fallbackHref is a page with the same content, for readers without JavaScript.',
      tr: "Sayfanın üstünde kısa, isteğe bağlı ayrıntı; bir Button'ın open eylemiyle açılır.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        size: { type: "string", enum: ["s", "m", "l"] },
        dismiss: { type: "string", enum: ["any", "closerequest", "explicit"] },
        fallbackHref: href,
      },
      ["title"],
    ),
    children: "any",
    example: { props: { title: "Pricing details", size: "m" } },
  },
  {
    name: "Drawer",
    title: { en: "Drawer", tr: "Çekmece" },
    description: {
      en: "A panel that slides in from an edge (filters, a cart, settings), opened like a Dialog.",
      tr: "Bir kenardan kayan panel; Dialog gibi açılır.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        placement: { type: "string", enum: ["start", "end", "bottom"] },
        size: { type: "string", enum: ["s", "m", "l"] },
      },
      ["title"],
    ),
    children: "any",
    example: { props: { title: "Filters", placement: "end" } },
  },
  {
    name: "Popover",
    title: { en: "Popover", tr: "Açılır kutu" },
    description: {
      en: "A small panel under the Button that opens it (a definition, a share menu); Escape or a click elsewhere closes it.",
      tr: "Açan düğmenin altında küçük bir panel.",
    },
    category: "interactive",
    props: schema({
      placement: { type: "string", enum: ["bottom", "top", "start", "end"] },
      width: { type: "string", enum: ["s", "m", "l"] },
    }),
    children: "any",
    example: { props: { placement: "bottom", width: "m" } },
  },
  {
    name: "Tooltip",
    title: { en: "Tooltip", tr: "İpucu" },
    description: {
      en: "A short text shown when the reader points at or focuses a Button or Link (`for`); never the only way to the information.",
      tr: "Bir Button veya Link'e gelince görünen kısa metin.",
    },
    category: "interactive",
    props: schema({ text: label(160), for: { type: "string", pattern: COMPONENT_ID } }, [
      "text",
      "for",
    ]),
    children: "none",
    example: { props: { text: "Billed yearly", for: "price-note" } },
  },
  {
    name: "Lightbox",
    title: { en: "Lightbox", tr: "Görsel galerisi" },
    description: {
      en: "Thumbnails of images that open large, one at a time, with previous and next; without JavaScript each thumbnail links to its image.",
      tr: "Büyük açılan küçük resimler; önceki ve sonraki ile gezilir.",
    },
    category: "interactive",
    props: schema(
      {
        title: label(120),
        items: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["asset", "alt"],
            properties: {
              asset: { type: "string", format: "asset" },
              alt: { type: "string", maxLength: 300 },
              caption: { type: "string", maxLength: 300 },
            },
          },
        },
        start: { type: "integer", minimum: 0, maximum: 23 },
      },
      ["items"],
    ),
    children: "none",
    example: {
      props: {
        title: "The bakery",
        items: [{ asset: "asset:ast_example01", alt: "Loaves cooling on a rack" }],
      },
    },
  },
];
