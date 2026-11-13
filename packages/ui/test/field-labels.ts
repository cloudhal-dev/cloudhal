/** English test words for the field blocks (blocks take every word as a prop). */
import type { EntryFieldsFormLabels } from "../src/blocks/EntryFieldsForm.tsx";
import type { EntryPickerLabels } from "../src/blocks/EntryPicker.tsx";
import type { ReferenceListLabels } from "../src/blocks/ReferenceList.tsx";
import type { RepeaterFieldLabels } from "../src/blocks/RepeaterField.tsx";

export const repeaterLabels: RepeaterFieldLabels = {
  add: "Add item",
  count: (n, max) => `${n} of ${max}`,
  empty: "No items yet",
  moveUp: (i) => `Move item ${i} up`,
  moveDown: (i) => `Move item ${i} down`,
  actions: (i) => `Actions for item ${i}`,
  menuMoveUp: "Move up",
  menuMoveDown: "Move down",
  duplicate: "Duplicate",
  remove: "Remove",
  moved: (from, to) => `Item ${from} moved to position ${to}`,
  removed: (i) => `Item ${i} removed`,
  invalidItems: (n) => `${n} items need attention`,
};

export const formLabels: EntryFieldsFormLabels = {
  neededToPublish: "Needed to publish",
  fromOriginal: "From the original (English)",
  openOriginal: "Open the original",
  originalValue: (v) => `The original: ${v}`,
  yes: "Yes",
  no: "No",
  noValue: "No value",
  clear: "Clear",
  originalImage: "The original's image",
  sharedList: "Not translated: this list is shared by every language.",
  items: (n) => `${n} items`,
  repeater: repeaterLabels,
  itemLegend: (i, name) => (name ? `Item ${i}: ${name}` : `Item ${i}`),
  date: {
    date: "Date",
    pickDate: "Pick a date",
    chooseDate: "Choose a date",
    invalidTime: "Enter a time such as 09:30",
    calendar: {
      previousMonth: "Previous month",
      nextMonth: "Next month",
      navigation: "Months",
      day: (date) => date,
    },
  },
};

export const referenceLabels: ReferenceListLabels = {
  draft: "Draft",
  review: "In review",
  archived: "Archived",
  notFound: "Not found",
  notShown: "Will not show until published",
  notFoundHint: "This entry was deleted.",
  moveUp: (t) => `Move ${t} up`,
  moveDown: (t) => `Move ${t} down`,
  actions: (t) => `Actions for ${t}`,
  open: "Open",
  menuMoveUp: "Move up",
  menuMoveDown: "Move down",
  remove: "Remove",
  loading: "Loading",
};

export const pickerLabels: EntryPickerLabels = {
  title: "Choose entries",
  search: "Search entries",
  results: (n) => (n === 0 ? "No entries found" : `${n} entries found`),
  searching: "Searching…",
  noResults: "No entries found",
  failed: "The search failed",
  more: "Show more",
  keepSearching: "Keep searching",
  truncated: "Not every entry was searched yet.",
  remaining: (n) => `You can choose ${n} more`,
  unavailable: "Already chosen",
  status: { draft: "Draft", review: "In review", published: "Published", archived: "Archived" },
  add: (n) => `Add ${n}`,
  cancel: "Cancel",
  close: "Close",
};
