/** The surface catalog: the built-in primitives in order, checked once at load, plus the site's block types. */
import {
  type BlockRegistry,
  type BlockType,
  createBlockRegistry,
  defineBlockTypes,
  type PropsSchema,
  sectionSchema,
} from "../../blocks.ts";
import { isObj } from "../shared.ts";
import { CONTENT_PRIMITIVES } from "./primitives-content.ts";
import { INPUT_PRIMITIVES } from "./primitives-inputs.ts";
import { INTERACTIVE_PRIMITIVES } from "./primitives-interactive.ts";
import { LAYOUT_PRIMITIVES } from "./primitives-layout.ts";
import type { PrimitiveType } from "./props.ts";

/** Every built-in primitive, in catalog order. */
export const PRIMITIVES: readonly PrimitiveType[] = [
  ...LAYOUT_PRIMITIVES,
  ...CONTENT_PRIMITIVES,
  ...INPUT_PRIMITIVES,
  ...INTERACTIVE_PRIMITIVES,
];

// Primitive props follow the same subset as block props; checked once at load. Bound example
// values ({path}, as inputs need) are bindings, not literals: left out, and not required.
export const isBoundExample = (v: unknown) => isObj(v) && ("path" in v || "call" in v);
defineBlockTypes(
  PRIMITIVES.map((p) => {
    const bound = Object.keys(p.example.props).filter((k) => isBoundExample(p.example.props[k]));
    return {
      name: p.name.toLowerCase(),
      title: p.title,
      where: ["section"] as const,
      props: {
        ...p.props,
        ...(p.props.required
          ? { required: p.props.required.filter((k) => !bound.includes(k)) }
          : {}),
      },
      example: {
        props: Object.fromEntries(
          Object.entries(p.example.props).filter(([k]) => !bound.includes(k)),
        ),
      },
    };
  }) as BlockType[],
);

// ── the catalog ──────────────────────────────────────────────────────────────────────────────

export type CatalogEntry =
  | { kind: "primitive"; name: string; type: PrimitiveType; schema: PropsSchema }
  | { kind: "block"; name: string; type: BlockType; schema: PropsSchema };

export interface Catalog {
  /** `<theme>@<major>` (RFC-0018). */
  readonly id: string;
  get(name: string): CatalogEntry | undefined;
  /** Every component name, primitives first. */
  names(): string[];
  entries(): CatalogEntry[];
  readonly blocks: BlockRegistry;
}

export interface CatalogOptions {
  /** The theme's name; `Site.theme.name`. */
  readonly name?: string;
  readonly major?: number;
  /** The deployment's block registry (built-ins and the theme's types). */
  readonly blocks?: BlockRegistry;
  /** Primitives the theme does not render (RFC-0018 `catalog`). */
  readonly omit?: readonly string[];
}

/** The catalog surfaces are written for: Cloudhal's primitives plus the registry's section blocks. */
export function createCatalog(options: CatalogOptions = {}): Catalog {
  const blocks = options.blocks ?? createBlockRegistry();
  const omit = new Set(options.omit ?? []);
  const entries: CatalogEntry[] = [
    ...PRIMITIVES.filter((p) => !omit.has(p.name)).map(
      (type): CatalogEntry => ({ kind: "primitive", name: type.name, type, schema: type.props }),
    ),
    ...blocks.list("section").map(
      (type): CatalogEntry => ({
        kind: "block",
        name: type.name,
        type,
        schema: sectionSchema(type),
      }),
    ),
  ];
  const byName = new Map(entries.map((e) => [e.name, e]));
  return {
    id: `${options.name ?? "cloudhal"}@${options.major ?? 1}`,
    get: (name) => byName.get(name),
    names: () => entries.map((e) => e.name),
    entries: () => [...entries],
    blocks,
  };
}

export const childRule = (e: CatalogEntry): PrimitiveType["children"] =>
  e.kind === "primitive" ? e.type.children : "none";
