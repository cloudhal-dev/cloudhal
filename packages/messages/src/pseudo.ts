/**
 * Pseudo-localization (the i18n review's Phase 5): English messages, compiled, turned into
 * "[Ŝàvé çĥàñĝéé]" — accented, about a third longer and bracketed — with every argument, plural
 * branch and `#` kept. A screen in it shows at a glance what is not in the catalogs (plain
 * English), what is cut off (a missing "]") and what does not leave room for longer languages.
 * Dev and test only: Studio applies it under `import.meta.env.DEV`, and the bundle budget keeps
 * this module out of every production chunk.
 */
import {
  type Compiled,
  isMessage,
  type Message,
  ORDINAL,
  type Part,
  PLURAL,
  SELECT,
} from "./model.ts";

const ACCENTED: Record<string, string> = Object.fromEntries(
  [..."abcdefghijklmnopqrstuvwxyz"]
    .map((c, i) => [c, "àƀçđéƒĝĥíĵķĺɱñóþǫŕšţúṽŵẋýž"[i] as string])
    .concat(
      [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c, i) => [
        c,
        "ÀƁÇĐÉƑĜĤÍĴĶĹṀÑÓÞǪŔŠŢÚṼŴẊÝŽ"[i] as string,
      ]),
    ),
);
const VOWELS = new Set([..."aeiouAEIOU"]);

/** One run of text: accented, its vowels doubled (about +35%, like German or Finnish). */
export function pseudoText(text: string): string {
  let out = "";
  for (const ch of text) {
    const accented = ACCENTED[ch] ?? ch;
    out += VOWELS.has(ch) ? accented + accented : accented;
  }
  return out;
}

function parts(message: Message): Part[] {
  return message.map((p) => {
    if (typeof p === "string") return pseudoText(p);
    if (p[0] === PLURAL || p[0] === ORDINAL || p[0] === SELECT) {
      const cases = Object.fromEntries(Object.entries(p[2]).map(([k, v]) => [k, parts(v)]));
      return [p[0], p[1], cases] as Part;
    }
    return p;
  });
}

/** A compiled message in the pseudo-locale: `{name}` arguments and syntax untouched. */
export function pseudoLocalize(message: Compiled): Compiled {
  if (isMessage(message)) return ["[", ...parts(message), "]"];
  const text = message
    .split(/(\{\w+\})/)
    .map((piece) => (/^\{\w+\}$/.test(piece) ? piece : pseudoText(piece)))
    .join("");
  return `[${text}]`;
}
