/**
 * RFC-0044 §2, §5: verifying an OAuth access token on `/mcp`. The token is an RFC 9068 JWT
 * (`typ: at+jwt`) signed with the `jwt()` plugin's key; `/mcp` checks the signature, `iss`
 * (the issuer), `aud` (the `/mcp` resource, RFC 8707), `exp` and the claims it uses (`sub`,
 * `client_id`/`azp`, `scope`). The public keys come from the `jwks` table through the Better
 * Auth instance (never by fetching the deployment's own `/api/auth/jwks` over HTTP) and are
 * cached per isolate.
 *
 * Worker-safe: `jose` uses WebCrypto.
 */
import { createLocalJWKSet, decodeProtectedHeader, type JSONWebKeySet, jwtVerify } from "jose";
import { ACCESS_TOKEN_ALG, GRANT_CLAIM } from "./oauth.ts";

/** A bearer value shaped like an access token: three base64url segments, header `typ: at+jwt`. */
export function looksLikeAccessToken(value: string): boolean {
  // Length first, then a split: no pattern runs over the external input (AGENTS.md rule 13).
  if (value.length > 8192) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return false;
  try {
    const header = decodeProtectedHeader(value);
    return typeof header.typ === "string" && header.typ.toLowerCase() === "at+jwt";
  } catch {
    return false;
  }
}

/** The bearer value of `headers` when it is an access token (`looksLikeAccessToken`). */
export function accessTokenOf(headers: Headers): string | undefined {
  const credential = /^(?:Bearer|DPoP)\s+(\S+)\s*$/i.exec(headers.get("authorization") ?? "");
  const value = credential?.[1];
  return value && looksLikeAccessToken(value) ? value : undefined;
}

export interface VerifiedAccessToken {
  /** The member (Better Auth user id). */
  readonly sub: string;
  /** The OAuth client (`client_id`, else `azp`). */
  readonly clientId: string;
  /** The grant the token was issued for (`cloudhal_grant`, RFC-0044 §5). */
  readonly grantId: string;
  readonly scopes: string[];
  readonly jti: string | undefined;
  readonly exp: number;
}

export interface AccessTokenVerifierOptions {
  readonly issuer: string;
  /** The resource identifier every token's `aud` must contain. */
  readonly audience: string;
  /** The public keys (the `jwt()` plugin's `getJwks`, called server-side). */
  readonly jwks: () => Promise<JSONWebKeySet>;
  readonly now?: (() => Date) | undefined;
}

/** How long a key set is reused before it is read again (a rotation shows up within it). */
const JWKS_TTL_MS = 5 * 60_000;
/** A token naming an unknown `kid` re-reads the keys at most this often (forged kids are free). */
const JWKS_MISS_INTERVAL_MS = 10_000;

interface CachedKeys {
  keys: JSONWebKeySet;
  set: ReturnType<typeof createLocalJWKSet>;
  readAt: number;
}

/** Per isolate, per issuer (one Worker isolate may serve several hosts). */
const cache = new Map<string, CachedKeys>();

/** Forgets the cached keys (tests, and after a key rotation in the same process). */
export function clearAccessTokenKeyCache(): void {
  cache.clear();
}

export function createAccessTokenVerifier(options: AccessTokenVerifierOptions) {
  const now = () => (options.now?.() ?? new Date()).getTime();
  const load = async (): Promise<CachedKeys> => {
    const keys = await options.jwks();
    const entry = { keys, set: createLocalJWKSet(keys), readAt: now() };
    cache.set(options.issuer, entry);
    return entry;
  };
  const keysFor = async (kid: string | undefined): Promise<CachedKeys> => {
    const cached = cache.get(options.issuer);
    if (!cached || now() - cached.readAt > JWKS_TTL_MS) return load();
    const known = kid === undefined || cached.keys.keys.some((k) => k.kid === kid);
    if (!known && now() - cached.readAt > JWKS_MISS_INTERVAL_MS) return load();
    return cached;
  };

  /** The verified claims, or `undefined` for any token that is not one of ours and current. */
  return async (token: string): Promise<VerifiedAccessToken | undefined> => {
    try {
      const { kid } = decodeProtectedHeader(token);
      const { set } = await keysFor(kid);
      const { payload } = await jwtVerify(token, set, {
        issuer: options.issuer,
        audience: options.audience,
        typ: "at+jwt",
        // The one algorithm the server signs with (`oauthPlugins`): no algorithm confusion.
        algorithms: [ACCESS_TOKEN_ALG],
        requiredClaims: ["sub", "exp", "iat", GRANT_CLAIM],
        currentDate: new Date(now()),
      });
      // No DPoP in v1 (ADR-0010): a sender-constrained token (`cnf`, RFC 9449) is refused rather
      // than accepted as a plain bearer token.
      if (payload.cnf !== undefined) return undefined;
      const grantId = payload[GRANT_CLAIM];
      const clientId =
        typeof payload.client_id === "string"
          ? payload.client_id
          : typeof payload.azp === "string"
            ? payload.azp
            : undefined;
      if (
        !payload.sub ||
        !clientId ||
        typeof payload.exp !== "number" ||
        typeof grantId !== "string"
      )
        return undefined;
      const scope = typeof payload.scope === "string" ? payload.scope : "";
      return {
        sub: payload.sub,
        clientId,
        grantId,
        scopes: scope.split(" ").filter((s) => s.length > 0),
        jti: payload.jti,
        exp: payload.exp,
      };
    } catch {
      return undefined;
    }
  };
}

export type AccessTokenVerifier = ReturnType<typeof createAccessTokenVerifier>;
