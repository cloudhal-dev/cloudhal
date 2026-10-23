/**
 * RFC-0042 §2 "Value conversion": one fixed conversion per source and field type. Values are
 * built as JSON values from typed data, never from strings of JSON: rich text becomes plain text,
 * URLs must be absolute http(s), images resolve through the caller's asset lookup, and select
 * options map through the path's vocabulary (an option outside it emits nothing).
 */
import type {
  ContentEntry,
  FieldDefinition,
  ImageRef,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import { markdownToPlain, offsetMs } from "../fields/conversions.ts";
import type { SiteFields } from "../fields/types.ts";
import { isCalendarDay } from "../fields/value-checks.ts";
import { type PathSpec, vocabularyEntry } from "./table.ts";

export type JsonLdValue = string | number | boolean | JsonLdValue[] | { [k: string]: JsonLdValue };

/** What the builder reads of a site. */
export interface StructuredDataSite extends SiteFields {
  readonly name: string;
  readonly brand?: { readonly logo?: ImageRef | undefined } | undefined;
}

/** What the builder reads of an entry (the entry itself, not its translation group's original). */
export type StructuredDataEntry = Pick<ContentEntry, "collection" | "title" | "body"> &
  Partial<Pick<ContentEntry, "summary" | "coverImage" | "publishedAt" | "updatedAt">>;

/** What only the caller knows: where the site and the entry live, and where assets are served. */
export interface StructuredDataContext {
  /** The site's public origin (`https://example.com`); relative URLs resolve against it. */
  readonly origin: string;
  /** The entry's public URL (absolute, or a path on `origin`). */
  readonly entryUrl?: string | undefined;
  /** An image's absolute URL: an image field's asset id, a cover image or the site logo. */
  readonly imageUrl?:
    | ((image: { assetId?: string; src?: string }) => string | undefined)
    | undefined;
}

/** One value source and the path it fills. */
export interface ConvertInput {
  readonly spec: PathSpec;
  readonly site: StructuredDataSite;
  readonly entry: StructuredDataEntry;
  readonly ctx: StructuredDataContext;
}

/** An absolute http(s) URL, or `undefined` for anything else (`javascript:`, `data:`, `mailto:`). */
export function absoluteHttpUrl(href: string, origin: string): string | undefined {
  try {
    const url = new URL(href, origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

/** An instant shown with `zone`'s offset at that instant (`2026-11-05T19:30:00+03:00`). */
export function withOffset(at: string, zone: string): string | undefined {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return undefined;
  let offset: number;
  try {
    offset = Math.round(offsetMs(zone, ms) / 60_000);
  } catch {
    offset = 0;
  }
  const d = new Date(Math.floor(ms / 1000) * 1000 + offset * 60_000);
  const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const sign = offset < 0 ? "-" : "+";
  return `${date}T${time}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

/** The words of an entry body: Markdown through `markdownToPlain`, HTML without its tags. */
export function bodyText(body: ContentEntry["body"]): string {
  if (body.format === "markdown") return markdownToPlain(body.value, true);
  return body.value
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const nonEmpty = (s: string | undefined): string | undefined => (s?.trim() ? s.trim() : undefined);

/** Markdown paragraphs: blank lines and list items start a new one; soft breaks join. */
function paragraphs(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = markdownToPlain(current.join("\n"), false);
    if (text) out.push(text);
    current = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) flush();
    else {
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) flush();
      current.push(line);
    }
  }
  flush();
  return out;
}

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const steps = (texts: string[]): JsonLdValue | undefined =>
  texts.length > 0 ? texts.map((text) => ({ "@type": "HowToStep", text })) : undefined;

function fromVocabulary(spec: PathSpec, raw: unknown): JsonLdValue | undefined {
  if (!spec.vocabulary) return undefined;
  const one = (v: unknown) =>
    typeof v === "string" && spec.vocabulary
      ? vocabularyEntry(spec.vocabulary, v)?.value
      : undefined;
  if (!Array.isArray(raw)) return one(raw);
  const all = raw.map(one).filter((v): v is string => v !== undefined);
  return all.length > 0 ? all : undefined;
}

type FieldStep = (
  value: unknown,
  def: FieldDefinition,
  input: ConvertInput,
) => JsonLdValue | undefined;

const str = (v: unknown): string | undefined => (typeof v === "string" ? nonEmpty(v) : undefined);

/** One conversion per field type; the path's kind decides inside it. */
const FIELD: Record<FieldDefinition["type"], FieldStep> = {
  text(value, _def, { spec }) {
    const s = str(value);
    if (s === undefined) return undefined;
    if (spec.kind === "lines") return lines(s).length > 0 ? lines(s) : undefined;
    if (spec.kind === "steps") return steps(lines(s));
    if (spec.kind === "currency") return /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : undefined;
    return s;
  },
  richText(value, _def, { spec }) {
    const s = str(value);
    if (s === undefined) return undefined;
    if (spec.kind === "steps") return steps(paragraphs(s));
    return nonEmpty(markdownToPlain(s, true));
  },
  number(value, _def, { spec }) {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    if (spec.kind === "duration")
      return Number.isInteger(value) && value >= 0 ? `PT${value}M` : undefined;
    if (spec.kind === "text") return String(value);
    return value;
  },
  boolean(value, _def, { spec }) {
    if (spec.kind === "boolean") return value === true;
    if (spec.vocabulary === "jobLocationType") return value === true ? "TELECOMMUTE" : undefined;
    return undefined;
  },
  date(value) {
    return typeof value === "string" && isCalendarDay(value) ? value : undefined;
  },
  datetime(value) {
    const v = value as { at?: unknown; timeZone?: unknown } | null;
    if (!v || typeof v.at !== "string") return undefined;
    return withOffset(v.at, typeof v.timeZone === "string" ? v.timeZone : "UTC");
  },
  url(value, _def, { ctx }) {
    const s = str(value);
    return s === undefined ? undefined : absoluteHttpUrl(s, ctx.origin);
  },
  image(value, _def, { ctx }) {
    const id = str(value);
    return id === undefined ? undefined : imageUrl({ assetId: id }, ctx);
  },
  select(value, _def, { spec }) {
    return fromVocabulary(spec, value);
  },
};

function imageUrl(image: { assetId?: string; src?: string }, ctx: StructuredDataContext) {
  const resolved = ctx.imageUrl?.(image) ?? image.src;
  return resolved === undefined ? undefined : absoluteHttpUrl(resolved, ctx.origin);
}

function imageRef(ref: ImageRef | undefined, ctx: StructuredDataContext) {
  if (!ref) return undefined;
  return imageUrl({ ...(ref.assetId ? { assetId: ref.assetId } : {}), src: ref.src }, ctx);
}

function fromEntry(property: string, { spec, entry, ctx }: ConvertInput): JsonLdValue | undefined {
  switch (property) {
    case "title":
      return nonEmpty(entry.title);
    case "summary":
      return nonEmpty(entry.summary);
    case "body":
      return nonEmpty(bodyText(entry.body));
    case "coverImage":
      return imageRef(entry.coverImage, ctx);
    case "url":
      return ctx.entryUrl === undefined ? undefined : absoluteHttpUrl(ctx.entryUrl, ctx.origin);
    case "publishedAt":
    case "updatedAt":
      return spec.kind === "date" ? entry[property] : undefined;
    default:
      return undefined;
  }
}

function fromSite(property: string, { site, ctx }: ConvertInput): JsonLdValue | undefined {
  if (property === "name") return nonEmpty(site.name);
  if (property === "url") return absoluteHttpUrl("/", ctx.origin);
  if (property === "logo") return imageRef(site.brand?.logo, ctx);
  return undefined;
}

function fromConstant(value: string, spec: PathSpec): JsonLdValue | undefined {
  if (spec.vocabulary) return fromVocabulary(spec, value);
  if (spec.kind === "currency") return /^[A-Z]{3}$/.test(value) ? value : undefined;
  return nonEmpty(value);
}

/**
 * The JSON-LD value of one source for one path, or `undefined` (no value, a value that does not
 * convert, an unsafe URL, an option outside the vocabulary). `field` is the resolved field.
 */
export function sourceValue(
  source: StructuredDataSource,
  field: { def: FieldDefinition; value: unknown } | undefined,
  input: ConvertInput,
): JsonLdValue | undefined {
  switch (source.kind) {
    case "field":
      return field && field.value !== undefined
        ? FIELD[field.def.type](field.value, field.def, input)
        : undefined;
    case "entry":
      return fromEntry(source.property, input);
    case "site":
      return fromSite(source.property, input);
    case "constant":
      return fromConstant(source.value, input.spec);
    default:
      return undefined;
  }
}
