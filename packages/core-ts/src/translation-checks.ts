/**
 * RFC-0033 §6: the deterministic checks a machine translation passes before a person reviews it.
 * They compare the draft with its source: the layout (a linked page keeps the source's sections),
 * internal links, numbers, the glossary (terms never translated stay as written, approved
 * translations are used) and a sane length. A failed check is recorded in the translation's
 * provenance as `!<name>`, and the store refuses to publish it (`store/translations.ts`).
 * Worker-safe and pure: Studio's pipeline and the MCP tools share it.
 */
import type { ContentEntry, Glossary, Page } from "@cloudhal/core-contracts";
import { searchText, sectionText } from "./search-rows.ts";

export type TranslationCheckName = "structure" | "links" | "numbers" | "glossary" | "length";

export interface TranslationCheck {
  readonly name: TranslationCheckName;
  readonly ok: boolean;
  /** What failed, for the agent or the reviewer. */
  readonly detail?: string;
}

type Localized = Page | ContentEntry;

/** The words of a node a translation changes: title, summary or sections, body, SEO. */
function textOf(node: Localized): string {
  const seo = "seo" in node && node.seo ? [node.seo.title, node.seo.description] : [];
  const main =
    "sections" in node
      ? sectionText(node.sections)
      : [node.summary ?? "", searchText(node.body)].join(" ");
  return [node.title, main, ...seo].filter(Boolean).join(" ");
}

/** The raw markup that carries links: markdown bodies, and section JSON for pages. */
function rawOf(node: Localized): string {
  return "sections" in node ? JSON.stringify(node.sections) : node.body.value;
}

/** Root-relative links (`/about`, `/posts/x#y`) in markdown or JSON, without query or fragment. */
function internalLinks(raw: string): Set<string> {
  const out = new Set<string>();
  for (const m of raw.matchAll(/(?:\]\(|"href":"|href=\\?")(\/[^)\s"'\\?#]*)/g))
    if (m[1] && !m[1].startsWith("//")) out.add(m[1]);
  return out;
}

/** Zero of the decimal digit blocks a translation may write numbers in (Arabic, Persian, …). */
const ZEROS = [0x660, 0x6f0, 0x966, 0x9e6, 0xe50, 0xff10];

/** Digits of other scripts as ASCII: ٣ and ۳ and ३ are 3. */
function asciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0) ?? 0;
    const zero = ZEROS.find((z) => cp >= z && cp <= z + 9);
    return zero === undefined ? d : String(cp - zero);
  });
}

/** Numbers in a text (separators dropped: 1,000 and 1.000 and ١٬٠٠٠ are one number). */
function numbers(text: string): string[] {
  return [...asciiDigits(text).matchAll(/\d[\d.,\u066b\u066c]*\d|\d/g)].map((m) =>
    m[0].replace(/[.,\u066b\u066c]/g, ""),
  );
}

const has = (text: string, term: string, caseSensitive: boolean | undefined) =>
  caseSensitive ? text.includes(term) : text.toLocaleLowerCase().includes(term.toLocaleLowerCase());

/** Every check for a draft against its source, in a fixed order. */
export function checkTranslation(input: {
  source: Localized;
  draft: Localized;
  locale: string;
  glossary?: Glossary | undefined;
}): TranslationCheck[] {
  const { source, draft, locale } = input;
  const out: TranslationCheck[] = [];
  const linked = (draft.translation?.layout ?? "linked") === "linked";
  if ("sections" in source && "sections" in draft && linked) {
    const shape = (p: Page) => p.sections.map((s) => `${s.id}:${s.kind}`).join(",");
    out.push(
      shape(source) === shape(draft)
        ? { name: "structure", ok: true }
        : {
            name: "structure",
            ok: false,
            detail: "a linked translation keeps the source's sections: same ids, kinds and order",
          },
    );
  }
  const missingLinks = [...internalLinks(rawOf(source))].filter(
    (l) => !internalLinks(rawOf(draft)).has(l),
  );
  out.push(
    missingLinks.length === 0
      ? { name: "links", ok: true }
      : {
          name: "links",
          ok: false,
          detail: `links missing: ${missingLinks.slice(0, 10).join(", ")}`,
        },
  );
  const sourceText = textOf(source);
  const draftText = textOf(draft);
  const draftNumbers = new Set(numbers(draftText));
  const missingNumbers = [...new Set(numbers(sourceText))].filter((n) => !draftNumbers.has(n));
  out.push(
    missingNumbers.length === 0
      ? { name: "numbers", ok: true }
      : {
          name: "numbers",
          ok: false,
          detail: `numbers missing: ${missingNumbers.slice(0, 10).join(", ")}`,
        },
  );
  const problems: string[] = [];
  for (const entry of input.glossary?.entries ?? []) {
    if (!has(sourceText, entry.term, entry.caseSensitive)) continue;
    if (entry.doNotTranslate && !has(draftText, entry.term, entry.caseSensitive))
      problems.push(`"${entry.term}" stays as written`);
    const approved = entry.translations?.[locale]?.text;
    if (approved && !has(draftText, approved, entry.caseSensitive))
      problems.push(`"${entry.term}" is "${approved}"`);
  }
  out.push(
    problems.length === 0
      ? { name: "glossary", ok: true }
      : { name: "glossary", ok: false, detail: problems.slice(0, 10).join("; ") },
  );
  const ratio = draftText.length / Math.max(1, sourceText.length);
  out.push(
    sourceText.length < 40 || (ratio > 0.25 && ratio < 4)
      ? { name: "length", ok: true }
      : {
          name: "length",
          ok: false,
          detail: `the draft is ${ratio.toFixed(2)}× the source's length`,
        },
  );
  return out;
}

/** The checks as `provenance.checks`: passed by name, failed as `!name`. */
export function checkNames(checks: readonly TranslationCheck[]): string[] {
  return checks.map((c) => (c.ok ? c.name : `!${c.name}`));
}
