import { afterEach, describe, expect, it } from "vitest";
import { oauthRequest, takeSetupToken } from "../src/routes/LoginPage.tsx";

describe("owner setup link", () => {
  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/login");
  });

  it("moves the token out of the URL and keeps it for this tab", () => {
    window.history.replaceState(null, "", "/login?setup=abc123&lang=tr#x");
    expect(takeSetupToken()).toBe("abc123");
    expect(window.location.search).toBe("?lang=tr");
    expect(window.location.hash).toBe("#x");
    expect(takeSetupToken()).toBe("abc123"); // after a reload, from sessionStorage
  });

  it("takes the token from the fragment, where `cloudhal deploy` puts it", () => {
    window.history.replaceState(null, "", "/login?lang=tr#setup=def456");
    expect(takeSetupToken()).toBe("def456");
    expect(window.location.search).toBe("?lang=tr");
    expect(window.location.hash).toBe("");
    expect(takeSetupToken()).toBe("def456");
  });

  it("keeps a token's + and decodes %xx, as the server compares it byte for byte", () => {
    window.history.replaceState(null, "", "/login#setup=ab+c/d%3D=");
    expect(takeSetupToken()).toBe("ab+c/d==");
  });

  it("is absent on a normal sign-in", () => {
    expect(takeSetupToken()).toBeUndefined();
  });
});

describe("oauthRequest (RFC-0044 §4)", () => {
  it("is the provider's signed request when the login page was reached from /oauth2/authorize", () => {
    window.history.replaceState(null, "", "/login?client_id=c1&scope=site%3Aread&sig=abc%3D");
    expect(oauthRequest()).toBe("client_id=c1&scope=site%3Aread&sig=abc%3D");
    window.history.replaceState(null, "", "/login?client_id=c1");
    expect(oauthRequest()).toBeUndefined();
    window.history.replaceState(null, "", "/login");
    expect(oauthRequest()).toBeUndefined();
  });
});
