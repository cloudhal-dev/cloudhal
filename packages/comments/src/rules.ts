/**
 * Content rules (RFC-0007 §6.4) on normalised text:
 *
 * - **Links:** `https?://` or `www.` occurrences. Above the site's `linkLimit` → label `links`;
 *   above 10 → refused (`400 invalid`, "too many links").
 * - **Word lists:** `watchWords` → label `watch-word`; `blockedWords` → status `spam`. Matched on
 *   **whole words** (a list entry of several words matches them in a row) after NFKC and case
 *   folding with the Turkish dotted and dotless i folded together (U+0130 `İ`, `I`, U+0131 `ı`, and `i` + U+0307 → `i`), and
 *   with invisible format characters removed, so "press" does not match "WordPress", "İstanbul"
 *   matches "istanbul", and "fr" + U+200B + "ee" matches "free".
 * - **Instruction-like text:** a small, versioned rule set for text that addresses an AI, in
 *   English and Turkish (label `instruction-like`). It never blocks; it warns people and agents.
 */
import type { CommentLabel } from "@cloudhal/core-contracts";
import { type LabelName, LINK_HARD_LIMIT } from "./model.ts";
import type { FieldProblem } from "./normalize.ts";

/** NFKC, Turkish-aware lower-casing, invisible format characters removed. */
export function foldForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0130I\u0131]/g, "i")
    .toLowerCase()
    .replace(/i\u0307/g, "i")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "");
}

