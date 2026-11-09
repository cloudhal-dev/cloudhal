/**
 * RFC-0044 §2, §5: the `/mcp` verifier against a key of the test's own. No DPoP in v1 (a token
 * bound with `cnf` is refused, not taken as a bearer token), and a token without the grant claim
 * is not one of ours.
 */
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  accessTokenOf,
  clearAccessTokenKeyCache,
  createAccessTokenVerifier,
} from "../src/auth/access-token.ts";
import { GRANT_CLAIM } from "../src/auth/oauth.ts";

const ISSUER = "http://localhost:8787/api/auth";
const AUDIENCE = "http://localhost:8787/mcp";

async function setup() {
  clearAccessTokenKeyCache(); // keys are cached per issuer; each test signs with its own
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" };
  const verify = createAccessTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    jwks: async () => ({ keys: [jwk] }),
  });
  const sign = (claims: Record<string, unknown>) =>
    new SignJWT({ scope: "site:read", client_id: "c1", ...claims })
      .setProtectedHeader({ alg: "EdDSA", typ: "at+jwt", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("u1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  return { verify, sign };
}

describe("access-token verifier", () => {
  it("accepts a bearer token naming its grant, and refuses a DPoP-bound one or one without a grant", async () => {
    const { verify, sign } = await setup();
    expect(await verify(await sign({ [GRANT_CLAIM]: "g1" }))).toMatchObject({
      sub: "u1",
      clientId: "c1",
      grantId: "g1",
      scopes: ["site:read"],
    });
    expect(await verify(await sign({ [GRANT_CLAIM]: "g1", cnf: { jkt: "x" } }))).toBeUndefined();
    expect(await verify(await sign({}))).toBeUndefined();
  });

  it("takes a JWT under the DPoP scheme as a token (refused later), never as an agent key", async () => {
    const { sign } = await setup();
    const jwt = await sign({ [GRANT_CLAIM]: "g1" });
    expect(accessTokenOf(new Headers({ authorization: `DPoP ${jwt}` }))).toBe(jwt);
    expect(accessTokenOf(new Headers({ authorization: "Bearer opaque-key" }))).toBeUndefined();
  });
});
