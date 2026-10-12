import { useSyncExternalStore } from "react";

/**
 * Studio's colour scheme (DESIGN.md §4): `light`, `dark`, or `system` (follow the OS). Kumo themes
 * through `data-mode` on `<html>`; the inline script in `index.html` applies the stored choice
 * before first paint with the same storage key, so a reload never flashes the other theme.
 */
export type ThemePreference = "light" | "dark" | "system";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/** Keep in sync with the inline script in `index.html`. */
export const THEME_STORAGE_KEY = "cloudhal.studio.theme";

const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {}
  return "system";
}

let preference: ThemePreference = typeof window === "undefined" ? "system" : readStored();

function systemMode(): "light" | "dark" {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Writes `data-mode` (and `color-scheme`, for native scrollbars and form controls) on `<html>`. */
export function applyTheme(next: ThemePreference = preference): void {
  if (typeof document === "undefined") return;
  const mode = next === "system" ? systemMode() : next;
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  applyTheme(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  // "System" follows the OS as it changes; another tab's choice applies here too.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (preference === "system") applyTheme();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    preference = readStored();
    applyTheme();
    for (const listener of listeners) listener();
  });
}

/** The person's colour-scheme choice and its setter. */
export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const value = useSyncExternalStore(subscribe, getThemePreference, () => "system" as const);
  return [value, setThemePreference];
}