/** `foldForMatch` with diacritics removed too (`ö` → `o`): the instruction rules only. */
export function foldLoose(text: string): string {
  return foldForMatch(text).normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

/** Whole words of a text, folded. */
export function wordTokens(text: string): string[] {
  return foldForMatch(text).match(WORD) ?? [];
}

/** A word list compiled once per settings value. */
export type CompiledWordList = readonly (readonly string[])[];

export function compileWordList(words: readonly string[]): CompiledWordList {
  return words.map((w) => wordTokens(w)).filter((t) => t.length > 0);
}

/** True when any entry's words occur in a row in `tokens`. */
export function matchesWordList(tokens: readonly string[], list: CompiledWordList): boolean {
  for (const entry of list) {
    const first = entry[0];
    for (let i = 0; i + entry.length <= tokens.length; i++) {
      if (tokens[i] !== first) continue;
      let ok = true;
      for (let j = 1; j < entry.length; j++)
        if (tokens[i + j] !== entry[j]) {
          ok = false;
          break;
        }
      if (ok) return true;
    }
  }
  return false;
}

/** `https?://` and `www.` occurrences (§6.4). */
export function countLinks(text: string): number {
  return text.match(/https?:\/\/|www\./gi)?.length ?? 0;
}

/** Version of the instruction-like rule set; bump when it changes (labels are not recomputed). */
export const INSTRUCTION_RULES_VERSION = 1;

/** Cloudhal's MCP tool names: text that names them is talking to an agent. */
export const MCP_TOOL_NAMES = [
  "list_comments",
  "get_comment_thread",
  "comments_summary",
  "label_comments",
  "moderate_comments",
  "draft_comment_reply",
  "set_comment_thread",
  "list_sites",
  "get_site",
  "list_pages",
  "get_page",
  "create_page",
  "update_page",
  "delete_page",
  "list_entries",
  "get_entry",
  "create_entry",
  "update_entry",
  "delete_entry",
  "create_snapshot",
  "list_snapshots",
  "diff_snapshots",
  "preview_page",
] as const;

const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const rule = (source: string) => new RegExp(source, "u");

/**
 * The rules, matched against `foldLoose(text)` (lower case, Turkish i folded, no diacritics), so
 * the Turkish patterns are written without `ı`, `ş`, `ğ`, `ü`, `ö`, `ç`.
 */
export const INSTRUCTION_RULES: readonly { readonly id: string; readonly re: RegExp }[] = [
  // English
  {
    id: "en-ignore-instructions",
    re: rule(
      `${B}(?:ignore|disregard|forget|override|bypass)${E}[^.\\n]{0,40}${B}(?:instructions?|prompts?|rules|guidelines|directives|guardrails)${E}`,
    ),
  },
  { id: "en-system-prompt", re: rule(`${B}system\\s+(?:prompt|message|instructions?)${E}`) },
  { id: "en-you-are-now", re: rule(`${B}you\\s+are\\s+now${E}`) },
  { id: "en-new-instructions", re: rule(`${B}new\\s+(?:instructions?|task|rules)\\s*:`) },
  {
    id: "en-address-ai",
    re: rule(
      `${B}(?:ai|llm|language\\s+model|ai\\s+assistant|assistant|agent|chatgpt|gpt|claude|gemini|copilot)\\s*[:,]\\s*(?:please\\s+)?(?:ignore|approve|publish|delete|execute|run|call|reply|forget)${E}`,
    ),
  },
  {
    id: "en-as-an-ai",
    re: rule(`${B}(?:as|dear)\\s+an?\\s+(?:ai|llm|language\\s+model|assistant)${E}`),
  },
  { id: "en-jailbreak", re: rule(`${B}(?:jailbreak|developer\\s+mode|do\\s+anything\\s+now)${E}`) },
  {
    id: "en-approve-all",
    re: rule(
      `${B}(?:approve|publish|accept)\\s+(?:all|every|each|any)\\s+(?:the\\s+)?(?:pending\\s+)?comments?${E}`,
    ),
  },
  {
    id: "markup-roles",
    re: rule(
      "</?\\s*(?:system|instructions?|reader-text|assistant|user|tool_call|tool_use|function_calls?|im_start|im_end)\\b",
    ),
  },
  { id: "mcp-tool-name", re: rule(`${B}(?:${MCP_TOOL_NAMES.join("|")})${E}`) },
  // Turkish (folded: "önceki talimatları yok say" → "onceki talimatlari yok say")
  {
    id: "tr-ignore-instructions",
    re: rule(
      `${B}(?:talimat|komut|kural|yonerge|yonlendirme)\\w*${E}[^.\\n]{0,30}${B}(?:yok\\s+say|unut|gormezden\\s+gel|dikkate\\s+alma|gecersiz\\s+say)`,
    ),
  },
  {
    id: "tr-system-prompt",
    re: rule(`${B}sistem\\s+(?:istem|komut|prompt|mesaj|talimat)\\w*`),
  },
  { id: "tr-you-are-now", re: rule(`${B}(?:artik|bundan\\s+sonra)\\s+sen\\s+bir${E}`) },
  {
    id: "tr-address-ai",
    re: rule(
      `${B}(?:yapay\\s+zeka|asistan|ajan|bot)\\w*\\s*[:,]\\s*(?:lutfen\\s+)?(?:onayla|yayinla|sil|yok\\s+say|unut|calistir)`,
    ),
  },
  {
    id: "tr-approve-all",
    re: rule(`${B}(?:tum|butun|her)\\s+(?:bekleyen\\s+)?yorum\\w*\\s+(?:onayla|yayinla)`),
  },
  { id: "tr-new-instructions", re: rule(`${B}yeni\\s+(?:talimat|gorev|kural)\\w*\\s*:`) },
];

/** Ids of the instruction rules a text matches (empty when none). */
export function instructionLikeRules(...texts: readonly string[]): string[] {
  const hits: string[] = [];
  for (const t of texts) {
    const folded = foldLoose(t);
    for (const r of INSTRUCTION_RULES)
      if (!hits.includes(r.id) && r.re.test(folded)) hits.push(r.id);
  }
  return hits;
}

export const isInstructionLike = (...texts: readonly string[]): boolean =>
  instructionLikeRules(...texts).length > 0;

export interface ContentRuleSettings {
  readonly linkLimit: number;
  readonly watchWords: CompiledWordList;
  readonly blockedWords: CompiledWordList;
}

export type ContentDecision =
  | {
      readonly ok: true;
      readonly status: "pending" | "spam";
      readonly labels: readonly LabelName[];
    }
  | { readonly ok: false; readonly field: "body"; readonly problem: FieldProblem };

/**
 * Runs the rules on a normalised name and text: refusals a person can fix come back as
 * `ok: false`; otherwise the status (`spam` on a blocked word) and the rule labels.
 */
export function evaluateContent(
  input: { readonly name: string; readonly text: string },
  rules: ContentRuleSettings,
): ContentDecision {
  const links = countLinks(input.text);
  if (links > LINK_HARD_LIMIT) return { ok: false, field: "body", problem: "too_many_links" };
  const labels: LabelName[] = [];
  if (links > rules.linkLimit) labels.push("links");
  const tokens = [...wordTokens(input.name), "\u0000", ...wordTokens(input.text)];
  if (matchesWordList(tokens, rules.watchWords)) labels.push("watch-word");
  if (isInstructionLike(input.name, input.text)) labels.push("instruction-like");
  const spam = matchesWordList(tokens, rules.blockedWords);
  return { ok: true, status: spam ? "spam" : "pending", labels };
}

/** Rule labels as contract labels, stamped `source: "rule"`. */
export function ruleLabels(labels: readonly LabelName[], at: string): CommentLabel[] {
  return labels.map((label) => ({ label, source: "rule", at }));
}
