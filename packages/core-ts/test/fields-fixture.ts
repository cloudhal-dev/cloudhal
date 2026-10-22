/** Shared definitions for the RFC-0041 field tests: one field of every type and option. */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";

const L = (label: string, help?: string) => ({ en: help ? { label, help } : { label } });

export const EVENT_FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  {
    key: "venue",
    type: "text",
    labels: { en: { label: "Venue", help: "Where it happens." }, tr: { label: "Mekan" } },
    localized: true,
    requiredToPublish: true,
    maxLength: 20,
    searchable: true,
  },
  { key: "notes", type: "text", labels: L("Notes"), localized: false, multiline: true },
  { key: "agenda", type: "richText", labels: L("Agenda"), localized: true },
  {
    key: "price",
    type: "number",
    labels: L("Price", "In euros."),
    localized: false,
    minimum: 0.5,
    maximum: 999.5,
  },
  { key: "seats", type: "number", labels: L("Seats"), localized: false, integer: true },
  { key: "online", type: "boolean", labels: L("Online"), localized: false },
  { key: "deadline", type: "date", labels: L("Deadline"), localized: false },
  {
    key: "startsAt",
    type: "datetime",
    labels: L("Starts"),
    localized: false,
    requiredToPublish: true,
  },
  { key: "ticketUrl", type: "url", labels: L("Tickets"), localized: true },
  { key: "poster", type: "image", labels: L("Poster"), localized: false },
  {
    key: "format",
    type: "select",
    labels: L("Format"),
    localized: false,
    multiple: true,
    options: [
      { value: "talk", labels: { en: "Talk", tr: "Konuşma" } },
      { value: "workshop", labels: { en: "Workshop" } },
    ],
  },
  {
    key: "level",
    type: "select",
    labels: { tr: { label: "Seviye" } },
    localized: false,
    requiredToPublish: true,
    options: [
      { value: "beginner", labels: { tr: "Başlangıç" } },
      { value: "expert", labels: { tr: "Uzman", en: "Expert" } },
    ],
  },
];

export const site = (
  fields: readonly FieldDefinition[] = EVENT_FIELDS,
): Pick<Site, "collections" | "defaultLocale"> => ({
  defaultLocale: "en",
  collections: {
    posts: {},
    events: { fields: fields as [FieldDefinition, ...FieldDefinition[]] },
  },
});

/** Values that pass every check of EVENT_FIELDS. */
export const GOOD_VALUES: Record<string, unknown> = {
  venue: "Kadıköy Hall",
  notes: "Line one\nLine two",
  agenda: "# Agenda\n\n- Talks\n- **Lunch**",
  price: 12.5,
  seats: 120,
  online: false,
  deadline: "2026-02-28",
  startsAt: { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" },
  ticketUrl: "https://example.com/tickets",
  poster: "asset_01HZX8K3Q9PO",
  format: ["talk", "workshop"],
  level: "beginner",
};
