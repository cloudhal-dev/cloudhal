/**
 * The compiled form of a message (RFC-0032 §2): plain data, never code, so catalogs stay object
 * literals that are safe to load anywhere (no `eval`, AGENTS.md hard rule 6). A message that only
 * substitutes `{name}` stays a string; anything else is an array of parts. Catalogs never hold
 * arrays otherwise, so `Array.isArray` tells a compiled message from a nested group of keys.
 *
 * The shape mirrors MessageFormat 2's data model (selectors, variants, placeholders), so a later
 * move to MF2 syntax changes the parser, not this format or the runtime (ADR-0032).
 */
export type Message = readonly Part[];
export type Part = string | Arg;

export const SIMPLE = 0;
export const NUMBER = 1;
export const PLURAL = 2;
export const SELECT = 3;
export const POUND = 4;
export const ORDINAL = 5;

/** The number styles a `{n, number, style}` argument may name. */
export type NumberStyle = "integer" | "percent" | "compact";
/** Variants by key: `=0`, a CLDR category (`one`, `few`, …) or a select value; `other` always. */
export type Cases = Readonly<Record<string, Message>>;

export type Arg =
  | readonly [typeof SIMPLE, string]
  | readonly [typeof NUMBER, string, NumberStyle?]
  | readonly [typeof PLURAL | typeof ORDINAL, string, Cases]
  | readonly [typeof SELECT, string, Cases]
  | readonly [typeof POUND];

/** A catalog value after compilation. */
export type Compiled = string | Message;

export const isMessage = (value: unknown): value is Message => Array.isArray(value);
