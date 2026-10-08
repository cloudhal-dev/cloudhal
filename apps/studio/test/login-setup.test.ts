import { afterEach, describe, expect, it } from "vitest";
import { takeSetupToken } from "../src/routes/LoginPage.tsx";

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

  it("is absent on a normal sign-in", () => {
    expect(takeSetupToken()).toBeUndefined();
  });
});
