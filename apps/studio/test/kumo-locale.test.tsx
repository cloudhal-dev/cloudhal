/**
 * Kumo's own words follow the Studio language (`KumoLocale` at the root, DESIGN.md §2v): in Kumo
 * 2.14 that is `LayerDialog`'s close button and dismiss action.
 */
import { LayerDialog } from "@cloudhal/ui";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KumoLocale } from "../src/components/KumoLocale.tsx";
import { I18nProvider, type Locale, useI18n } from "../src/i18n/index.tsx";

afterEach(cleanup);

let switchTo: (locale: Locale) => void = () => {};

function Dialogs() {
  switchTo = useI18n().setLocale;
  return (
    <>
      <LayerDialog open>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>Plain</LayerDialog.Title>
          <LayerDialog.Body>Body</LayerDialog.Body>
        </LayerDialog.Content>
      </LayerDialog>
      <LayerDialog.Alert open>
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>Alert</LayerDialog.Title>
          <LayerDialog.Body>Body</LayerDialog.Body>
          <LayerDialog.Actions>
            <LayerDialog.Actions.Primary>Go</LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </>
  );
}

describe("Kumo locale", () => {
  it("translates Kumo's dialog labels and follows a language switch", async () => {
    render(
      <I18nProvider initialLocale="tr">
        <KumoLocale>
          <Dialogs />
        </KumoLocale>
      </I18nProvider>,
    );
    // Two modals are open: the lower one is inert, so its buttons are hidden from the a11y tree.
    expect(await screen.findByRole("button", { name: "Kapat", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazgeç", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close", hidden: true })).not.toBeInTheDocument();

    act(() => switchTo("en"));
    expect(await screen.findByRole("button", { name: "Close", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel", hidden: true })).toBeInTheDocument();
  });
});
