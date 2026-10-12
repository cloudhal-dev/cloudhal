import { PageFrameProvider, usePageScrollRootRef } from "@cloudhal/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsLayout, SettingsSection } from "../src/components/Settings.tsx";
import { ThemeSwitch } from "../src/components/ThemeSwitch.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import { setThemePreference, THEME_STORAGE_KEY } from "../src/lib/theme.ts";

describe("ThemeSwitch", () => {
  afterEach(() => {
    cleanup();
    act(() => setThemePreference("system"));
  });

  it("switches between light, dark and the system scheme and remembers the choice", async () => {
    render(
      <I18nProvider initialLocale="en">
        <ThemeSwitch />
      </I18nProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Theme: System" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Dark/ }));
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(await screen.findByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0));

    fireEvent.click(screen.getByRole("button", { name: "Theme: Dark" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /System/ }));
    // "System" follows the OS scheme again and forgets the stored choice.
    const os = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    expect(document.documentElement.dataset.mode).toBe(os);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("speaks the Studio language", () => {
    render(
      <I18nProvider initialLocale="tr">
        <ThemeSwitch />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Tema: Sistem" })).toBeInTheDocument();
  });
});

describe("SettingsLayout table of contents", () => {
  const SECTIONS = [
    { id: "general", label: "General" },
    { id: "domains", label: "Domains" },
    { id: "previews", label: "Preview links" },
  ];
  // Section tops relative to the viewport, as the page scrolls.
  let tops: Record<string, number> = {};
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = tops[this.id] ?? 0;
      return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200 } as DOMRect;
    });
  });

  function renderSettings() {
    render(
      <I18nProvider initialLocale="en">
        <SettingsLayout title="On this page" sections={SECTIONS}>
          {SECTIONS.map((s) => (
            <SettingsSection key={s.id} id={s.id} title={s.label} />
          ))}
        </SettingsLayout>
      </I18nProvider>,
    );
    return within(screen.getByRole("navigation", { name: "On this page" }));
  }
  const scroll = () => act(() => window.dispatchEvent(new Event("scroll")));

  it("follows the section that passed the top bar, and the last one at the end of the page", async () => {
    tops = { general: -400, domains: 40, previews: 600 };
    const toc = renderSettings();
    await waitFor(() =>
      expect(toc.getByRole("link", { name: "Domains" })).toHaveAttribute("aria-current", "true"),
    );
    // Scrolled to the very end: the short last section can't reach the line, but it is current.
    tops = { general: -1400, domains: -900, previews: 300 };
    vi.spyOn(window, "scrollY", "get").mockReturnValue(2000);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
      2000 + window.innerHeight,
    );
    scroll();
    await waitFor(() =>
      expect(toc.getByRole("link", { name: "Preview links" })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });

  it("keeps a clicked section current until the person scrolls again", async () => {
    tops = { general: 0, domains: 400, previews: 800 };
    const toc = renderSettings();
    fireEvent.click(toc.getByRole("link", { name: "Domains" }));
    // The jump's own smooth scroll does not snap the selection back to "General".
    scroll();
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(toc.getByRole("link", { name: "Domains" })).toHaveAttribute("aria-current", "true");
    // A wheel turn hands the selection back to the scroll position.
    act(() => window.dispatchEvent(new Event("wheel")));
    scroll();
    await waitFor(() =>
      expect(toc.getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "true"),
    );
  });

  /** The app shell's content column: the page's scroll root (AppFrame registers it the same way). */
  function Shell({ children }: { children: ReactNode }) {
    return (
      <div id="shell" ref={usePageScrollRootRef()}>
        {children}
      </div>
    );
  }

  it("follows the shell's scrolling column, not the window", async () => {
    // The column starts 100 px down; the line sits 96 px below its top.
    tops = { shell: 100, general: 50, domains: 180, previews: 700 };
    render(
      <I18nProvider initialLocale="en">
        <PageFrameProvider>
          <Shell>
            <SettingsLayout title="On this page" sections={SECTIONS}>
              {SECTIONS.map((s) => (
                <SettingsSection key={s.id} id={s.id} title={s.label} />
              ))}
            </SettingsLayout>
          </Shell>
        </PageFrameProvider>
      </I18nProvider>,
    );
    const toc = within(screen.getByRole("navigation", { name: "On this page" }));
    const shell = document.getElementById("shell") as HTMLElement;
    const geometry = (scrollTop: number) => {
      for (const [key, value] of Object.entries({
        scrollTop,
        clientHeight: 600,
        scrollHeight: 2000,
      }))
        Object.defineProperty(shell, key, { value, configurable: true });
    };
    geometry(300);
    await waitFor(() =>
      expect(toc.getByRole("link", { name: "Domains" })).toHaveAttribute("aria-current", "true"),
    );

    // The window never scrolls in the shell: its events change nothing.
    tops = { shell: 100, general: -900, domains: -500, previews: 150 };
    act(() => window.dispatchEvent(new Event("scroll")));
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(toc.getByRole("link", { name: "Domains" })).toHaveAttribute("aria-current", "true");

    // The column's own scroll moves the selection; at its end the last section is current.
    tops = { shell: 100, general: -1200, domains: -700, previews: 400 };
    geometry(1400);
    act(() => shell.dispatchEvent(new Event("scroll")));
    await waitFor(() =>
      expect(toc.getByRole("link", { name: "Preview links" })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });
});
