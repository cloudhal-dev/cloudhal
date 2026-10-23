/**
 * The checks, run inside the page (kept as source text: Workers bundlers rename functions, and
 * this must stay self-contained). Returns `PageCheck[]` in `RENDER_CHECK_IDS` order.
 *
 * One async function in the page, assembled from ordered parts that share its locals: the
 * prelude defines the helpers (`add`, `describe`, `visible`, `imgs`, `W`, `H`); the motion part
 * scrolls the page once and defines `frame`, which the navigation and component parts use; the
 * component part ends back at the top. Keep the order.
 */
import { COMPONENT_CHECKS } from "./components.ts";
import { CONTENT_CHECKS } from "./content.ts";
import { CONTRAST_CHECKS } from "./contrast.ts";
import { FONT_CHECKS } from "./fonts.ts";
import { LAYOUT_CHECKS } from "./layout.ts";
import { MOTION_CHECKS } from "./motion.ts";
import { NAVIGATION_CHECKS } from "./navigation.ts";
import { PRELUDE } from "./prelude.ts";
import { SCRIPT_CHECKS } from "./scripts.ts";

export const RENDER_CHECK_SCRIPT = [
  "(async () => {",
  PRELUDE,
  LAYOUT_CHECKS,
  CONTRAST_CHECKS,
  CONTENT_CHECKS,
  FONT_CHECKS,
  SCRIPT_CHECKS,
  MOTION_CHECKS,
  NAVIGATION_CHECKS,
  COMPONENT_CHECKS,
  "  return ids.map((id) => out[id]);",
  "})()",
].join("\n");
