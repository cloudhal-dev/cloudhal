/**
 * RFC-0044 §3: `OauthServer.register` when DCR is on: Cloudhal's checks (`dcr.ts`), then the
 * provider's `registerOAuthClient` called server-side with empty headers (no session, no initial
 * access token: an anonymous public client). A provider refusal becomes a `RegistrationError`
 * with the provider's RFC 7591 error body.
 */
import { APIError } from "better-auth/api";
import { RegistrationError, registerDcrClient } from "./dcr.ts";
import type { AuthDeps } from "./deps.ts";
import type { McpOauthServerOptions } from "./oauth.ts";
import { dcrLimits } from "./oauth-registration.ts";
import type { OauthServer } from "./types.ts";

type RegisterApi = {
  registerOAuthClient(input: {
    body: Record<string, unknown>;
    headers: Headers;
  }): Promise<Record<string, unknown>>;
};

/** The `register` member of `OauthServer`, or nothing with DCR off. */
export function oauthClientRegistration(
  d: AuthDeps,
  options: McpOauthServerOptions,
): Pick<OauthServer, "register"> {
  const registration = options.registration;
  if (registration?.dcr !== true) return {};
  const api = d.instance.api as unknown as RegisterApi;
  const register = async (body: Record<string, unknown>) => {
    try {
      return await api.registerOAuthClient({ body, headers: new Headers() });
    } catch (e) {
      if (e instanceof APIError) {
        const b = (e.body ?? {}) as {
          error?: unknown;
          error_description?: unknown;
          message?: unknown;
        };
        const error = typeof b.error === "string" ? b.error : "invalid_client_metadata";
        const description =
          typeof b.error_description === "string"
            ? b.error_description
            : typeof b.message === "string"
              ? b.message
              : "the client metadata was refused";
        throw new RegistrationError(400, error, description);
      }
      throw e;
    }
  };
  return {
    register: (input) =>
      registerDcrClient(
        {
          sql: d.sql,
          staff: d.staffStore,
          limits: dcrLimits(registration),
          clientHosts: registration.clientHosts,
          register,
        },
        input,
      ),
  };
}
