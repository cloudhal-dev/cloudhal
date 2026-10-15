/**
 * Reference pages for the design judge (RFC-0021 21c): one brief built four ways, from empty to
 * strong, so a judge can be checked against an order everyone agrees on. A judge that gives them
 * the same score cannot rank models. Built from catalog primitives only (`blog@1`).
 */
import type { SurfaceSection } from "@cloudhal/core-contracts";

export interface DesignReference {
  id: "empty" | "bare" | "plain" | "strong";
  /** What a fair judge gives it, as an inclusive range of the mean score. */
  expected: readonly [number, number];
  sections: SurfaceSection[];
}

/** The brief all references answer (the eval's `landing` brief). */
export const REFERENCE_BRIEF =
  "A landing page for a newsletter tool: a dark hero with a headline, a sentence and a sign-up button, three features with a heading and a sentence each, and a quote from a customer.";

const surface = (id: string, components: object[]): SurfaceSection => ({
  id,
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
});

const FEATURES = [
  ["Write once", "Draft in the editor you know; we format it for every inbox."],
  ["Grow on autopilot", "Sign-up forms, referrals and welcome emails, set up in minutes."],
  ["Know what works", "Opens, clicks and replies per issue, without tracking pixels."],
] as const;

export const DESIGN_REFERENCES: readonly DesignReference[] = [
  {
    id: "empty",
    expected: [1, 1.5],
    sections: [surface("sec_refempty01", [{ id: "root", component: "Stack", children: [] }])],
  },
  {
    id: "bare",
    expected: [1.5, 2.5],
    sections: [
      surface("sec_refbare001", [
        { id: "root", component: "Stack", children: ["title", "lede"] },
        { id: "title", component: "Heading", props: { text: "Newsletter tool", level: 1 } },
        { id: "lede", component: "Text", props: { text: "Send newsletters." } },
      ]),
    ],
  },
  {
    id: "plain",
    expected: [2.5, 3.5],
    sections: [
      surface("sec_refplain01", [
        {
          id: "root",
          component: "Stack",
          props: { gap: "s" },
          children: ["title", "lede", "cta", "f1", "f1t", "f2", "f2t", "f3", "f3t", "quote"],
        },
        { id: "title", component: "Heading", props: { text: "Letterbox", level: 1 } },
        {
          id: "lede",
          component: "Text",
          props: { text: "The newsletter tool for writers who would rather write." },
        },
        { id: "cta", component: "Button", props: { label: "Sign up", href: "/signup" } },
        ...FEATURES.flatMap(([h, t], i) => [
          { id: `f${i + 1}`, component: "Heading", props: { text: h, level: 2 } },
          { id: `f${i + 1}t`, component: "Text", props: { text: t } },
        ]),
        {
          id: "quote",
          component: "Quote",
          props: { text: "We doubled our readers in a month.", cite: "Ayşe Yılmaz" },
        },
      ]),
    ],
  },
  {
    id: "strong",
    expected: [3.25, 5],
    sections: [
      surface("sec_refstrong1", [
        {
          id: "root",
          component: "Band",
          props: { tone: "inverse", width: "wide", spacing: "xl" },
          children: ["hero"],
        },
        {
          id: "hero",
          component: "Stack",
          props: { gap: "l", align: "center" },
          children: ["title", "lede", "actions"],
        },
        {
          id: "title",
          component: "Heading",
          props: { text: "Newsletters your readers wait for", level: 1, align: "center" },
        },
        {
          id: "lede",
          component: "Text",
          props: {
            text: "Letterbox turns your drafts into beautiful issues and grows your list while you write.",
            size: "l",
            align: "center",
          },
        },
        {
          id: "actions",
          component: "Stack",
          props: { gap: "s", align: "center" },
          children: ["signup", "tour"],
        },
        {
          id: "signup",
          component: "Button",
          props: { label: "Start free", href: "/signup", variant: "primary" },
        },
        {
          id: "tour",
          component: "Button",
          props: { label: "See an issue", href: "/sample", variant: "ghost" },
        },
      ]),
      surface("sec_refstrong2", [
        {
          id: "root",
          component: "Band",
          props: { tone: "surface", width: "wide", spacing: "l" },
          children: ["stack"],
        },
        { id: "stack", component: "Stack", props: { gap: "l" }, children: ["heading", "grid"] },
        {
          id: "heading",
          component: "Heading",
          props: { text: "Everything a writer needs, nothing more", level: 2, align: "center" },
        },
        {
          id: "grid",
          component: "Grid",
          props: { columns: 3, gap: "m" },
          children: ["c1", "c2", "c3"],
        },
        ...FEATURES.flatMap(([h, t], i) => [
          {
            id: `c${i + 1}`,
            component: "Card",
            props: { tone: "surface" },
            children: [`c${i + 1}h`, `c${i + 1}t`],
          },
          { id: `c${i + 1}h`, component: "Heading", props: { text: h, level: 3 } },
          { id: `c${i + 1}t`, component: "Text", props: { text: t, muted: true } },
        ]),
      ]),
      surface("sec_refstrong3", [
        {
          id: "root",
          component: "Band",
          props: { tone: "muted", width: "narrow", spacing: "l" },
          children: ["quote"],
        },
        {
          id: "quote",
          component: "Quote",
          props: {
            text: "We doubled our readers in a month, and I spend my Sundays writing again.",
            cite: "Ayşe Yılmaz",
            role: "Editor, The Weekly Fig",
          },
        },
      ]),
      surface("sec_refstrong4", [
        {
          id: "root",
          component: "Band",
          props: { tone: "brand", width: "wide", spacing: "l" },
          children: ["stack"],
        },
        {
          id: "stack",
          component: "Stack",
          props: { gap: "m", align: "center" },
          children: ["heading", "button"],
        },
        {
          id: "heading",
          component: "Heading",
          props: { text: "Your first issue is ten minutes away", level: 2, align: "center" },
        },
        {
          id: "button",
          component: "Button",
          props: { label: "Start free", href: "/signup", variant: "primary" },
        },
      ]),
    ],
  },
];
