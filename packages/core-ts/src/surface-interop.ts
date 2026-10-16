/**
 * Surface interop (RFC-0020 §9, phase 20f): other generative-UI formats in and out.
 *
 * - **A2UI v0.9** (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`, the
 *   basic catalog): an A2A or AG-UI agent's messages become a Cloudhal surface, and a surface
 *   becomes messages A2UI renderers draw.
 * - **json-render** specs (`root` + `elements`, `$state` bindings, visibility conditions).
 *
 * Conversions are deterministic and never silent: whatever has no equivalent (server events,
 * text fields, external image URLs, unknown functions…) is left out and named in `notes`, so the
 * agent or person can decide. The result is an ordinary surface that the store then checks like
 * any other; nothing here bypasses `checkSurface`. Worker-safe: pure functions.
 */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";

export const A2UI_VERSION = "v0.9";
export const A2UI_BASIC_CATALOG = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";

/** A converted surface and what the conversion could not carry over. */
export interface InteropResult {
  surface: SurfaceSection;
  notes: string[];
}

type Json = Record<string, unknown>;
type Props = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[a-z][a-z0-9-]{0,40}$/;
const MAX_COMPONENTS = 200;
/** Template lists expand to at most this many items on import. */
const MAX_REPEAT = 50;

/** Notes, each said once. */
class Notes {
  readonly #seen = new Set<string>();
  readonly list: string[] = [];
  add(note: string): void {
    if (this.#seen.has(note)) return;
    this.#seen.add(note);
    this.list.push(note);
  }
}

/** Ids that fit Cloudhal's pattern, unique, stable for the same input. */
class Ids {
  readonly #map = new Map<string, string>();
  readonly #taken = new Set<string>();
  get(raw: string): string {
    const known = this.#map.get(raw);
    if (known) return known;
    let base =
      raw === "root"
        ? "root"
        : raw
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^[^a-z]+/, "")
            .replace(/-+$/, "")
            .slice(0, 36) || "c";
    if (!ID.test(base)) base = `c-${base}`.slice(0, 36);
    let id = base;
    for (let n = 2; this.#taken.has(id); n++) id = `${base}-${n}`;
    this.#taken.add(id);
    this.#map.set(raw, id);
    return id;
  }
  /** A fresh id derived from `base` (for components a conversion adds). */
  fresh(base: string): string {
    return this.get(`${base}\u0000${this.#taken.size}`);
  }
}

function pointerGet(data: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return data;
  let cur = data;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(cur)) cur = /^\d+$/.test(seg) ? cur[Number(seg)] : undefined;
    else if (isObj(cur) && Object.hasOwn(cur, seg)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

function pointerSet(data: Json, pointer: string, value: unknown): Json {
  if (pointer === "" || pointer === "/") return isObj(value) ? structuredClone(value) : {};
  const segs = pointer
    .replace(/^\//, "")
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (segs.some((s) => s === "__proto__" || s === "prototype" || s === "constructor")) return data;
  const out = structuredClone(data);
  let cur: Json | unknown[] = out;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i] as string;
    const next: unknown = Array.isArray(cur) ? cur[Number(s)] : cur[s];
    const container: Json | unknown[] =
      isObj(next) || Array.isArray(next) ? next : /^\d+$/.test(segs[i + 1] ?? "") ? [] : {};
    if (Array.isArray(cur)) cur[Number(s)] = container;
    else cur[s] = container;
    cur = container;
  }
  const last = segs.at(-1) as string;
  if (value === undefined) {
    if (Array.isArray(cur)) cur.splice(Number(last), 1);
    else delete cur[last];
  } else if (Array.isArray(cur)) cur[Number(last)] = value;
  else cur[last] = value;
  return out;
}

// ── A2UI → Cloudhal ─────────────────────────────────────────────────────────────────────────

interface A2uiState {
  catalogId?: string | undefined;
  components: Map<string, Json>;
  data: Json;
  deleted: boolean;
}

/** The A2UI messages of one surface, applied in order. */
function collectA2ui(
  messages: readonly unknown[],
  surfaceId: string | undefined,
  notes: Notes,
): { id: string; state: A2uiState } {
  const surfaces = new Map<string, A2uiState>();
  const order: string[] = [];
  const stateOf = (id: string) => {
    let s = surfaces.get(id);
    if (!s) {
      s = { components: new Map(), data: {}, deleted: false };
      surfaces.set(id, s);
      order.push(id);
    }
    return s;
  };
  for (const [i, m] of messages.entries()) {
    if (!isObj(m)) throw new InteropError(`message ${i} is not an object`);
    if (m.version !== undefined && m.version !== A2UI_VERSION)
      notes.add(`message ${i} is A2UI ${String(m.version)}; read as ${A2UI_VERSION}`);
    const body = (m.createSurface ?? m.updateComponents ?? m.updateDataModel ?? m.deleteSurface) as
      | Json
      | undefined;
    if (!isObj(body) || typeof body.surfaceId !== "string") {
      notes.add(`message ${i} is not an A2UI server message; left out`);
      continue;
    }
    if (surfaceId && body.surfaceId !== surfaceId) continue;
    const s = stateOf(body.surfaceId);
    if (m.createSurface) {
      s.catalogId = typeof body.catalogId === "string" ? body.catalogId : undefined;
      s.deleted = false;
    } else if (m.updateComponents) {
      for (const c of Array.isArray(body.components) ? body.components : [])
        if (isObj(c) && typeof c.id === "string" && typeof c.component === "string")
          s.components.set(c.id, c);
    } else if (m.updateDataModel) {
      const path = typeof body.path === "string" ? body.path : "/";
      s.data = pointerSet(s.data, path, body.value);
    } else if (m.deleteSurface) {
      s.deleted = true;
      s.components.clear();
      s.data = {};
    }
  }
  const id = surfaceId ?? order.find((k) => !surfaces.get(k)?.deleted);
  const state = id ? surfaces.get(id) : undefined;
  if (!id || !state || state.deleted) throw new InteropError("no A2UI surface in these messages");
  if (order.length > 1 && !surfaceId)
    notes.add(
      `the messages hold ${order.length} surfaces; converted "${id}" (pass surfaceId for another)`,
    );
  return { id, state };
}

const A2UI_JUSTIFY: Record<string, string> = {
  start: "start",
  center: "center",
  end: "end",
  spaceBetween: "between",
  spaceAround: "between",
  spaceEvenly: "between",
  stretch: "start",
};

/** A2UI dynamic values → Cloudhal values (`{path}` the same; known functions renamed). */
function a2uiValue(v: unknown, scope: string | undefined, notes: Notes): unknown {
  if (!isObj(v)) return v;
  if (typeof v.path === "string") {
    const path = v.path.startsWith("/") ? v.path : scope ? `${scope}/${v.path}` : `/${v.path}`;
    return { path };
  }
  if (typeof v.call === "string") {
    const args = isObj(v.args) ? v.args : {};
    const a = (k: string) => a2uiValue(args[k], scope, notes);
    switch (v.call) {
      case "formatNumber":
        return {
          call: "formatNumber",
          args: {
            value: a("value"),
            ...(args.decimals !== undefined ? { digits: a("decimals") } : {}),
          },
        };
      case "formatCurrency":
        return { call: "formatCurrency", args: { value: a("value"), currency: a("currency") } };
      case "formatDate":
        if (args.format !== undefined)
          notes.add("formatDate patterns become the medium date style");
        return { call: "formatDate", args: { value: a("value"), style: "medium" } };
      case "pluralize":
        return {
          call: "pluralize",
          args: { count: a("value"), one: a("one"), other: a("other") },
        };
      case "required":
      case "email":
        return { call: v.call, args: { value: a("value") } };
      case "length":
        if (args.min !== undefined && args.max === undefined)
          return { call: "minLength", args: { value: a("value"), min: args.min } };
        if (args.max !== undefined && args.min === undefined)
          return { call: "maxLength", args: { value: a("value"), max: args.max } };
        return { call: "length", args: { value: a("value") } };
      case "formatString":
        return formatString(args.value, scope, notes);
    }
    notes.add(`the A2UI function "${v.call}" has no Cloudhal equivalent; its value was left out`);
    return undefined;
  }
  return v;
}

/** `"Hi ${/user/name}!"` → `concat` of text and paths; nested function calls are not carried. */
function formatString(template: unknown, scope: string | undefined, notes: Notes): unknown {
  if (typeof template !== "string") return a2uiValue(template, scope, notes);
  const parts: unknown[] = [];
  let rest = template;
  let complex = false;
  while (rest.length > 0) {
    const at = rest.indexOf("${");
    if (at < 0) {
      parts.push(rest);
      break;
    }
    if (at > 0) parts.push(rest.slice(0, at));
    const end = rest.indexOf("}", at);
    if (end < 0) {
      parts.push(rest.slice(at));
      break;
    }
    const expr = rest.slice(at + 2, end).trim();
    if (/^\/?[\w~/.-]+$/.test(expr) && !expr.includes("("))
      parts.push(a2uiValue({ path: expr }, scope, notes));
    else complex = true;
    rest = rest.slice(end + 1);
  }
  if (complex) notes.add("formatString expressions with functions are not carried; only paths are");
  const kept = parts.filter((p) => p !== "");
  if (kept.every((p) => typeof p === "string")) return kept.join("");
  return { call: "concat", args: { parts: kept } };
}

/** A literal string for a prop that must be one (labels), resolved from the data if bound. */
function literal(v: unknown, data: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (isObj(v) && typeof v.path === "string") {
    const got = pointerGet(data, v.path.startsWith("/") ? v.path : `/${v.path}`);
    return typeof got === "string" || typeof got === "number" ? String(got) : undefined;
  }
  return undefined;
}

/**
 * A2UI v0.9 messages → a Cloudhal surface. The messages are applied in order (later components
 * replace earlier ones with the same id; data model updates merge), then the basic catalog maps
 * onto Cloudhal's primitives. Components of other catalogs keep their name and props when the
 * site's catalog has them (the store decides).
 */
export function fromA2ui(
  messages: readonly unknown[],
  options: { sectionId: string; catalog: string; surfaceId?: string },
): InteropResult {
  const notes = new Notes();
  const { state } = collectA2ui(messages, options.surfaceId, notes);
  if (state.catalogId && state.catalogId !== A2UI_BASIC_CATALOG)
    notes.add(`the surface uses the catalog ${state.catalogId}; its components were kept by name`);
  const source = state.components;
  if (!source.has("root")) throw new InteropError('the A2UI surface has no "root" component');
  const ids = new Ids();
  const out = new Map<string, SurfaceComponent>();
  let data: Json = structuredClone(state.data);
  /** Ids consumed as a button's label (not drawn on their own). */
  const consumed = new Set<string>();

  const convert = (
    rawId: string,
    scope: string | undefined,
    suffix: string,
    trail: Set<string>,
  ): string | undefined => {
    const a = source.get(rawId);
    if (!a) {
      notes.add(`a component refers to "${rawId}", which the messages never sent`);
      return undefined;
    }
    if (trail.has(rawId)) return undefined;
    const nextTrail = new Set(trail).add(rawId);
    const id = ids.get(`${rawId}${suffix}`);
    if (out.has(id)) return id;
    if (out.size >= MAX_COMPONENTS) {
      notes.add(`the surface was cut at ${MAX_COMPONENTS} components`);
      return undefined;
    }
    const v = (k: string) => a2uiValue(a[k], scope, notes);
    const kids = (list: unknown): string[] => {
      if (Array.isArray(list))
        return list.flatMap((c) =>
          typeof c === "string" ? (convert(c, scope, suffix, nextTrail) ?? []) : [],
        );
      if (isObj(list) && typeof list.path === "string" && typeof list.componentId === "string") {
        // A template list: expanded once from the data the messages carried.
        const path = list.path.startsWith("/") ? list.path : `${scope ?? ""}/${list.path}`;
        const items = pointerGet(data, path);
        if (!Array.isArray(items)) {
          notes.add(`the list at ${path} had no data to expand; it is empty`);
          return [];
        }
        if (items.length > MAX_REPEAT)
          notes.add(`the list at ${path} was cut at ${MAX_REPEAT} items`);
        notes.add(
          "template lists were expanded from the data at import; new items need another import",
        );
        return items
          .slice(0, MAX_REPEAT)
          .flatMap(
            (_, i) =>
              convert(list.componentId as string, `${path}/${i}`, `${suffix}-${i}`, nextTrail) ??
              [],
          );
      }
      if (typeof list === "string")
        return convert(list, scope, suffix, nextTrail) ? [ids.get(`${list}${suffix}`)] : [];
      return [];
    };
    let component: string;
    let props: Props = {};
    let children: string[] | undefined;
    switch (a.component) {
      case "Text": {
        const variant = typeof a.variant === "string" ? a.variant : "body";
        const level = /^h([1-5])$/.exec(variant);
        if (level) {
          component = "Heading";
          props = { text: v("text"), level: Math.min(4, Number(level[1])) };
        } else {
          component = "Text";
          props = { text: v("text"), ...(variant === "caption" ? { size: "s", muted: true } : {}) };
        }
        break;
      }
      case "Row":
      case "Column":
      case "List": {
        const horizontal = a.component === "Row" || a.direction === "horizontal";
        component = horizontal ? "Row" : "Stack";
        const justify = typeof a.justify === "string" ? A2UI_JUSTIFY[a.justify] : undefined;
        const align =
          typeof a.align === "string" && ["start", "center", "end", "stretch"].includes(a.align)
            ? a.align
            : undefined;
        props = {
          ...(horizontal ? { wrap: true } : {}),
          ...(horizontal && justify ? { justify } : {}),
          ...(align ? { align } : {}),
        };
        children = kids(a.children);
        break;
      }
      case "Card":
        component = "Card";
        children = kids(a.child);
        break;
      case "Divider":
        component = "Divider";
        break;
      case "Tabs": {
        component = "Tabs";
        children = (Array.isArray(a.tabs) ? a.tabs : []).flatMap((t, i) => {
          if (!isObj(t) || typeof t.child !== "string") return [];
          const panel = ids.fresh(`${id}-tab-${i}`);
          const inner = convert(t.child, scope, suffix, nextTrail);
          out.set(panel, {
            id: panel,
            component: "TabPanel",
            props: { label: literal(t.title, data) ?? `Tab ${i + 1}` },
            ...(inner ? { children: [inner] } : {}),
          });
          return [panel];
        });
        break;
      }
      case "Modal": {
        component = "Disclosure";
        const trigger = typeof a.trigger === "string" ? source.get(a.trigger) : undefined;
        const summary =
          (trigger &&
            literal(
              trigger.component === "Button"
                ? source.get(String(trigger.child))?.text
                : trigger.text,
              data,
            )) ??
          "More";
        if (typeof a.trigger === "string") consumed.add(a.trigger);
        props = { summary };
        children = kids(a.content);
        notes.add("a Modal becomes a Disclosure that opens in place");
        break;
      }
      case "Button": {
        component = "Button";
        const child = typeof a.child === "string" ? source.get(a.child) : undefined;
        const text = child?.component === "Text" ? literal(child.text, data) : undefined;
        if (typeof a.child === "string" && child?.component === "Text") consumed.add(a.child);
        props = {
          label: text ?? "Open",
          variant:
            a.variant === "primary"
              ? "primary"
              : a.variant === "borderless"
                ? "ghost"
                : "secondary",
        };
        if (!text)
          notes.add("a button whose child is not plain text was given a placeholder label");
        const action = isObj(a.action) ? a.action : {};
        const call = isObj(action.functionCall) ? action.functionCall : undefined;
        if (call?.call === "openUrl" && isObj(call.args) && typeof call.args.url === "string")
          props.href = call.args.url;
        else if (action.event !== undefined)
          notes.add(
            "button events go to an A2UI agent's server; Cloudhal surfaces have no server actions, so they were left out",
          );
        break;
      }
      case "ChoicePicker": {
        const options = (Array.isArray(a.options) ? a.options : [])
          .map((o) => (isObj(o) ? literal(o.value, data) : undefined))
          .filter((o): o is string => typeof o === "string" && o.length > 0);
        component =
          a.variant === "mutuallyExclusive" && options.length >= 2 && options.length <= 8
            ? "Toggle"
            : "Select";
        if (a.variant === "multipleSelection")
          notes.add("multiple-choice pickers become single choices");
        const value = v("value");
        if (isObj(value) && typeof value.path === "string") {
          const got = pointerGet(data, value.path);
          if (Array.isArray(got))
            data = pointerSet(
              data,
              value.path,
              typeof got[0] === "string" ? got[0] : (options[0] ?? ""),
            );
        }
        props = {
          options,
          value: isObj(value) ? value : (options[0] ?? ""),
          ...(literal(a.label, data)
            ? { label: literal(a.label, data) }
            : component === "Select"
              ? { label: "Choose" }
              : {}),
        };
        break;
      }
      case "Slider":
        component = "Slider";
        props = {
          label: literal(a.label, data) ?? "Value",
          min: typeof a.min === "number" ? a.min : 0,
          max: typeof a.max === "number" ? a.max : 100,
          value: v("value"),
        };
        break;
      // RFC-0022 §2: text and check inputs are local state, like a slider.
      case "TextField":
      case "CheckBox": {
        const kind = String(a.variant ?? a.textFieldType ?? "shortText");
        if (a.component === "TextField" && (kind === "obscured" || kind === "date")) {
          notes.add(
            `${kind === "obscured" ? "password" : "date"} text fields were left out: Cloudhal has no such input`,
          );
          return undefined;
        }
        const bound = v(
          a.component === "CheckBox" ? "value" : a.value !== undefined ? "value" : "text",
        );
        // A literal value becomes the surface's data, so the input can write to it.
        let path = isObj(bound) && typeof bound.path === "string" ? bound.path : undefined;
        if (!path) {
          path = `/${id.replace(/[^a-z0-9-]/g, "-")}`;
          data = pointerSet(
            data,
            path,
            a.component === "CheckBox" ? bound === true : typeof bound === "string" ? bound : "",
          );
        }
        const labelText = literal(a.label, data) ?? (a.component === "CheckBox" ? "Yes" : "Value");
        if (a.component === "CheckBox") {
          component = "Checkbox";
          props = { label: labelText, checked: { path } };
        } else {
          component = kind === "number" ? "NumberField" : "TextField";
          props = { label: labelText, value: { path } };
          if (kind === "longText") notes.add("long text fields become one-line text fields");
          if (a.validationRegexp !== undefined)
            notes.add("text field patterns (validationRegexp) are not carried");
        }
        break;
      }
      case "Image":
      case "Icon":
      case "Video":
      case "AudioPlayer":
      case "DateTimeInput": {
        const why: Record<string, string> = {
          Image:
            "images come from the site's media library, not URLs; upload them and add an Image",
          Icon: "Cloudhal has no icon component yet",
          Video: "videos are embedded with the video block, not URLs",
          AudioPlayer: "Cloudhal has no audio component",
          DateTimeInput: "Cloudhal has no date input yet",
        };
        notes.add(`${a.component} components were left out: ${why[a.component]}`);
        return undefined;
      }
      default: {
        // Another catalog's component: name and flat props kept; the store checks them.
        component = String(a.component);
        const {
          id: _i,
          component: _c,
          child,
          children: list,
          weight: _w,
          accessibility: _a,
          ...rest
        } = a;
        props = Object.fromEntries(
          Object.entries(rest).map(([k, x]) => [k, a2uiValue(x, scope, notes)]),
        );
        const kidList = list ?? child;
        if (kidList !== undefined) children = kids(kidList);
      }
    }
    if (a.weight !== undefined || a.accessibility !== undefined)
      notes.add("A2UI weight and accessibility hints are not carried");
    const clean = Object.fromEntries(Object.entries(props).filter(([, x]) => x !== undefined));
    out.set(id, {
      id,
      component,
      ...(Object.keys(clean).length ? { props: clean } : {}),
      ...(children?.length ? { children } : {}),
    });
    return id;
  };

  const root = convert("root", undefined, "", new Set());
  if (!root) throw new InteropError("the A2UI root component has no Cloudhal equivalent");
  for (const id of consumed) {
    const converted = ids.get(id);
    // A label child that nothing else drew was folded into its button.
    if (out.has(converted) && ![...out.values()].some((c) => c.children?.includes(converted)))
      out.delete(converted);
  }
  // Root first, then the tree in reading order (children were converted before their parents).
  const ordered: SurfaceComponent[] = [];
  const visit = (id: string) => {
    const c = out.get(id);
    if (!c || ordered.includes(c)) return;
    ordered.push(c);
    for (const k of c.children ?? []) visit(k);
  };
  visit(root);
  for (const c of out.values()) if (!ordered.includes(c)) ordered.push(c);
  return {
    surface: {
      id: options.sectionId,
      kind: "surface",
      catalog: options.catalog,
      components: ordered as SurfaceSection["components"],
      ...(Object.keys(data).length ? { data } : {}),
    },
    notes: notes.list,
  };
}

// ── Cloudhal → A2UI ─────────────────────────────────────────────────────────────────────────

/** Cloudhal values → A2UI dynamic values. */
function toA2uiValue(v: unknown, notes: Notes): unknown {
  if (!isObj(v)) return v;
  if (typeof v.path === "string" && Object.keys(v).length === 1) return { path: v.path };
  if (typeof v.call === "string") {
    const args = isObj(v.args) ? v.args : {};
    const a = (k: string) => toA2uiValue(args[k], notes);
    switch (v.call) {
      case "formatNumber":
        return {
          call: "formatNumber",
          args: {
            value: a("value"),
            ...(args.digits !== undefined ? { decimals: a("digits") } : {}),
          },
          returnType: "string",
        };
      case "formatCurrency":
        return {
          call: "formatCurrency",
          args: { value: a("value"), currency: a("currency") },
          returnType: "string",
        };
      case "formatDate":
        return {
          call: "formatDate",
          args: { value: a("value"), format: "yMMMd" },
          returnType: "string",
        };
      case "pluralize":
        return {
          call: "pluralize",
          args: { value: a("count"), one: a("one"), other: a("other") },
          returnType: "string",
        };
      case "concat": {
        const parts = Array.isArray(args.parts) ? args.parts : [];
        const template = parts
          .map((p) =>
            isObj(p) && typeof p.path === "string"
              ? `\${${p.path}}`
              : typeof p === "string"
                ? p.replaceAll("${", "\\${")
                : "",
          )
          .join("");
        if (parts.some((p) => isObj(p) && typeof p.call === "string"))
          notes.add("concat parts that call functions are left out of formatString");
        return { call: "formatString", args: { value: template }, returnType: "string" };
      }
      case "required":
      case "email":
        return { call: v.call, args: { value: a("value") }, returnType: "boolean" };
      case "length":
        return { call: "length", args: { value: a("value"), min: 0 }, returnType: "boolean" };
      case "minLength":
        return {
          call: "length",
          args: { value: a("value"), min: args.min },
          returnType: "boolean",
        };
      case "maxLength":
        return {
          call: "length",
          args: { value: a("value"), max: args.max },
          returnType: "boolean",
        };
      case "range":
        return {
          call: "numeric",
          args: { value: a("value"), min: args.min, max: args.max },
          returnType: "boolean",
        };
    }
  }
  return v;
}

const A2UI_JUSTIFY_OUT: Record<string, string> = {
  start: "start",
  center: "center",
  end: "end",
  between: "spaceBetween",
};

/**
 * A Cloudhal surface → A2UI v0.9 messages for the basic catalog: `createSurface`,
 * `updateComponents` and, with data, `updateDataModel`. `assetUrl` turns `asset:` references into
 * URLs a renderer can load; without it images are left out.
 */
export function toA2ui(
  surface: Pick<SurfaceSection, "id" | "components" | "data">,
  options: { surfaceId?: string; assetUrl?: (ref: string) => string | undefined } = {},
): { messages: Json[]; notes: string[] } {
  const notes = new Notes();
  const surfaceId = options.surfaceId ?? surface.id;
  const byId = new Map(surface.components.map((c) => [c.id, c]));
  const out: Json[] = [];
  const v = (x: unknown) => toA2uiValue(x, notes);
  /** One child id for components that hold one: the child itself, or a Column around several. */
  const single = (c: SurfaceComponent, kids: string[]): string | undefined => {
    if (kids.length <= 1) return kids[0];
    const wrap = `${c.id}-body`;
    out.push({ id: wrap, component: "Column", children: kids });
    return wrap;
  };
  const kept = (ids: readonly string[] | undefined) =>
    (ids ?? []).filter((k) => byId.has(k) && !dropped.has(k));
  const dropped = new Set<string>();
  for (const c of surface.components) {
    if (c.component === "Spacer") dropped.add(c.id);
    if (c.component === "Image" && !options.assetUrl?.(String(c.props?.asset ?? "")))
      dropped.add(c.id);
  }
  for (const c of surface.components) {
    if (dropped.has(c.id)) continue;
    const p = (c.props ?? {}) as Props;
    const kids = kept(c.children);
    if (c.visible !== undefined)
      notes.add("visibility conditions have no A2UI equivalent; those components always show");
    const text = (id: string, value: unknown, variant?: string) =>
      out.push({ id, component: "Text", text: v(value), ...(variant ? { variant } : {}) });
    switch (c.component) {
      case "Stack":
      case "Band":
      case "Accordion":
        out.push({
          id: c.id,
          component: "Column",
          children: kids,
          ...(typeof p.align === "string" ? { align: p.align } : {}),
        });
        if (c.component === "Band") notes.add("band tones and widths have no A2UI equivalent");
        break;
      case "Row":
      case "Grid":
      case "Columns":
        out.push({
          id: c.id,
          component: "Row",
          children: kids,
          ...(typeof p.justify === "string" && A2UI_JUSTIFY_OUT[p.justify]
            ? { justify: A2UI_JUSTIFY_OUT[p.justify] }
            : {}),
          ...(typeof p.align === "string" ? { align: p.align } : {}),
        });
        if (c.component !== "Row") notes.add("grids and column ratios become rows");
        break;
      case "Card": {
        const child = single(c, kids);
        if (child) out.push({ id: c.id, component: "Card", child });
        else dropped.add(c.id);
        break;
      }
      case "Divider":
        out.push({ id: c.id, component: "Divider" });
        break;
      case "Heading":
        text(c.id, p.text, `h${Math.min(5, Math.max(1, Number(p.level ?? 2)))}`);
        break;
      case "Text":
        text(c.id, p.text, p.muted || p.size === "s" ? "caption" : "body");
        break;
      case "Markdown":
        text(c.id, p.content, "body");
        break;
      case "Badge":
        text(c.id, p.label, "caption");
        break;
      case "Image":
        out.push({
          id: c.id,
          component: "Image",
          url: options.assetUrl?.(String(p.asset)),
          ...(typeof p.alt === "string" && p.alt ? { description: p.alt } : {}),
        });
        break;
      case "Button":
      case "Link": {
        const label = `${c.id}-label`;
        text(label, p.label);
        const click = isObj(p.onClick) ? p.onClick : undefined;
        const url =
          typeof p.href === "string"
            ? p.href
            : click?.action === "navigate"
              ? click.href
              : undefined;
        out.push({
          id: c.id,
          component: "Button",
          child: label,
          variant:
            c.component === "Link" || p.variant === "ghost"
              ? "borderless"
              : p.variant === "primary"
                ? "primary"
                : "default",
          action:
            typeof url === "string"
              ? { functionCall: { call: "openUrl", args: { url } } }
              : {
                  event: {
                    name: typeof click?.action === "string" ? click.action : "press",
                    context: click?.path ? { path: { path: click.path } } : {},
                  },
                },
        });
        if (click && click.action !== "navigate")
          notes.add(
            "button actions become A2UI events named after the action; the receiving agent decides what they do",
          );
        break;
      }
      case "Stat": {
        const parts = [`${c.id}-value`, `${c.id}-label`, ...(p.detail ? [`${c.id}-detail`] : [])];
        text(parts[0] as string, p.value, "h2");
        text(parts[1] as string, p.label, "caption");
        if (p.detail) text(parts[2] as string, p.detail, "caption");
        out.push({ id: c.id, component: "Column", children: parts });
        break;
      }
      case "Quote": {
        const parts = [`${c.id}-text`, ...(p.cite ? [`${c.id}-cite`] : [])];
        text(parts[0] as string, typeof p.text === "string" ? `“${p.text}”` : p.text, "body");
        if (p.cite)
          text(parts[1] as string, [p.cite, p.role].filter(Boolean).join(", "), "caption");
        out.push({ id: c.id, component: "Column", children: parts });
        break;
      }
      case "List": {
        const items = (Array.isArray(p.items) ? p.items : []).map((item, i) => {
          const id = `${c.id}-item-${i}`;
          text(id, p.ordered ? `${i + 1}. ${String(item)}` : `• ${String(item)}`, "body");
          return id;
        });
        out.push({ id: c.id, component: "List", children: items, direction: "vertical" });
        break;
      }
      case "Toggle":
      case "Select":
        out.push({
          id: c.id,
          component: "ChoicePicker",
          variant: "mutuallyExclusive",
          ...(p.label ? { label: v(p.label) } : {}),
          options: (Array.isArray(p.options) ? p.options : []).map((o) => ({
            label: String(o),
            value: String(o),
          })),
          value: v(p.value),
        });
        notes.add("choices bind a single string; A2UI pickers bind a list of strings");
        break;
      case "NumberField":
      case "TextField":
        out.push({
          id: c.id,
          component: "TextField",
          label: v(p.label),
          variant: c.component === "NumberField" ? "number" : "shortText",
          value: v(p.value),
        });
        break;
      case "Checkbox":
        out.push({ id: c.id, component: "CheckBox", label: v(p.label), value: v(p.checked) });
        break;
      case "RadioGroup":
        out.push({
          id: c.id,
          component: "ChoicePicker",
          variant: "mutuallyExclusive",
          label: v(p.label),
          options: (Array.isArray(p.options) ? p.options : []).map((o) =>
            isObj(o)
              ? { label: String(o.label), value: String(o.value) }
              : { label: "", value: "" },
          ),
          value: v(p.value),
        });
        notes.add("choices bind a single string; A2UI pickers bind a list of strings");
        break;
      case "Slider":
        out.push({
          id: c.id,
          component: "Slider",
          label: v(p.label),
          min: p.min,
          max: p.max,
          value: v(p.value),
        });
        break;
      case "Tabs":
        out.push({
          id: c.id,
          component: "Tabs",
          tabs: kids.flatMap((k) => {
            const panel = byId.get(k);
            if (panel?.component !== "TabPanel") return [];
            return [{ title: v(panel.props?.label), child: k }];
          }),
        });
        break;
      case "TabPanel":
        out.push({ id: c.id, component: "Column", children: kids });
        break;
      case "Disclosure": {
        const summary = `${c.id}-summary`;
        text(summary, p.summary, "h4");
        out.push({ id: c.id, component: "Column", children: [summary, ...kids] });
        notes.add("disclosures become a heading and their content, always open");
        break;
      }
      default:
        out.push({
          id: c.id,
          component: c.component,
          ...Object.fromEntries(Object.entries(p).map(([k, x]) => [k, v(x)])),
          ...(kids.length ? { children: kids } : {}),
        });
        notes.add(
          `"${c.component}" is not in A2UI's basic catalog; it was exported by name for a renderer that knows it`,
        );
    }
  }
  if ([...dropped].some((id) => byId.get(id)?.component === "Image"))
    notes.add("images were left out: pass assetUrl to export them as URLs");
  // Children that pointed at dropped components are removed.
  for (const c of out)
    if (Array.isArray(c.children))
      c.children = (c.children as string[]).filter((k) => !dropped.has(k));
  const messages: Json[] = [
    { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: A2UI_BASIC_CATALOG } },
    { version: A2UI_VERSION, updateComponents: { surfaceId, components: out } },
  ];
  if (surface.data && Object.keys(surface.data).length)
    messages.push({
      version: A2UI_VERSION,
      updateDataModel: { surfaceId, path: "/", value: surface.data },
    });
  return { messages, notes: notes.list };
}

