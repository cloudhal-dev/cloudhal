/**
 * RFC-0042: collections stage 3 — listing fields, expiry and structured data in collection
 * settings, the collection list's field columns and filters, "Create listing page", and the page
 * editor's content list conditions.
 */
export const messages = {
  listings: {
    listFields: {
      title: "Listing fields",
      description:
        "Up to 4 fields that lists can filter and sort by: columns in this collection's list, conditions in content list sections, and agents' queries.",
      add: "Add a listing field",
      choose: "Choose a field",
      empty: "No listing fields yet",
      emptyDescription: "Choose fields to show them as columns and to filter lists by them.",
      noFields: "Add fields to this collection first; listing fields are chosen from them.",
      full: "That's 4 fields, the most a collection can list.",
      moveUp: "Move {label} up",
      moveDown: "Move {label} down",
      remove: "Remove {label}",
      /** Badge on a number or date field: lists can be ordered by it. */
      sortable: "Sortable",
      save: "Save listing fields",
      saved: "Listing fields saved",
      /** Above the list of pages a 409 `list_field_in_use` names. */
      inUse:
        "Content list sections still filter or sort by a field you took out. Change these pages first:",
    },
    expiry: {
      title: "Expiry",
      description:
        "Entries can end on a date of their own, such as the day an event is over. Nothing is deleted or unpublished: the site checks the date each time it shows an entry.",
      enabled: "End entries on a date",
      enabledHint: "Turn off to keep every entry until someone unpublishes it.",
      field: "Date field",
      fieldHint:
        "A date ends at midnight after it, in the site's time zone; a date and time ends at that moment.",
      noDateFields: "This collection has no date or date-and-time field. Add one to use expiry.",
      action: "When an entry has ended",
      unlist: "Leave lists",
      unlistDescription:
        "Its page stays at its address, but it leaves lists, content list sections, feeds, the sitemap and search. Good for events and jobs.",
      hide: "Hide the page",
      hideDescription:
        "Its page answers “not found”, and it leaves every list, feed and search too. Good for offers that must not stay reachable.",
      grace: "Grace period in minutes",
      graceHint: "Wait this long after the date before the entry ends. Up to 10,080 (one week).",
      past: "{count, plural, =0 {No published entries are past it yet.} one {# published entry is already past it.} other {# published entries are already past it.}}",
      save: "Save expiry",
      saved: "Expiry saved",
      /** 409 `gates_unsupported`: the site Worker is older than this rule. */
      gatesUnsupported:
        "This site's live server doesn't apply expiry yet. Deploy the site first, then save the expiry again.",
    },
    structuredData: {
      title: "Structured data",
      description:
        "Describe each entry to search engines as an event, job, product or recipe, from its fields. Without a type, entries are described as blog posts.",
      type: "Type",
      none: "None (blog post)",
      types: {
        Event: "Event",
        JobPosting: "Job posting",
        Product: "Product",
        Recipe: "Recipe",
      },
      /** Column header: the schema.org property path. */
      property: "Property",
      source: "Value from",
      required: "Required",
      /** Badge: at least one property of this group (an address) needs a value from a field. */
      oneOf: "One of these",
      sources: {
        default: "Default: {source}",
        unmapped: "Not used",
        constant: "A fixed value",
        field: "Field: {label}",
        entry: "Entry: {property}",
        site: "Site: {property}",
      },
      entryProps: {
        title: "Title",
        summary: "Summary",
        body: "Body",
        coverImage: "Cover image",
        url: "Address",
        publishedAt: "Published date",
        updatedAt: "Updated date",
      },
      siteProps: {
        name: "Site name",
        url: "Site address",
        logo: "Site logo",
      },
      constant: "Fixed value of {path}",
      currencyHint: "A three-letter currency code such as EUR.",
      issues: {
        unknown_path: "This type has no such property.",
        unknown_field: "This field no longer exists.",
        source_mismatch: "This value doesn't fit the property.",
        vocabulary:
          "Some options of this field mean nothing to search engines here; entries using them leave the property out.",
        currency: "Use a three-letter currency code such as EUR.",
        required_missing: "Needed: choose where its value comes from.",
        constant_required:
          "Required properties take their value from each entry, not a fixed value.",
        required_value_missing:
          "This entry has no value for a required property ({path}), so its page keeps the blog post description.",
        too_large:
          "This entry's description is too large, so its page keeps the blog post description.",
        no_preset:
          "This collection has no structured data type yet, so its pages describe entries as blog posts.",
      },
      suggestRequired:
        "Tip: mark the fields mapped to required properties as “Needed to publish”, so no entry goes out without them.",
      themeReminder:
        "Search engines expect these values to be visible on the page, so check that your theme shows the mapped fields.",
      preview: "Preview",
      previewEntry: "Entry",
      previewChoose: "Choose an entry",
      previewDescription: "What this entry's page emits with the saved settings.",
      previewEmpty: "No entries in this collection yet.",
      noDocument: "This entry's page emits no structured data of this type.",
      richResults: "Test in Google's Rich Results Test",
      save: "Save structured data",
      saved: "Structured data saved",
    },
    createPage: {
      action: "Create listing page",
      open: "Open listing page",
      created: "Listing page created",
      /** Tooltip on "Open listing page": a page already lives at the collection's address. */
      exists: "A page already lives at {path}.",
    },
    filters: {
      label: "Filter by fields",
      any: "{label}: any",
      upcoming: "{label}: upcoming",
      past: "{label}: past",
      set: "{label}: has a value",
      unset: "{label}: empty",
      yes: "{label}: yes",
      no: "{label}: no",
      is: "{label}: {value}",
      sortBy: "Sort by {label}",
      clear: "Clear filters",
      empty: "No entries match these filters",
      emptyDescription: "Change or clear the filters to see more.",
    },
    contentList: {
      where: "Only entries where",
      add: "Add condition",
      field: "Field",
      op: "Condition",
      value: "Value",
      remove: "Remove condition",
      /** `kind` is `time` for date fields, `number` for numbers and the rest. */
      ops: {
        eq: "is",
        ne: "is not",
        lt: "{kind, select, time {is before} number {is less than} other {is less than}}",
        lte: "{kind, select, time {is on or before} number {is at most} other {is at most}}",
        gt: "{kind, select, time {is after} number {is more than} other {is more than}}",
        gte: "{kind, select, time {is on or after} number {is at least} other {is at least}}",
        in: "is one of",
        set: "has a value",
        unset: "is empty",
      },
      now: "Now",
      aDate: "A date",
      dateHint: "A date such as 2026-11-05.",
      instantHint: "A moment with its offset, such as 2026-11-05T19:30:00+03:00.",
      yes: "Yes",
      no: "No",
      orderBy: "Order by field",
      orderNone: "The list order above",
      direction: "Direction",
      asc: "{kind, select, time {Earliest first} number {Smallest first} other {Smallest first}}",
      desc: "{kind, select, time {Latest first} number {Largest first} other {Largest first}}",
      noListFields: "This collection has no listing fields to filter or sort by.",
      settingsLink: "Choose listing fields",
    },
  },
} as const;
