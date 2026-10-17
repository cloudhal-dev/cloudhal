/**
 * The command palette's matching (DESIGN.md §1 "Top bar"): every word of the query must appear in
 * the command's label, compared the way term names are (`foldName`: Turkish-aware lower-casing,
 * diacritics dropped), so "yayin" finds "Yayınla" and "go art" finds "Go to articles".
 */
import { foldName } from "@cloudhal/core-ts/names";

export function matchCommands<T extends { label: string }>(
  commands: readonly T[],
  query: string,
): T[] {
  const words = foldName(query).split("-").filter(Boolean);
  if (words.length === 0) return [...commands];
  return commands.filter((c) => {
    const label = foldName(c.label);
    return words.every((w) => label.includes(w));
  });
}
