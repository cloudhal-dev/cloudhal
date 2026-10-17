/** Props, data sources and button actions of surface components (RFC-0020 §3, RFC-0022). */
import { type PropsIssue, validateProps } from "../../blocks.ts";
import { parseFilter } from "../../filter.ts";
import { checkDynamic, isDynamic } from "../bindings/values.ts";
import type { CatalogEntry } from "../catalog/index.ts";
import { isObj, SURFACE_LIMITS } from "../shared.ts";

export const ACTION_NEEDS: Record<string, readonly string[]> = {
  set: ["path", "value"],
  toggle: ["path"],
  increment: ["path"],
  reset: [],
  navigate: ["href"],
  copy: ["value"],
  share: [],
  scrollTo: ["anchor"],
  append: ["path", "value"],
  open: ["target"],
  close: [],
};

export function checkAction(a: Record<string, unknown>, path: string, out: PropsIssue[]): void {
  for (const key of ACTION_NEEDS[String(a.action)] ?? [])
    if (a[key] === undefined)
      out.push({ path: `${path}/${key}`, message: `${a.action} needs ${key}` });
  // RFC-0022: `set` and `append` may write a computed value (worked out when clicked).
  if ((a.action === "set" || a.action === "append") && isObj(a.value))
    checkDynamic(a.value, `${path}/value`, out);
  if (a.action === "append" && typeof a.value === "string" && a.value.length > 20)
    out.push({ path: `${path}/value`, message: "at most 20 characters at a time" });
}

export interface SurfaceCheck {
  /** Problems that make the surface invalid (paths are JSON Pointers into the section). */
  issues: PropsIssue[];
  /** Ids of components whose `component` the catalog does not have: kept, flagged, not rendered. */
  unknown: string[];
  /** Ids no path from `root` reaches (still arriving while streaming): kept, not rendered. */
  unreachable: string[];
}

export const SOURCE_SORT = new Set(["newest", "oldest", "title"]);
export const COLLECTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkData(data: unknown, out: PropsIssue[]): void {
  if (data === undefined) return;
  if (!isObj(data)) {
    out.push({ path: "/data", message: "an object" });
    return;
  }
  const size = new TextEncoder().encode(JSON.stringify(data)).length;
  if (size > SURFACE_LIMITS.dataBytes)
    out.push({ path: "/data", message: `at most ${SURFACE_LIMITS.dataBytes} bytes of JSON` });
  for (const [key, value] of Object.entries(data)) {
    if (!isObj(value) || !("$source" in value)) continue;
    const at = `/data/${key}`;
    if (value.$source !== "entries") {
      out.push({ path: `${at}/$source`, message: "entries" });
      continue;
    }
    const q = value.query;
    if (!isObj(q) || Object.keys(value).some((k) => k !== "$source" && k !== "query")) {
      out.push({
        path: at,
        message: "{ $source: entries, query: { collection, filter?, sort?, limit } }",
      });
      continue;
    }
    for (const k of Object.keys(q))
      if (!["collection", "filter", "sort", "limit"].includes(k))
        out.push({ path: `${at}/query/${k}`, message: "not a query field" });
    if (typeof q.collection !== "string" || !COLLECTION.test(q.collection))
      out.push({ path: `${at}/query/collection`, message: "a collection slug, such as posts" });
    if (q.filter !== undefined)
      try {
        if (typeof q.filter !== "string" || q.filter.length > 512) throw new Error("too long");
        parseFilter(q.filter);
      } catch (e) {
        out.push({
          path: `${at}/query/filter`,
          message: `not a valid filter (${(e as Error).message})`,
        });
      }
    if (q.sort !== undefined && !SOURCE_SORT.has(q.sort as string))
      out.push({ path: `${at}/query/sort`, message: "newest, oldest or title" });
    if (
      typeof q.limit !== "number" ||
      !Number.isInteger(q.limit) ||
      q.limit < 1 ||
      q.limit > SURFACE_LIMITS.sourceLimit
    )
      out.push({
        path: `${at}/query/limit`,
        message: `a whole number from 1 to ${SURFACE_LIMITS.sourceLimit}`,
      });
  }
}

/** Props problems with bindings allowed: bound props are checked as bindings, the rest as values. */
export function checkProps(
  entry: CatalogEntry,
  props: unknown,
  path: string,
  out: PropsIssue[],
): void {
  if (entry.kind === "block" && !entry.type.where.includes("section")) {
    out.push({ path, message: `${entry.name} is a body block, not a surface component` });
    return;
  }
  const given = isObj(props) ? props : props === undefined ? {} : props;
  if (!isObj(given)) {
    out.push({ path, message: "an object" });
    return;
  }
  const literal: Record<string, unknown> = {};
  const bound = new Set<string>();
  for (const [k, v] of Object.entries(given)) {
    if (isDynamic(v) && k in entry.schema.properties) {
      bound.add(k);
      checkDynamic(v, `${path}/${k}`, out);
    } else if (k === "onClick" && isObj(v) && isDynamic(v.value)) {
      // RFC-0022: an action's computed value is checked by `checkAction`, not as text.
      const { value: _computed, ...rest } = v;
      literal[k] = rest;
    } else literal[k] = v;
  }
  for (const issue of validateProps(entry.schema, literal)) {
    const key = issue.path.split("/")[0] ?? "";
    if (bound.has(key) && issue.message === "required") continue;
    out.push({ path: issue.path ? `${path}/${issue.path}` : path, message: issue.message });
  }
}
