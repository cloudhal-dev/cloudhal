/**
 * Sight for agents (RFC-0021 §4): renders a page in a real browser at a few widths and returns
 * screenshots plus automatic checks (overflow, alt text, broken images, heading order, contrast,
 * empty sections, tap targets, line length, broken surfaces, blocked scripts, …). The browser is a
 * DevTools socket: local Chrome under Node (`@cloudhal/cli`), Cloudflare Browser Rendering on
 * Workers (`@cloudhal/cloudflare`). One small DevTools client serves both, so there is no browser
 * library to bundle.
 *
 * Worker-safe: no Node imports.
 */

export { base64ToBytes, bytesToBase64, Cdp, cdpSession } from "./render/cdp.ts";
export { RENDER_CHECK_SCRIPT } from "./render/checks/index.ts";
export { RenderLimiter } from "./render/limiter.ts";
export { renderPage } from "./render/page.ts";
export {
  type CdpSocket,
  type PageRenderer,
  RENDER_CHECK_IDS,
  RENDER_MOTIONS,
  RENDER_SCHEMES,
  RENDER_WIDTHS,
  type RenderCheck,
  type RenderCheckId,
  RenderError,
  type RenderMotion,
  type RenderOptions,
  type RenderResult,
  type RenderScheme,
  type RenderSession,
  type RenderShot,
  type RenderTab,
  type RenderWidth,
} from "./render/types.ts";