// ── json-render ─────────────────────────────────────────────────────────────────────────────

/** json-render dynamic values → Cloudhal (`{$state}` → `{path}`). */
function fromJrValue(v: unknown, notes: Notes): unknown {
  if (Array.isArray(v)) return v.map((x) => fromJrValue(x, notes));
  if (!isObj(v)) return v;
  if (typeof v.$state === "string" && Object.keys(v).length === 1) return { path: v.$state };
  if ("$item" in v || "$index" in v) {
    notes.add("$item and $index (repeat) are not carried");
    return undefined;
  }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJrValue(x, notes)]));
}

/** A json-render visibility condition → a Cloudhal condition (gte/lte since RFC-0022). */
function fromJrCondition(c: unknown, notes: Notes): unknown {
  if (c === true || c === undefined) return undefined;
  if (c === false) return { eq: [1, 2] };
  if (Array.isArray(c)) {
    const all = c.map((x) => fromJrCondition(x, notes)).filter((x) => x !== undefined);
    return all.length > 1 ? { and: all } : all[0];
  }
  if (!isObj(c)) return undefined;
  if (Array.isArray(c.$or))
    return { or: c.$or.map((x) => fromJrCondition(x, notes) ?? { eq: [1, 1] }) };
  if (Array.isArray(c.$and)) return fromJrCondition(c.$and, notes);
  if (typeof c.$state !== "string") {
    notes.add("visibility on $item or $index is not carried");
    return undefined;
  }
  const subject = { path: c.$state };
  const other = (x: unknown) => (isObj(x) && typeof x.$state === "string" ? { path: x.$state } : x);
  let cond: unknown = subject;
  if ("eq" in c) cond = { eq: [subject, other(c.eq)] };
  else if ("neq" in c) cond = { ne: [subject, other(c.neq)] };
  else if ("gt" in c) cond = { gt: [subject, other(c.gt)] };
  else if ("gte" in c) cond = { gte: [subject, other(c.gte)] };
  else if ("lt" in c) cond = { lt: [subject, other(c.lt)] };
  else if ("lte" in c) cond = { lte: [subject, other(c.lte)] };
  return c.not === true ? { not: cond } : cond;
}

