/**
 * Pure notification helpers (ADR-0016 addendum "told before it ends"): polling cadence, what is
 * new, what "Extend" sends, the words, and the per-browser memory that never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "../src/i18n/index.tsx";
import { modeRules } from "../src/lib/agents.ts";
import {
  ApiRequestError,
  type ElevationEndingNotification,
  type ElevationRequestNotification,
} from "../src/lib/api.ts";
import {
  BROWSER_PREF_STORAGE_KEY,
  browserPermission,
  canExtend,
  endingParams,
  endsWithin,
  extendMinutes,
  extendTargetOf,
  extendTargetOfKey,
  extensionInput,
  freshNotifications,
  liveNotifications,
  NOTIFICATIONS_FAST_POLL_MS,
  NOTIFICATIONS_POLL_MS,
  notificationHref,
  notificationsPollInterval,
  readBrowserPreference,
  readShownIds,
  rememberShownIds,
  requestParams,
  SHOWN_STORAGE_KEY,
  shouldRaiseBrowserNotification,
  writeBrowserPreference,
} from "../src/lib/notifications.ts";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();
const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate("en", key, params);

const ending = (over: Partial<ElevationEndingNotification> = {}): ElevationEndingNotification => ({
  id: `elevation-ending:key_desk:${inMinutes(8)}`,
  kind: "elevation-ending",
  keyId: "key_desk",
  keyName: "Desk",
  mode: "auto",
  from: "edits",
  until: inMinutes(8),
  minutesLeft: 8,
  ...over,
});
const asking = (
  over: Partial<ElevationRequestNotification> = {},
): ElevationRequestNotification => ({
  id: "elevation-request:appr_1",
  kind: "elevation-request",
  approvalId: "appr_1",
  siteId: "site_1",
  agent: { kind: "agent", id: "agent_planner", name: "Planner" },
  keyId: "key_plan",
  mode: "edits",
  minutes: 30,
  reason: "Draft the launch post",
  createdAt: inMinutes(-2),
  expiresAt: inMinutes(60 * 24),
  ...over,
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("polling cadence", () => {
  it("polls every minute, every 15 s while an elevation ends, never after a 404", () => {
    expect(notificationsPollInterval(undefined, null)).toBe(NOTIFICATIONS_POLL_MS);
    expect(notificationsPollInterval({ items: [asking()], noticeMinutes: 10 }, null)).toBe(60_000);
    expect(notificationsPollInterval({ items: [ending()], noticeMinutes: 10 }, null)).toBe(
      NOTIFICATIONS_FAST_POLL_MS,
    );
    const notFound = new ApiRequestError(404, { error: "not_found", message: "nope" });
    expect(notificationsPollInterval(undefined, notFound)).toBe(false);
    // Other errors keep polling: the next answer may well be fine.
    const down = new ApiRequestError(502, { error: "bad_gateway", message: "down" });
    expect(notificationsPollInterval(undefined, down)).toBe(60_000);
  });
});

describe("which items count", () => {
  it("drops ended elevations and expired requests before the server confirms it", () => {
    const over = ending({ id: "elevation-ending:key_old:x", until: inMinutes(-1) });
    const expired = asking({ id: "elevation-request:appr_old", expiresAt: inMinutes(-5) });
    expect(liveNotifications([ending(), over, asking(), expired], NOW).map((i) => i.id)).toEqual([
      ending().id,
      asking().id,
    ]);
    expect(liveNotifications(undefined, NOW)).toEqual([]);
  });

  it("finds ids not shown before, in the server's order", () => {
    const shown = new Set([ending().id]);
    expect(freshNotifications([ending(), asking()], shown)).toEqual([asking()]);
    expect(freshNotifications([ending()], shown)).toEqual([]);
  });

  it("knows when an elevation is inside the notice window", () => {
    expect(endsWithin(inMinutes(8), 10, NOW)).toBe(true);
    expect(endsWithin(inMinutes(10), 10, NOW)).toBe(true);
    expect(endsWithin(inMinutes(11), 10, NOW)).toBe(false);
    expect(endsWithin(inMinutes(-1), 10, NOW)).toBe(false);
  });

  it("leads to Agents or to the site's Approvals", () => {
    expect(notificationHref(ending())).toBe("/agents");
    expect(notificationHref(asking())).toBe("/sites/site_1/approvals");
  });
});

describe("extending", () => {
  const bounds = modeRules().elevation;

  it("re-posts the mode in force for the preset, kept within the server's bounds", () => {
    const target = extendTargetOf(ending());
    expect(target).toEqual({
      keyId: "key_desk",
      name: "Desk",
      mode: "auto",
      from: "edits",
      until: inMinutes(8),
    });
    expect(extensionInput(target as NonNullable<typeof target>, 60, bounds)).toEqual({
      mode: "auto",
      minutes: 60,
    });
    expect(extendMinutes(240, bounds)).toBe(240);
    expect(extendMinutes(2, bounds)).toBe(5);
    expect(extendMinutes(5000, bounds)).toBe(1440);
    expect(extendMinutes(30, { minMinutes: 60, maxMinutes: 120 })).toBe(60);
  });

  it("never targets a mode a key cannot hold, nor an elevation that is over", () => {
    expect(extendTargetOf(ending({ mode: "bypass" }))).toBeUndefined();
    expect(canExtend({ until: inMinutes(1) }, NOW)).toBe(true);
    expect(canExtend({ until: inMinutes(0) }, NOW)).toBe(false);
  });

  it("reads the target of a key in the Agents list only while its elevation is in force", () => {
    const key = {
      id: "key_desk",
      name: "Desk",
      start: null,
      scopes: [],
      mode: "edits" as const,
      createdAt: inMinutes(-60),
      expiresAt: null,
      enabled: true,
      elevation: { mode: "auto" as const, until: inMinutes(8), grantedBy: "u", grantedAt: "" },
    };
    expect(extendTargetOfKey(key, NOW)).toMatchObject({ keyId: "key_desk", mode: "auto" });
    expect(extendTargetOfKey({ ...key, elevation: undefined }, NOW)).toBeUndefined();
    expect(extendTargetOfKey(key, NOW + 9 * 60_000)).toBeUndefined();
  });
});

describe("words", () => {
  it("fills the ending sentence and the request title", () => {
    const p = endingParams(t, "en", ending(), NOW);
    expect(p).toMatchObject({ name: "Desk", mode: "Auto", from: "Edits", left: "8 min" });
    expect(t("notifications.ending.sentence", p)).toMatch(
      /^Desk's Auto mode ends in 8 min \(.+\), then back to Edits\.$/,
    );
    expect(
      t(
        "notifications.request.title",
        requestParams(t, asking(), (m) => `${m} min`),
      ),
    ).toBe("Planner asks for Edits · 30 min");
    // An unnamed key and an agent without a name still read naturally.
    expect(endingParams(t, "en", ending({ keyName: null }), NOW).name).toBe(t("agents.unnamed"));
    expect(
      requestParams(t, asking({ agent: { kind: "agent", id: "agent_x" } }), String).agent,
    ).toBe("agent_x");
  });
});

describe("per-browser memory", () => {
  it("remembers shown ids across reads, newest last, capped", () => {
    rememberShownIds(["a", "b"]);
    rememberShownIds(["a", "c"]);
    expect([...readShownIds()]).toEqual(["b", "a", "c"]);
    rememberShownIds(Array.from({ length: 250 }, (_, i) => `id_${i}`));
    const all = readShownIds();
    expect(all.size).toBe(200);
    expect(all.has("id_249")).toBe(true);
    expect(all.has("a")).toBe(false);
  });

  it("never throws when storage is unavailable or holds junk", () => {
    localStorage.setItem(SHOWN_STORAGE_KEY, "{not json");
    expect(readShownIds().size).toBe(0);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readShownIds().size).toBe(0);
    expect(() => rememberShownIds(["x"])).not.toThrow();
    expect(readBrowserPreference()).toBe(false);
    expect(() => writeBrowserPreference(true)).not.toThrow();
  });

  it("stores the browser-notification opt-in", () => {
    expect(readBrowserPreference()).toBe(false);
    writeBrowserPreference(true);
    expect(localStorage.getItem(BROWSER_PREF_STORAGE_KEY)).toBe("on");
    expect(readBrowserPreference()).toBe(true);
    writeBrowserPreference(false);
    expect(localStorage.getItem(BROWSER_PREF_STORAGE_KEY)).toBeNull();
  });
});

describe("browser notifications", () => {
  it("are raised only when opted in, allowed, and Studio is not on screen", () => {
    const yes = { enabled: true, permission: "granted" as const, visibility: "hidden" as const };
    expect(shouldRaiseBrowserNotification(yes)).toBe(true);
    expect(shouldRaiseBrowserNotification({ ...yes, visibility: "visible" })).toBe(false);
    expect(shouldRaiseBrowserNotification({ ...yes, enabled: false })).toBe(false);
    expect(shouldRaiseBrowserNotification({ ...yes, permission: "default" })).toBe(false);
    expect(shouldRaiseBrowserNotification({ ...yes, permission: "denied" })).toBe(false);
    expect(shouldRaiseBrowserNotification({ ...yes, permission: "unsupported" })).toBe(false);
  });

  it("reports a browser without the API as unsupported", () => {
    const had = "Notification" in window;
    const saved = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    expect(browserPermission()).toBe("unsupported");
    if (had) (window as { Notification?: unknown }).Notification = saved;
  });
});
