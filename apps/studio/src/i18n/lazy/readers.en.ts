/**
 * English `readers.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1 "Lazy message
 * namespaces"): loaded with the editors (Readers card), the site overview (Last 7 days) and the
 * Articles and Pages lists (views column), not with every page. The source of truth for its
 * keys; `readers.tr.ts` is typed against it.
 */
export const messages = {
  readers: {
    title: "Readers",
    range: "Range",
    ranges: { "7d": "7 days", "30d": "30 days", all: "All time" },
    periods: { "7d": "last 7 days", "30d": "last 30 days", all: "all time" },
    figures: "Readers, {period}",
    pageviews: "Page views",
    visits: "Visits",
    delta: "{delta} vs the previous {days} days",
    channelsLabel: "Where readers came from",
    other: "Other",
    open: "Open in analytics",
    redirects: "Old addresses still bring readers: {count} in the {period}",
    redirectsAll: "Old addresses still bring readers: {count} in all",
    partial: "Part of this range can't be read yet, so the numbers may be low.",
    channels: {
      search: "Search engines",
      social: "Social media",
      ai: "AI assistants",
      email: "Email",
      paid: "Paid campaigns",
      referral: "Other sites",
      internal: "This site",
      direct: "Direct",
    },
    chart: {
      description: "Page views per day, {period}: {total} in all.",
      timezone: "Times in UTC",
      showTable: "Show as table",
      showChart: "Show as chart",
      time: "Day (UTC)",
    },
    states: {
      neverPublished: {
        article: "Stats start when this article is published",
        page: "Stats start when this page is published",
      },
      neverPublishedHint: "Visits are counted without cookies from the first publish on.",
      noReaders: "No readers yet",
      noReadersHint: "Numbers appear about a minute after the first visit.",
      cantRead: "Can't read visits yet",
      cantReadHint:
        "Visits are being recorded. Studio can't read them on this Cloudflare plan yet; they are kept for 3 months.",
      notPermitted: "Analytics aren't part of your role",
    },
    overview: {
      title: "Last 7 days",
      view: "View analytics",
      figures: "Visits in the last 7 days",
      mostRead: "Most read",
      topContent: "Most read in the last 7 days",
      noVisits: "No visits yet",
      noVisitsHint: "Numbers appear about a minute after the first visit to a published page.",
      untitled: "Untitled",
      gone: "No longer exists",
    },
    listColumn: {
      title: "Views · 30 days",
      notTop: "Not among the {count} most read in the last 30 days",
    },
  },
} as const;
