import type { Plugin } from "vite";

/** The Phosphor weights Studio draws (DESIGN.md: icons are regular, `fill` for state, `bold` for emphasis). */
export const STUDIO_ICON_WEIGHTS = ["regular", "bold", "fill"] as const;

const DEFS = /[\\/]@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][A-Za-z0-9]+\.es\.js$/;

/**
 * Drops the weights Studio never draws from a Phosphor icon definition. Every React icon module
 * ships all six weights (thin, light, regular, bold, fill, duotone) as one `Map`, so each icon in
 * the shell cost about 3.6 kB; three weights halve that. The definitions are generated with one
 * entry per weight (`  [` / `    "<weight>",` … `  ]`), which is what this reads; anything else is
 * left untouched.
 */
export function keepWeights(code: string, keep: readonly string[] = STUDIO_ICON_WEIGHTS): string {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => /new Map\(\[$/.test(l));
  const end = lines.findIndex((l, i) => i > start && l === "]);");
  if (start < 0 || end < 0) return code;
  const entries: string[][] = [];
  let current: string[] | undefined;
  for (const line of lines.slice(start + 1, end)) {
    if (line === "  [") current = [line];
    else if (current) {
      current.push(line);
      if (line === "  ]" || line === "  ],") {
        entries.push(current);
        current = undefined;
      }
    } else return code;
  }
  if (current || entries.length === 0) return code;
  const weightOf = (entry: string[]) => /^ {4}"([a-z]+)",$/.exec(entry[1] ?? "")?.[1];
  if (entries.some((e) => weightOf(e) === undefined)) return code;
  const kept = entries
    .filter((e) => keep.includes(weightOf(e) as string))
    .map((e) => [...e.slice(0, -1), "  ]"].join("\n"));
  if (kept.length === entries.length) return code;
  return [...lines.slice(0, start + 1), kept.join(",\n"), ...lines.slice(end)].join("\n");
}

/** Vite plugin: Studio's Phosphor icons carry only the weights it draws. */
export function phosphorWeights(keep: readonly string[] = STUDIO_ICON_WEIGHTS): Plugin {
  return {
    name: "cloudhal:phosphor-weights",
    enforce: "pre",
    transform(code, id) {
      if (!DEFS.test(id)) return undefined;
      const out = keepWeights(code, keep);
      return out === code ? undefined : { code: out, map: null };
    },
  };
}
