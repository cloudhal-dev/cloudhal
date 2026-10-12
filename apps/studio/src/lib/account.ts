/**
 * Pure helpers for the Account screen (profile, password, sessions). The Better Auth calls live in
 * `auth.ts`; everything here is testable without a server.
 */

/** Better Auth's default `emailAndPassword` limits (packages/api/src/auth.ts keeps the defaults). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Site and user names share the contract limit (`site.schema.json` → `name.maxLength`). */
export const NAME_MAX = 200;

// The avatar's letters live with the shell's user menu (`initials.ts`).
export { initials } from "./initials.ts";

export type NameError = "required" | "tooLong";

export function validateName(name: string): NameError | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "required";
  if (trimmed.length > NAME_MAX) return "tooLong";
  return undefined;
}

export interface PasswordChange {
  current: string;
  next: string;
  confirm: string;
}

export interface PasswordErrors {
  current?: "required" | "wrong";
  next?: "required" | "tooShort" | "tooLong" | "same";
  confirm?: "required" | "mismatch";
}

/** Client-side checks before calling `changePassword`; the server repeats the length checks. */
export function validatePasswordChange(input: PasswordChange): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!input.current) errors.current = "required";
  if (!input.next) errors.next = "required";
  else if (input.next.length < PASSWORD_MIN) errors.next = "tooShort";
  else if (input.next.length > PASSWORD_MAX) errors.next = "tooLong";
  else if (input.current && input.next === input.current) errors.next = "same";
  if (!input.confirm) errors.confirm = "required";
  else if (input.next && input.confirm !== input.next) errors.confirm = "mismatch";
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
}

/** Maps a Better Auth error code from `changePassword` onto a field error, when it is one. */
export function passwordServerError(code: string | undefined): PasswordErrors | undefined {
  switch (code) {
    case "INVALID_PASSWORD":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return { current: "wrong" };
    case "PASSWORD_TOO_SHORT":
      return { next: "tooShort" };
    case "PASSWORD_TOO_LONG":
      return { next: "tooLong" };
    default:
      return undefined;
  }
}

export type DeviceKind = "desktop" | "mobile" | "tablet" | "cli" | "unknown";

export interface DeviceInfo {
  kind: DeviceKind;
  /** Browser or client name ("Chrome", "Safari", "curl"); undefined when unrecognised. */
  browser?: string;
  /** Operating system ("macOS", "iOS", "Windows"); undefined when unrecognised. */
  os?: string;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];
const CLIENTS: Array<[RegExp, string]> = [
  [/^curl\//, "curl"],
  [/^node\b|\bundici\b/i, "Node.js"],
  [/^Wget\//, "Wget"],
];
const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bLinux\b/, "Linux"],
];

/** A readable device from a session's user agent ("Chrome on macOS"). Good enough to recognise, not to fingerprint. */
export function describeUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { kind: "unknown" };
  for (const [re, name] of CLIENTS) if (re.test(ua)) return { kind: "cli", browser: name };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  const kind: DeviceKind = /\biPad\b|\bTablet\b/.test(ua)
    ? "tablet"
    : /\bMobi|\biPhone\b|\bAndroid\b/.test(ua)
      ? "mobile"
      : browser || os
        ? "desktop"
        : "unknown";
  return { kind, ...(browser ? { browser } : {}), ...(os ? { os } : {}) };
}

/** Accepts the Date objects Better Auth's client revives as well as ISO strings. */
export function toIso(value: Date | string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface SessionLike {
  token: string;
  updatedAt: Date | string;
}

/** The current session first, then the most recently active. */
export function sortSessions<T extends SessionLike>(sessions: readonly T[], currentToken?: string) {
  const time = (s: T) => new Date(s.updatedAt).getTime() || 0;
  return [...sessions].sort((a, b) => {
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return time(b) - time(a);
  });
}
