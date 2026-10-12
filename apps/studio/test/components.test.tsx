import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "../src/components/ErrorBanner.tsx";
import { RowMenu } from "../src/components/RowMenu.tsx";
import { StatusActions } from "../src/components/StatusActions.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import { ApiRequestError } from "../src/lib/api.ts";

describe("ErrorBanner", () => {
  it("explains conflicts in plain words, in the active locale", () => {
    render(
      <I18nProvider initialLocale="tr">
        <ErrorBanner
          error={
            new ApiRequestError(409, {
              error: "conflict",
              message: "page x: expected rev 1 but found 2",
            })
          }
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/başkası değiştirdi/);
  });
  it("renders nothing without an error", () => {
    const { container } = render(
      <I18nProvider initialLocale="en">
        <ErrorBanner error={undefined} />
      </I18nProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StatusActions", () => {
  it("offers the next lifecycle step and routes publishing through approval", () => {
    const onChange = vi.fn();
    const onPublish = vi.fn();
    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <StatusActions status="draft" onChange={onChange} onPublish={onPublish} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText("Send to review"));
    expect(onChange).toHaveBeenCalledWith("review");
    rerender(
      <I18nProvider initialLocale="en">
        <StatusActions status="review" onChange={onChange} onPublish={onPublish} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("publish"));
    expect(onPublish).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalledWith("published");
  });
});

describe("RowMenu", () => {
  it("opens its menu and runs the chosen action (regression: a Tooltip around the trigger swallowed the click)", async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <I18nProvider initialLocale="en">
        <RowMenu onOpen={onOpen} onDelete={onDelete} />
      </I18nProvider>,
    );
    fireEvent.click(within(container).getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
