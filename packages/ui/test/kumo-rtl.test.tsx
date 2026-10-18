import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs, KumoLocaleProvider, Label, Pagination } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("Kumo is patched for right-to-left (ADR-0033 A1)", () => {
  it("has no physical utilities left and keeps the hand-written changes", () => {
    // Fails when a Kumo upgrade arrives without a regenerated patch, or the patch did not apply:
    // run `node scripts/kumo-patch.ts` and `pnpm install`.
    const script = path.resolve(here, "../../../scripts/kumo-patch.ts");
    expect(() =>
      execFileSync(process.execPath, [script, "--verify"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("mirrors Kumo's own directional icons and the breadcrumb separator (rtl-icons.patch)", () => {
    const { container } = render(
      <>
        <Pagination page={2} setPage={() => {}} perPage={10} totalCount={50} />
        <Breadcrumbs>
          <Breadcrumbs.Link href="/">Home</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Docs</Breadcrumbs.Current>
        </Breadcrumbs>
      </>,
    );
    const mirrored = container.querySelectorAll("svg.rtl\\:-scale-x-100");
    // First, previous, next and last, plus the separator.
    expect(mirrored.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Kumo's Label speaks the app's language (label-locale.patch)", () => {
  it("takes the optional suffix and the tooltip button's name from KumoLocaleProvider", () => {
    render(
      <KumoLocaleProvider
        translations={{ label: { optional: "(اختياري)", moreInformation: "مزيد" } }}
      >
        <Label showOptional tooltip="?">
          Name
        </Label>
      </KumoLocaleProvider>,
    );
    expect(screen.getByText("(اختياري)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مزيد" })).toBeInTheDocument();
  });

  it("keeps English without a provider", () => {
    render(<Label showOptional>Name</Label>);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });
});
