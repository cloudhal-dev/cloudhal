/** RFC-0025 §3: overlays drawn natively, opened by the browser, and the module that fills gaps. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { OVERLAY_SCRIPT } from "../src/overlay-client.ts";
import { renderSurface } from "../src/surfaces.ts";

const surface = (components: SurfaceComponent[]): SurfaceSection => ({
  id: "sec_overlay001",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
});

describe("overlays (RFC-0025 §3)", () => {
  const html = renderSurface(
    surface([
      {
        id: "root",
        component: "Stack",
        children: ["open", "pop-open", "help", "terms", "pop", "tip"],
      },
      {
        id: "open",
        component: "Button",
        props: { label: "Terms", onClick: { action: "open", target: "terms" } },
      },
      {
        id: "pop-open",
        component: "Button",
        props: { label: "More", onClick: { action: "open", target: "pop" } },
      },
      { id: "help", component: "Link", props: { label: "Pricing", href: "/plans" } },
      {
        id: "terms",
        component: "Dialog",
        props: { title: "Terms <of use>", dismiss: "explicit" },
        children: ["ok"],
      },
      { id: "ok", component: "Button", props: { label: "OK", onClick: { action: "close" } } },
      { id: "pop", component: "Popover", props: { placement: "top" }, children: ["p"] },
      { id: "p", component: "Text", props: { text: "Detail" } },
      { id: "tip", component: "Tooltip", props: { text: "From $9", for: "help" } },
    ]),
  );

  it("opens a dialog with Invoker Commands and closes it from inside, with no interaction runtime", () => {
    const d = "ch-sec_overlay001-terms";
    expect(html).toContain(
      `<button type="button" class="ch-button ch-button--primary" command="show-modal" commandfor="${d}" aria-haspopup="dialog" aria-controls="${d}">Terms</button>`,
    );
    expect(html).toContain(
      `<dialog id="${d}" class="ch-dialog" closedby="none" aria-labelledby="${d}-title"><header class="ch-dialog__head"><h2 class="ch-dialog__title" id="${d}-title">Terms &lt;of use&gt;</h2>`,
    );
    expect(html).toContain(`command="close" commandfor="${d}">OK</button>`);
    expect(html).not.toContain("data-ch-state");
    expect(html).toContain(`<script type="module" src="${OVERLAY_SCRIPT.path}"></script>`);
  });

  it("opens popovers through popovertarget and ties a tooltip to its trigger", () => {
    expect(html).toContain('popovertarget="ch-sec_overlay001-pop">More</button>');
    expect(html).toContain(
      '<div popover="auto" id="ch-sec_overlay001-pop" class="ch-popover" data-placement="top">',
    );
    expect(html).toContain(
      '<a class="ch-link" href="/plans" interestfor="ch-sec_overlay001-tip" aria-describedby="ch-sec_overlay001-tip">Pricing</a>',
    );
    expect(html).toContain(
      '<div popover="hint" id="ch-sec_overlay001-tip" class="ch-tooltip" role="tooltip">From $9</div>',
    );
  });

  it("opens a dialog with a fallback page from a real link", () => {
    const out = renderSurface(
      surface([
        { id: "root", component: "Stack", children: ["open", "terms"] },
        {
          id: "open",
          component: "Button",
          props: { label: "Terms", onClick: { action: "open", target: "terms" } },
        },
        {
          id: "terms",
          component: "Dialog",
          props: { title: "Terms", fallbackHref: "/terms" },
          children: [],
        },
      ]),
    );
    expect(out).toContain(
      '<a class="ch-button ch-button--primary" href="/terms" data-ch-open="ch-sec_overlay001-terms" aria-haspopup="dialog"',
    );
  });

  it("pins the overlay module to its versioned name and keeps its guards", () => {
    // Bump `overlay.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(OVERLAY_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "b93e67159b4c",
    );
    expect(OVERLAY_SCRIPT.path).toBe("/_cloudhal/overlay.1.js");
    expect(gzipSync(OVERLAY_SCRIPT.code).length).toBeLessThan(2 * 1024);
    expect(OVERLAY_SCRIPT.code).not.toMatch(/\beval\b|new Function|innerHTML/);
    // The shim only where the browser lacks Invoker Commands, closedby and interestfor.
    expect(OVERLAY_SCRIPT.code).toContain('!("commandForElement"in B)');
    expect(OVERLAY_SCRIPT.code).toContain('!("closedBy"in D)');
    expect(OVERLAY_SCRIPT.code).toContain('!("interestForElement"in B)');
    // Nothing opens on its own: no showModal outside a click or command handler.
    expect(OVERLAY_SCRIPT.code.match(/showModal\(\)/g)).toHaveLength(3);
  });
});
