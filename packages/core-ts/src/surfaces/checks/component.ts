/** Rules for one component of a surface: children, props, bindings, motion and per-kind limits. */
import type { SurfaceComponent } from "@cloudhal/core-contracts";
import { checkCondition, isPathValue } from "../bindings/values.ts";
import { type CatalogEntry, childRule } from "../catalog/index.ts";
import { INPUT_MODEL } from "../catalog/props.ts";
import { checkMotion } from "../motion.ts";
import { isObj } from "../shared.ts";
import { kidsOf, type SurfaceGraph } from "./graph.ts";
import { checkAction, checkProps } from "./props.ts";

/** The catalog's child rule, the props, and the bindings the component must have. */
export function checkComponent(
  g: SurfaceGraph,
  c: SurfaceComponent,
  entry: CatalogEntry,
  at: string,
): void {
  const { issues } = g;
  const rule = childRule(entry);
  const kids = kidsOf(c);
  if (rule === "none" && kids.length)
    issues.push({ path: `${at}/children`, message: `${c.component} has no children` });
  else if (Array.isArray(rule))
    kids.forEach((child, j) => {
      const k = g.byId.get(child)?.c.component;
      if (k && !rule.includes(k))
        issues.push({
          path: `${at}/children/${j}`,
          message: `${c.component} holds only ${rule.join(", ")}`,
        });
    });
  checkProps(entry, c.props, `${at}/props`, issues);
  // RFC-0022 §2: a local input writes to the surface's data, so its value is a binding.
  // RFC-0022 §4: so does a table.
  if (c.component === "Table" && !(isObj(c.props) && isPathValue(c.props.rows)))
    issues.push({
      path: `${at}/props/rows`,
      message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
    });
  // RFC-0022 §3: a chart reads its rows from the surface's data.
  if (c.component === "Chart" && !(isObj(c.props) && isPathValue(c.props.data)))
    issues.push({
      path: `${at}/props/data`,
      message: 'bind it to a list in the surface\'s data: {"path":"/rows"}',
    });
  const writes = INPUT_MODEL[c.component];
  if (writes && !(isObj(c.props) && isPathValue(c.props[writes])))
    issues.push({
      path: `${at}/props/${writes}`,
      message: `bind it to the surface's data: {"path":"/…"} (the reader's input is written there)`,
    });
  if (c.component === "Button" && isObj(c.props) && isObj(c.props.onClick))
    checkAction(c.props.onClick, `${at}/props/onClick`, issues);
  if (c.visible !== undefined) checkCondition(c.visible, `${at}/visible`, issues);
  if (c.motion !== undefined) checkMotion(c.motion, c.component, `${at}/motion`, issues);
  checkEffects(g, c, at);
}

/** RFC-0024: ambient presets, marquees, rotating and split text, scroll stories. */
function checkEffects(g: SurfaceGraph, c: SurfaceComponent, at: string): void {
  const { issues } = g;
  // RFC-0024 §4: a particle preset only for particles.
  const amb = isObj(c.props) && isObj(c.props.ambient) ? c.props.ambient : undefined;
  if (amb && amb.preset !== undefined && amb.kind !== "particles")
    issues.push({ path: `${at}/props/ambient/preset`, message: "only with kind particles" });
  // RFC-0024 24c: a marquee needs enough to move; rotating words need words; split text is short.
  if (c.component === "Marquee" && kidsOf(c).length < 3)
    issues.push({ path: `${at}/children`, message: "at least 3 children to scroll" });
  if (
    c.component === "Heading" &&
    isObj(c.props) &&
    c.props.effect === "rotate-words" &&
    !Array.isArray(c.props.words)
  )
    issues.push({
      path: `${at}/props/words`,
      message: "2 to 6 words that take turns where {words} stands",
    });
  if (
    isObj(c.motion) &&
    typeof c.motion.reveal === "string" &&
    c.motion.reveal.startsWith("split-")
  ) {
    const t = isObj(c.props) ? c.props.text : undefined;
    const max = c.motion.reveal === "split-chars" ? 60 : 300;
    if (typeof t !== "string")
      issues.push({
        path: `${at}/motion/reveal`,
        message: "split text needs a written text, not a binding",
      });
    else if (t.length > max)
      issues.push({
        path: `${at}/motion/reveal`,
        message: `split text is at most ${max} characters`,
      });
  }
  // RFC-0024 §3: a scroll story is one sticky child, then 2–12 steps; it writes the step read.
  if (c.component === "Scrolly") checkScrolly(g, c, at);
}

function checkScrolly(g: SurfaceGraph, c: SurfaceComponent, at: string): void {
  const { issues } = g;
  if (!(isObj(c.props) && isPathValue(c.props.step)))
    issues.push({
      path: `${at}/props/step`,
      message:
        'bind it to the surface\'s data: {"path":"/step"} (the step being read is written there)',
    });
  const kids = kidsOf(c).map((k) => g.byId.get(k)?.c.component);
  if (kids.length < 3 || kids.length > 13)
    issues.push({
      path: `${at}/children`,
      message: "one child to keep in view, then 2 to 12 Steps",
    });
  else if (kids[0] === "Step" || kids.slice(1).some((k) => k !== "Step"))
    issues.push({
      path: `${at}/children`,
      message: "the first child stays in view (not a Step); every other child is a Step",
    });
}
