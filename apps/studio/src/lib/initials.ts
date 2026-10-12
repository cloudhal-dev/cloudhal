/**
 * The avatar's letters, apart from `account.ts` because the top bar's user menu needs them on every
 * page and the rest of the account helpers load with the Account screen (`bundle-budget.ts`).
 */

/** Up to two letters for the avatar: "Ada Lovelace" → "AL", "ada@x.dev" → "A". */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? [words[0], words[words.length - 1]].map((w) => Array.from(w as string)[0])
      : words.length === 1
        ? [Array.from(words[0] as string)[0]]
        : [Array.from((email ?? "").trim())[0]];
  const text = letters.filter(Boolean).join("");
  return text ? text.toLocaleUpperCase() : "?";
}
