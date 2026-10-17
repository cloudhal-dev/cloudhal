/** A surface's components as a graph: by id, each child's parent, and the issues found so far. */
import type { SurfaceComponent } from "@cloudhal/core-contracts";
import type { PropsIssue } from "../../blocks.ts";

export interface SurfaceGraph {
  components: readonly SurfaceComponent[];
  byId: Map<string, { c: SurfaceComponent; i: number }>;
  /** Filled while children are linked: each child belongs to one parent. */
  parentOf: Map<string, string>;
  issues: PropsIssue[];
}

/** A component's children when they are a list (anything else is reported by `indexComponents`). */
export const kidsOf = (c: SurfaceComponent): string[] =>
  Array.isArray(c.children) ? (c.children as string[]) : [];

/** Ids are unique and present, children are lists, and one component is the root. */
export function indexComponents(
  components: readonly SurfaceComponent[],
  issues: PropsIssue[],
): SurfaceGraph {
  const byId = new Map<string, { c: SurfaceComponent; i: number }>();
  components.forEach((c, i) => {
    if (typeof c.id !== "string" || !c.id)
      issues.push({ path: `/components/${i}/id`, message: "every component needs an id" });
    else if (byId.has(c.id))
      issues.push({ path: `/components/${i}/id`, message: `"${c.id}" is used twice` });
    else byId.set(c.id, { c, i });
    if (c.children !== undefined && !Array.isArray(c.children))
      issues.push({
        path: `/components/${i}/children`,
        message: "children is a list of component ids",
      });
  });
  if (!byId.has("root"))
    issues.push({ path: "/components", message: 'one component has id "root"' });
  return { components, byId, parentOf: new Map(), issues };
}

/** Links `c`'s children to it: each exists, is not the root or itself, has one parent, no loop. */
export function linkChildren(g: SurfaceGraph, c: SurfaceComponent, at: string): void {
  kidsOf(c).forEach((child, j) => {
    const target = g.byId.get(child);
    if (!target) g.issues.push({ path: `${at}/children/${j}`, message: `no component "${child}"` });
    else if (child === "root" || child === c.id)
      g.issues.push({ path: `${at}/children/${j}`, message: `"${child}" cannot be a child here` });
    else if (g.parentOf.has(child))
      g.issues.push({
        path: `${at}/children/${j}`,
        message: `"${child}" already belongs to "${g.parentOf.get(child)}"`,
      });
    else if (holds(g, child, c.id))
      g.issues.push({
        path: `${at}/children/${j}`,
        message: `"${child}" already holds "${c.id}"; children cannot loop`,
      });
    else g.parentOf.set(child, c.id);
  });
}

/**
 * Is `ancestor` above `id` in the links made so far? Refusing such a link keeps `parentOf` a
 * forest, so every walk up through parents (overlays, carousel nesting) ends.
 */
function holds(g: SurfaceGraph, ancestor: string, id: string): boolean {
  const seen = new Set<string>();
  for (let p = g.parentOf.get(id); p !== undefined && !seen.has(p); p = g.parentOf.get(p)) {
    if (p === ancestor) return true;
    seen.add(p);
  }
  return false;
}

/**
 * Ids no path from the root reaches, reporting components nested deeper than `maxDepth`;
 * `parentOf` already rules out shared children.
 */
export function unreachableFrom(g: SurfaceGraph, maxDepth: number): string[] {
  const reached = new Set<string>();
  const walk = (id: string, depth: number, trail: Set<string>) => {
    if (trail.has(id)) return;
    reached.add(id);
    if (depth > maxDepth) {
      const i = g.byId.get(id)?.i;
      g.issues.push({ path: `/components/${i}`, message: `nested deeper than ${maxDepth}` });
      return;
    }
    const next = new Set(trail).add(id);
    const node = g.byId.get(id)?.c;
    for (const child of node ? kidsOf(node) : [])
      if (g.byId.has(child)) walk(child, depth + 1, next);
  };
  if (g.byId.has("root")) walk("root", 1, new Set());
  return g.components.map((c) => c.id).filter((id) => !reached.has(id));
}
