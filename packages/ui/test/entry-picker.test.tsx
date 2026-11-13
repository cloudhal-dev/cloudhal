/** RFC-0045 §5: the entry picker, the chosen targets and "Used by". */
import { Button } from "@cloudflare/kumo";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPicker, type EntryPickerItem } from "../src/blocks/EntryPicker.tsx";
import { ReferenceList } from "../src/blocks/ReferenceList.tsx";
import { UsedByList } from "../src/blocks/UsedByList.tsx";
import { pickerLabels, referenceLabels } from "./field-labels.ts";

const HALL: EntryPickerItem = {
  id: "entry_hall001",
  title: "Main hall",
  collection: "Places",
  status: "published",
  locale: "English",
};
const ROOM: EntryPickerItem = { ...HALL, id: "entry_room001", title: "Room B", status: "draft" };
const ATTIC: EntryPickerItem = { ...HALL, id: "entry_attic01", title: "Attic" };

function open(props: Partial<Parameters<typeof EntryPicker>[0]> = {}) {
  const search = vi.fn(async (_q: string, _cursor: string | undefined) => ({
    items: [HALL, ROOM],
  }));
  const onPick = vi.fn();
  render(
    <EntryPicker
      trigger={<Button>Choose venue</Button>}
      search={search}
      multiple={false}
      remaining={1}
      onPick={onPick}
      labels={pickerLabels}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose venue" }));
  return { search: (props.search as typeof search | undefined) ?? search, onPick };
}

const box = () => screen.getByRole("combobox", { name: "Search entries" });

function Full() {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <EntryPicker
      trigger={<Button>Add speakers</Button>}
      search={async () => ({ items: [HALL, ROOM] })}
      multiple
      remaining={2 - chosen.length}
      disabled={chosen.length >= 2}
      onPick={(items) => setChosen((c) => [...c, ...items.map((i) => i.id)])}
      labels={pickerLabels}
    />
  );
}

function List({ after }: { after: HTMLElement }) {
  const [items, setItems] = useState([
    { id: "entry_ada0001", title: "Ada", status: "published" as const },
    { id: "entry_grace01", title: "Grace", status: "published" as const },
  ]);
  return (
    <ReferenceList
      label="Speakers"
      sortable
      items={items}
      onMove={(i, by) => {
        const next = [...items];
        [next[i], next[i + by]] = [next[i + by] as (typeof items)[0], next[i] as (typeof items)[0]];
        setItems(next);
      }}
      onRemove={(i) => setItems(items.filter((_, n) => n !== i))}
      focusAfterLast={() => after}
      labels={referenceLabels}
    />
  );
}

afterEach(cleanup);