/**
 * A json-render spec → a Cloudhal surface. json-render catalogs are the app's own, so element
 * types keep their names: write specs against Cloudhal's catalog (`get_catalog`) and they
 * convert one to one. A top-level `state` becomes the data model.
 */
export function fromJsonRender(
  spec: unknown,
  options: { sectionId: string; catalog: string },
): InteropResult {
  if (!isObj(spec) || typeof spec.root !== "string" || !isObj(spec.elements))
    throw new InteropError("a json-render spec has a root key and an elements map");
  const notes = new Notes();
  const elements = spec.elements as Record<string, unknown>;
  const ids = new Ids();
  ids.get("root");
  const idOf = (key: string) =>
    key === spec.root ? "root" : ids.get(key === "root" ? "root-element" : key);
  const out: SurfaceComponent[] = [];
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key) || out.length >= MAX_COMPONENTS) return;
    seen.add(key);
    const el = elements[key];
    if (!isObj(el) || typeof el.type !== "string") {
      notes.add(`the element "${key}" is missing or has no type`);
      return;
    }
    const kids = [...(Array.isArray(el.children) ? el.children : [])];
    if (isObj(el.slots)) {
      for (const list of Object.values(el.slots)) if (Array.isArray(list)) kids.push(...list);
      notes.add("named slots were appended to children");
    }
    if (el.repeat !== undefined) notes.add("repeat is not carried; the element renders once");
    if (el.on !== undefined)
      notes.add("json-render actions (on) are not carried; use Button onClick");
    const childIds = kids.filter((k): k is string => typeof k === "string" && isObj(elements[k]));
    const props = isObj(el.props) ? (fromJrValue(el.props, notes) as Props) : {};
    const visible = fromJrCondition(el.visible, notes);
    out.push({
      id: idOf(key),
      component: el.type,
      ...(Object.keys(props).length ? { props } : {}),
      ...(childIds.length ? { children: childIds.map(idOf) } : {}),
      ...(isObj(visible) ? { visible } : {}),
    });
    for (const k of childIds) walk(k);
  };
  walk(spec.root);
  if (out.length >= MAX_COMPONENTS)
    notes.add(`the surface was cut at ${MAX_COMPONENTS} components`);
  const state = isObj(spec.state) ? spec.state : undefined;
  return {
    surface: {
      id: options.sectionId,
      kind: "surface",
      catalog: options.catalog,
      components: out as SurfaceSection["components"],
      ...(state ? { data: structuredClone(state) } : {}),
    },
    notes: notes.list,
  };
}

