/**
 * RFC-0033 §4a: a linked translation follows its original's layout. When the original gains,
 * loses or reorders sections, the translation's sections are rebuilt in the original's order:
 * sections it already has keep their translated text, new ones arrive with the original's text and
 * are named as untranslated, removed ones go. Nothing is written here — the caller (an agent
 * through `get_translation_source`, or Studio) translates the named sections and saves the result,
 * so untranslated text never reaches readers by itself. Worker-safe and pure.
 */
import type { Page, Section } from "@cloudhal/core-contracts";

export interface LinkedLayout {
  /** The translation's sections in the original's order. */
  readonly sections: Section[];
  /** Sections that came from the original and still need translating. */
  readonly untranslated: string[];
  /** Sections of the translation the original no longer has. */
  readonly removed: string[];
  /** Whether anything differs from the translation's current sections. */
  readonly changed: boolean;
}

/**
 * The translation's sections rebuilt on the original's layout. A section kept by id keeps the
 * translation's content unless its kind changed in the original (then it is new again).
 */
export function linkedLayout(original: Page, translation: Page): LinkedLayout {
  const own = new Map(translation.sections.map((s) => [s.id, s]));
  const keep = new Set(original.sections.map((s) => s.id));
  const untranslated: string[] = [];
  const sections = original.sections.map((s) => {
    const mine = own.get(s.id);
    if (mine && mine.kind === s.kind) return mine;
    untranslated.push(s.id);
    return s;
  });
  const removed = translation.sections.filter((s) => !keep.has(s.id)).map((s) => s.id);
  const order = (list: readonly Section[]) => list.map((s) => s.id).join(",");
  return {
    sections,
    untranslated,
    removed,
    changed:
      untranslated.length > 0 ||
      removed.length > 0 ||
      order(sections) !== order(translation.sections),
  };
}