describe("EntryPicker", () => {
  it("searches through its prop and announces the result count politely", async () => {
    const { search } = open();
    expect(await screen.findByRole("option", { name: /Main hall/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("", undefined);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("2 entries found");
    const option = screen.getByRole("option", { name: /Room B/ });
    expect(within(option).getByText("Places")).toBeInTheDocument();
    expect(within(option).getByText("Draft")).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: "hall" } });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith("hall", undefined));
  });

  it("moves with the arrow keys, picks with Enter, closes and returns focus to the trigger", async () => {
    const { onPick } = open();
    await screen.findByRole("option", { name: /Room B/ });
    expect(box()).toHaveFocus();
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    const room = screen.getByRole("option", { name: /Room B/ });
    expect(box()).toHaveAttribute("aria-activedescendant", room.id);
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith([ROOM]);
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose venue" })).toHaveFocus());
  });

  it("several targets: ticks up to the remaining count, then adds them together", async () => {
    const search = vi.fn(async () => ({ items: [HALL, ROOM, ATTIC] }));
    const { onPick } = open({
      multiple: true,
      remaining: 2,
      search,
      unavailable: new Set([ATTIC.id]),
    });
    await screen.findByRole("option", { name: /Attic/ });
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getByRole("option", { name: /Attic/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /Room B/ }));
    expect(screen.getByRole("option", { name: /Main hall/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("You can choose 0 more")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));
    expect(onPick).toHaveBeenCalledWith([HALL, ROOM]);
  });

  it("keeps searching after a truncated read, from the cursor", async () => {
    const search = vi.fn(async (_q: string, cursor: string | undefined) =>
      cursor ? { items: [ATTIC] } : { items: [], cursor: "places:en:m", truncated: true },
    );
    open({ search });
    fireEvent.click(await screen.findByRole("button", { name: "Keep searching" }));
    expect(await screen.findByRole("option", { name: /Attic/ })).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith("", "places:en:m");
  });

  it("says when nothing matches", async () => {
    open({ search: async () => ({ items: [] }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No entries found"));
    // The status line and the empty state.
    expect(screen.getAllByText("No entries found")).toHaveLength(2);
  });
});

describe("EntryPicker: failures and a full field", () => {
  it("says a failed search failed, politely, instead of 'No entries found'", async () => {
    open({ search: async () => Promise.reject(new Error("500")) });
    await waitFor(() =>
      expect(document.querySelector("[data-entry-picker-status]")).toHaveTextContent(
        "The search failed",
      ),
    );
    expect(screen.queryByText("No entries found")).toBeNull();
  });

  it("keeps focus on the trigger when a pick fills the field, and opens nothing then", async () => {
    render(<Full />);
    const trigger = screen.getByRole("button", { name: "Add speakers" });
    fireEvent.click(trigger);
    await screen.findByRole("option", { name: /Room B/ });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(trigger);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("ReferenceList", () => {
  it("shows each target's state and moves and removes through buttons and the menu", async () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    render(
      <ReferenceList
        label="Speakers"
        sortable
        items={[
          { id: "entry_ada0001", title: "Ada", status: "published", meta: "People", href: "/a" },
          { id: "entry_grace01", title: "Grace", status: "draft" },
          { id: "entry_gone001", status: "missing" },
          { id: "entry_load001" },
        ]}
        onMove={onMove}
        onRemove={onRemove}
        labels={referenceLabels}
      />,
    );
    const list = screen.getByRole("list", { name: "Speakers" });
    expect(within(list).getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/a");
    expect(within(list).getByText("Draft")).toBeInTheDocument();
    expect(within(list).getAllByText("Will not show until published")).toHaveLength(1);
    expect(within(list).getByText("Not found")).toBeInTheDocument();
    expect(within(list).getByText("entry_gone001")).toBeInTheDocument();
    expect(within(list).getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Ada up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Grace up" }));
    expect(onMove).toHaveBeenCalledWith(1, -1);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Grace" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("keeps focus on a moved row and moves it to the next row, or out, after a remove", async () => {
    const after = document.createElement("button");
    document.body.append(after);
    render(<List after={after} />);
    const down = screen.getByRole("button", { name: "Move Ada down" });
    down.focus();
    fireEvent.click(down);
    // Ada is last now: its down button is disabled, so focus goes to its up button.
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Ada up" })).toHaveFocus());
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Ada moved to position 2"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for Grace" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Ada" })).toHaveFocus(),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Grace removed"));
    fireEvent.click(screen.getByRole("button", { name: "Actions for Ada" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(after).toHaveFocus());
    after.remove();
  });

  it("read-only shows no actions", () => {
    render(
      <ReferenceList
        label="Venue"
        readOnly
        items={[{ id: "entry_hall001", title: "Main hall", status: "archived" }]}
        labels={referenceLabels}
      />,
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UsedByList", () => {
  it("lists referrers with where the value sits and their status", () => {
    render(
      <UsedByList
        rows={[
          {
            id: "entry_ev1 venue",
            title: "Launch",
            href: "/e/1",
            detail: "Events · English · Venue",
            status: "published",
            shownBy: "Also shown in Turkish",
          },
        ]}
        labels={{
          entry: "Entry",
          status: "Status",
          caption: "Entries that reference this one",
          statuses: {
            draft: "Draft",
            review: "In review",
            published: "Published",
            archived: "Archived",
          },
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Entries that reference this one" });
    expect(within(table).getByRole("link", { name: "Launch" })).toHaveAttribute("href", "/e/1");
    expect(within(table).getByText("Events · English · Venue")).toBeInTheDocument();
    expect(within(table).getByText("Also shown in Turkish")).toBeInTheDocument();
    expect(within(table).getByText("Published")).toBeInTheDocument();
  });
});
