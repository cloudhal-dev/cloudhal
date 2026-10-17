/** Deterministic repairs (RFC-0020 §6, step 2): misspelt components and values, motion. */
import type { SurfaceComponent } from "@cloudhal/core-contracts";
import { isIconNameValue, nearestIcon } from "../icon-names.ts";
import type { Catalog } from "./catalog/index.ts";
import { ICON_PROPS } from "./catalog/props.ts";
import { repairMotion } from "./motion.ts";
import { distance, isObj } from "./shared.ts";

// ── repair (RFC-0020 §6, step 2) ─────────────────────────────────────────────────────────────
/** The catalog name a misspelt one most likely means: same letters ignoring case, else ≤ 2 edits. */
export function nearestComponent(name: string, catalog: Catalog): string | undefined {
  if (catalog.get(name)) return name;
  const names = catalog.names();
  const folded = names.find((n) => n.toLowerCase() === name.toLowerCase());
  if (folded) return folded;
  let best: string | undefined;
  let bestD = 3;
  let tie = false;
  for (const n of names) {
    const d = distance(n.toLowerCase(), name.toLowerCase());
    if (d < bestD) {
      best = n;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  return tie ? undefined : best;
}

export const isComponentLike = (v: unknown): v is SurfaceComponent =>
  isObj(v) && typeof v.id === "string" && typeof v.component === "string";

/**
 * Deterministic repairs of one component a model wrote: the nearest catalog name, unknown props
 * dropped, missing required props from the type's example. Every repair is reported.
 */
export function repairComponent(
  c: SurfaceComponent,
  catalog: Catalog,
): { component: SurfaceComponent; notes: string[] } {
  const notes: string[] = [];
  let next: SurfaceComponent = c;
  // One child written as its id instead of a list of one.
  if (typeof (c.children as unknown) === "string") {
    next = { ...next, children: [c.children as unknown as string] };
    notes.push(`${c.id}: children "${c.children}" made a list`);
  }
  if (c.motion !== undefined) {
    const m = repairMotion(c.motion, c.id);
    if (m.notes.length) {
      next = { ...next, motion: m.motion as Record<string, unknown> };
      notes.push(...m.notes);
    }
  }
  const name = nearestComponent(c.component, catalog);
  if (name && name !== c.component) {
    notes.push(`${c.id}: component "${c.component}" → "${name}"`);
    next = { ...next, component: name };
  }
  const entry = catalog.get(next.component);
  if (!entry || (next.props !== undefined && !isObj(next.props))) return { component: next, notes };
  const props: Record<string, unknown> = { ...(next.props ?? {}) };
  let changed = false;
  // RFC-0026: icon names as models write them (`envelope`, `ArrowForward`) in the set's spelling.
  const iconKey = ICON_PROPS[next.component];
  const raw = iconKey ? props[iconKey] : undefined;
  const valid = (v: string) =>
    isIconNameValue(v) || (iconKey === "marker" && (v === "bullet" || v === "none"));
  if (iconKey && typeof raw === "string" && !valid(raw)) {
    const named = nearestIcon(raw);
    if (named) {
      props[iconKey] = named;
      notes.push(`${c.id}: icon "${raw}" → "${named}"`);
    } else if (iconKey !== "name") {
      delete props[iconKey];
      notes.push(`${c.id}: dropped icon "${raw}" (not in the set)`);
    }
    changed = changed || named !== undefined || iconKey !== "name";
  }
  for (const key of Object.keys(props))
    if (!(key in entry.schema.properties)) {
      delete props[key];
      changed = true;
      notes.push(`${c.id}: dropped unknown prop "${key}"`);
    }
  const example = entry.type.example.props as Record<string, unknown>;
  for (const key of entry.schema.required ?? [])
    if (props[key] === undefined && example[key] !== undefined) {
      props[key] = example[key];
      changed = true;
      notes.push(`${c.id}: filled required prop "${key}" from the example`);
    }
  if (changed) next = { ...next, props };
  return { component: next, notes };
}

/** Repairs every component inside a value an operation carries (a component, a list, a surface). */
export function repairValue(value: unknown, catalog: Catalog): { value: unknown; notes: string[] } {
  if (isComponentLike(value)) {
    const r = repairComponent(value, catalog);
    return { value: r.component, notes: r.notes };
  }
  if (Array.isArray(value)) {
    const notes: string[] = [];
    const out = value.map((v) => {
      const r = repairValue(v, catalog);
      notes.push(...r.notes);
      return r.value;
    });
    return { value: out, notes };
  }
  if (isObj(value) && value.kind === "surface" && Array.isArray(value.components)) {
    const r = repairValue(value.components, catalog);
    return { value: { ...value, components: r.value }, notes: r.notes };
  }
  return { value, notes: [] };
}
