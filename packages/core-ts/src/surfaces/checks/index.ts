/** Checking a surface (RFC-0020 §3): the graph, each component, then rules across them. */
import type { Section, SurfaceSection } from "@cloudhal/core-contracts";
import type { PropsIssue } from "../../blocks.ts";
import { countCalls } from "../bindings/values.ts";
import type { Catalog } from "../catalog/index.ts";
import { isObj, SURFACE_LIMITS } from "../shared.ts";
import { checkCarousels } from "./carousel.ts";
import { checkComponent } from "./component.ts";
import { indexComponents, linkChildren, unreachableFrom } from "./graph.ts";
import { checkData, type SurfaceCheck } from "./props.ts";
import { checkImages, checkMorphsAmbientsSteps, checkOverlays } from "./rules.ts";

export type { SurfaceCheck } from "./props.ts";

export function checkSurface(surface: SurfaceSection, catalog: Catalog): SurfaceCheck {
  const issues: PropsIssue[] = [];
  const unknown: string[] = [];
  const components = surface.components ?? [];
  if (components.length > SURFACE_LIMITS.components)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.components} components`,
    });
  const calls = countCalls(components.map((c) => [c.props, c.visible]));
  if (calls > SURFACE_LIMITS.callsPerSurface)
    issues.push({
      path: "/components",
      message: `at most ${SURFACE_LIMITS.callsPerSurface} function calls (this surface has ${calls})`,
    });
  const g = indexComponents(components, issues);
  components.forEach((c, i) => {
    const at = `/components/${i}`;
    const entry = catalog.get(c.component);
    if (!entry) unknown.push(c.id);
    linkChildren(g, c, at);
    if (entry) checkComponent(g, c, entry, at);
  });
  checkOverlays(g);
  checkImages(g);
  checkCarousels(g);
  checkMorphsAmbientsSteps(g);
  const unreachable = unreachableFrom(g, SURFACE_LIMITS.depth);
  checkData(surface.data, issues);
  return { issues, unknown, unreachable };
}

/** Problems with every surface on a page, paths prefixed with the section's place. */
export function checkPageSurfaces(sections: readonly Section[], catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const surfaces = sections.filter((s): s is SurfaceSection => s.kind === "surface");
  if (surfaces.length > SURFACE_LIMITS.surfacesPerPage)
    out.push({
      path: "/sections",
      message: `at most ${SURFACE_LIMITS.surfacesPerPage} surfaces per page`,
    });
  sections.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const issue of checkSurface(s, catalog).issues)
      out.push({ path: `/sections/${i}${issue.path}`, message: issue.message });
  });
  // RFC-0027 27d: one thing turning on its own per page, at most.
  let playing = 0;
  sections.forEach((s, i) => {
    if (s.kind !== "surface") return;
    s.components.forEach((c, j) => {
      const auto = c.component === "Carousel" && isObj(c.props) ? c.props.autoplay : undefined;
      if (auto === undefined || auto === "off") return;
      if (++playing > 1)
        out.push({
          path: `/sections/${i}/components/${j}/props/autoplay`,
          message: "one carousel per page may play on its own",
        });
    });
  });
  return out;
}