/** Cloudhal values → json-render (`{path}` → `{$state}`). */
function toJrValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toJrValue);
  if (!isObj(v)) return v;
  if (typeof v.path === "string" && Object.keys(v).length === 1) return { $state: v.path };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJrValue(x)]));
}

function toJrCondition(c: unknown, notes: Notes): unknown {
  if (!isObj(c)) return undefined;
  if (typeof c.path === "string") return { $state: c.path };
  const pair = (x: unknown) =>
    Array.isArray(x) && isObj(x[0]) && typeof x[0].path === "string" ? x : undefined;
  const side = (x: unknown) => (isObj(x) && typeof x.path === "string" ? { $state: x.path } : x);
  for (const [op, jr] of [
    ["eq", "eq"],
    ["ne", "neq"],
    ["gt", "gt"],
    ["lt", "lt"],
  ] as const) {
    const p = pair(c[op]);
    if (p) return { $state: (p[0] as Json).path, [jr]: side(p[1]) };
  }
  if (Array.isArray(c.and)) return c.and.map((x) => toJrCondition(x, notes));
  if (Array.isArray(c.or)) return { $or: c.or.map((x) => toJrCondition(x, notes)) };
  if (c.not !== undefined) {
    const inner = toJrCondition(c.not, notes);
    if (isObj(inner) && typeof inner.$state === "string") return { ...inner, not: true };
  }
  notes.add("a visibility condition json-render cannot express was left out");
  return undefined;
}

/** A Cloudhal surface → a json-render spec (`root`, `elements`, and the data as `state`). */
export function toJsonRender(surface: Pick<SurfaceSection, "components" | "data">): {
  spec: Json;
  notes: string[];
} {
  const notes = new Notes();
  const elements: Record<string, Json> = {};
  for (const c of surface.components) {
    const visible = c.visible !== undefined ? toJrCondition(c.visible, notes) : undefined;
    elements[c.id] = {
      type: c.component,
      props: toJrValue(c.props ?? {}),
      children: c.children ?? [],
      ...(visible !== undefined ? { visible } : {}),
    };
  }
  return {
    spec: {
      root: "root",
      elements,
      ...(surface.data ? { state: structuredClone(surface.data) } : {}),
    },
    notes: notes.list,
  };
}

/** A document that cannot be converted at all (not a wrong prop: those are notes or store issues). */
export class InteropError extends Error {
  override readonly name = "InteropError";
}
