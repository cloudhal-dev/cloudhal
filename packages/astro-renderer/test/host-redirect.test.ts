import { describe, expect, it } from "vitest";
import { hostRedirect } from "../src/host-redirect.ts";

const env = {
  CLOUDHAL_REDIRECT_HOSTS: "www.example.com, old.example.org",
  CLOUDHAL_REDIRECT_TO: "example.com",
};

describe("redirect-only hosts (#49)", () => {
  it("answers 301 to the site domain, path and query kept", () => {
    const r = hostRedirect(new Request("https://WWW.example.com/blog/post?ref=x"), env);
    expect(r?.status).toBe(301);
    expect(r?.headers.get("location")).toBe("https://example.com/blog/post?ref=x");
    expect(hostRedirect(new Request("http://old.example.org/"), env)?.headers.get("location")).toBe(
      "https://example.com/",
    );
  });

  it("leaves the site's own host and other hosts alone", () => {
    expect(hostRedirect(new Request("https://example.com/"), env)).toBeUndefined();
    expect(hostRedirect(new Request("https://site.acme.workers.dev/"), env)).toBeUndefined();
    expect(hostRedirect(new Request("https://www.example.com/"), {})).toBeUndefined();
    expect(
      hostRedirect(new Request("https://www.example.com/"), {
        CLOUDHAL_REDIRECT_HOSTS: "www.example.com",
      }),
    ).toBeUndefined();
  });
});
