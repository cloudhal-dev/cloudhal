/** RFC-0026: the curated set, its generated data and the inline markup. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { iconsData } from "../scripts/gen-icons.ts";
import { ICON_GROUPS, ICON_NAMES, isIconName, renderIcon } from "../src/icons.ts";

describe("icons (RFC-0026)", () => {
  it("keeps the generated data in step with the list and the sources", () => {
    expect(
      readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/generated/icons-data.ts"),
        "utf8",
      ),
    ).toBe(iconsData());
  });

  it("names every SocialLink network and groups every name once", () => {
    const grouped = Object.values(ICON_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...ICON_NAMES].sort());
    expect(ICON_GROUPS.social).toEqual([
      "x",
      "bluesky",
      "mastodon",
      "github",
      "linkedin",
      "instagram",
      "facebook",
      "youtube",
      "tiktok",
      "threads",
      "rss",
      "email",
    ]);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(ICON_NAMES.length).toBeLessThanOrEqual(120);
  });

  it("draws decorative icons, labelled ones, mirrored arrows, and nothing for unknown names", () => {
    expect(renderIcon("check")).toMatch(
      /^<svg class="ch-icon" data-icon="check" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false"><path d="M/,
    );
    expect(
      renderIcon("warning", { label: 'Careful "here"', className: "big bad<class" }),
    ).toContain(
      'class="ch-icon big" data-icon="warning" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" role="img" aria-label="Careful &quot;here&quot;"',
    );
    expect(renderIcon("arrow-right")).toContain("data-ch-mirror");
    expect(renderIcon("arrow-up")).not.toContain("data-ch-mirror");
    expect(renderIcon("bluesky")).toContain('viewBox="0 0 24 24"');
    expect(renderIcon("bluesky")).not.toContain("<title>");
    expect(renderIcon("<script>")).toBe("");
    expect(isIconName("menu")).toBe(true);
    expect(isIconName("hamburger")).toBe(false);
  });
});
