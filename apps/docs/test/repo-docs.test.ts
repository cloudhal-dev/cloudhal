import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allPages } from "../src/lib/pages.ts";
import { redirectLines } from "../src/lib/redirects.ts";
import {
  describe as describeDoc,
  docId,
  numbered,
  resolveLink,
  rewriteLinks,
  splitTitle,
  status,
} from "../src/lib/repo-docs.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("docId", () => {
  it("drops .md, lower-cases, and lets README stand for its folder", () => {
    expect(docId("docs/adr/0012-workers.md")).toBe("docs/adr/0012-workers");
    expect(docId("docs/contributing/README.md")).toBe("docs/contributing");
    expect(docId("docs/design/DESIGN.md")).toBe("docs/design/design");
  });
});

describe("splitTitle", () => {
  it("takes the leading H1 and removes it from the body", () => {
    expect(splitTitle("# Search guide\n\nBody.\n", "docs/guides/search.md")).toEqual({
      title: "Search guide",
      rest: "Body.\n",
    });
  });
  it("falls back to the file name when the file does not start with an H1", () => {
    expect(splitTitle("Intro\n\n# Later\n", "docs/x/notes.md").title).toBe("notes");
  });
});

describe("describe", () => {
  it("prefers the Summary section and strips Markdown", () => {
    const body =
      "- Status: Draft\n\n## Summary\nOne **bold** [link](x.md) here.\n\n## Motivation\nNo.";
    expect(describeDoc(body)).toBe("One bold link here.");
  });
  it("skips lists, tables and code to find prose", () => {
    expect(describeDoc("- a\n- b\n\n| t |\n\n```\ncode\n```\n\nThe prose.")).toBe("The prose.");
  });
});

describe("numbered", () => {
  it("gives ADRs and RFCs a short sidebar label and their number as order", () => {
    expect(numbered("ADR-0039: cloudhal.dev: Starlight over the repo's docs")).toEqual({
      label: "0039 · cloudhal.dev",
      order: 39,
    });
    expect(numbered("Search guide")).toBeUndefined();
  });
});

describe("status", () => {
  it("reads the first word of the Status line", () => {
    expect(status("# RFC\n- Status: Accepted (2026-10-21)\n")).toBe("Accepted");
    expect(status("no status")).toBeUndefined();
  });
});

describe("resolveLink", () => {
  const from = "docs/rfcs/0037-cloudhal-dev-docs-site.md";
  it("maps links between docs to site paths, keeping (lower-cased) anchors", () => {
    expect(resolveLink(from, "../adr/0037-domain-strategy.md#Decision", REPO)).toBe(
      "/docs/adr/0037-domain-strategy#decision",
    );
    expect(resolveLink(from, "../contributing/README.md", REPO)).toBe("/docs/contributing");
  });
  it("sends other repo files to GitHub, folders as tree links", () => {
    expect(resolveLink(from, "../../AGENTS.md", REPO)).toBe(
      "https://github.com/cloudhal-dev/cloudhal/blob/main/AGENTS.md",
    );
    expect(resolveLink(from, "../../packages/cli", REPO)).toBe(
      "https://github.com/cloudhal-dev/cloudhal/tree/main/packages/cli",
    );
  });
  it("leaves absolute URLs, anchors and site paths alone", () => {
    for (const target of ["https://example.com/a.md", "#top", "/docs", "mailto:a@b.c"]) {
      expect(resolveLink(from, target, REPO)).toBe(target);
    }
  });
});

describe("rewriteLinks", () => {
  const file = "docs/guides/search.md";
  it("rewrites inline links and reference definitions, not fenced code", () => {
    const md = [
      "See [ADR](../adr/0011-mcp-server.md) and [ref].",
      "",
      "```md",
      "[keep](../adr/0011-mcp-server.md)",
      "```",
      "",
      "[ref]: ../rfcs/0029-search-providers-and-search-ui.md",
    ].join("\n");
    expect(rewriteLinks(md, file, REPO)).toBe(
      [
        "See [ADR](/docs/adr/0011-mcp-server) and [ref].",
        "",
        "```md",
        "[keep](../adr/0011-mcp-server.md)",
        "```",
        "",
        "[ref]: /docs/rfcs/0029-search-providers-and-search-ui",
      ].join("\n"),
    );
  });
  it("makes site links absolute for Markdown read off the site", () => {
    expect(rewriteLinks("[x](schedules.md)", file, REPO, true)).toBe(
      "[x](https://cloudhal.dev/docs/guides/schedules)",
    );
  });
});

describe("the published page set", () => {
  const pages = allPages(REPO);
  const ids = new Set(pages.map((p) => p.id));

  it("has unique ids and a title and description on every page", () => {
    expect(ids.size).toBe(pages.length);
    for (const page of pages) {
      expect(page.title, page.id).not.toBe("");
      expect(page.description, page.id).not.toBe("");
    }
  });

  it("only links to pages that exist (or redirect)", () => {
    const redirected = new Set(redirectLines().map((l) => l.split(" ")[0]?.slice(1)));
    const broken: string[] = [];
    for (const page of pages) {
      for (const [, target] of page.body.matchAll(/\]\((\/[^)#\s]*)/g)) {
        const id = target?.slice(1) || "index";
        const asset = /^(schemas|llms|pagefind)/.test(id) || id.endsWith(".txt");
        if (!asset && !ids.has(id) && !redirected.has(id)) broken.push(`${page.id} → /${id}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("keeps the URLs other code links to", () => {
    expect(ids.has("docs/guides/deploy-button")).toBe(true);
    expect(redirectLines()).toContain("/docs/deploy /docs/guides/deploy-button 301");
    expect(ids.has("fetch")).toBe(true);
  });
});

describe("describe with list summaries", () => {
  it("uses the first item when the Summary is a list", () => {
    expect(
      describeDoc("## Summary\n- **What.** A generator.\n- **How.** Drafts.\n\n## Next\nNo."),
    ).toBe("What. A generator.");
  });
});

describe("the CLI reference", () => {
  it("has a section per command of cloudhal --help, with its flags", async () => {
    const { cliReference } = await import("../src/lib/reference.ts");
    const { body } = cliReference();
    for (const command of ["init", "dev", "studio", "mcp", "deploy", "push", "pull", "schedules"]) {
      expect(body).toContain(`\n## ${command}\n`);
    }
    expect(body).toContain("cloudhal mcp [--mode plan|manual|edits|auto|bypass]");
  });
});
