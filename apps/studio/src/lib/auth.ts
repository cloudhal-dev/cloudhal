import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same-origin (Vite proxies /api in dev; `cloudhal studio` serves both in prod), so no baseURL. */
export const authClient = createAuthClient({ plugins: [organizationClient(), adminClient()] });

/** A Better Auth call that failed; `code` is Better Auth's error code (e.g. `INVALID_PASSWORD`). */
export class AuthRequestError extends Error {
  override readonly name = "AuthRequestError";
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface BetterFetchResult<T> {
  data: T | null;
  error: { status: number; statusText?: string; message?: string; code?: string } | null;
}

/** Better Auth's client resolves `{ data, error }`; React Query wants a value or a throw. */
export async function unwrap<T>(call: Promise<BetterFetchResult<T>>): Promise<T> {
  const { data, error } = await call;
  if (error) {
    throw new AuthRequestError(
      error.status,
      error.message || error.statusText || `HTTP ${error.status}`,
      error.code,
    );
  }
  return data as T;
}

/** Listing sessions needs a recent sign-in (Better Auth's `freshAge`, one day by default). */
export function isSessionNotFresh(error: unknown): boolean {
  return error instanceof AuthRequestError && error.code === "SESSION_NOT_FRESH";
}

/** One signed-in browser or client of the current user (Better Auth `session` row). */
export interface UserSession {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CurrentUser {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    createdAt: Date | string;
  };
  session: UserSession;
}

/** Account operations for the signed-in person, as promises that throw `AuthRequestError`. */
export const account = {
  current: () => unwrap<CurrentUser | null>(authClient.getSession()),
  sessions: () => unwrap<UserSession[]>(authClient.listSessions()),
  revokeSession: (token: string) =>
    unwrap<{ status: boolean }>(authClient.revokeSession({ token })),
  revokeOtherSessions: () => unwrap<{ status: boolean }>(authClient.revokeOtherSessions()),
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
  }) => unwrap<unknown>(authClient.changePassword(input)),
  updateName: (name: string) => unwrap<{ status: boolean }>(authClient.updateUser({ name })),
};
