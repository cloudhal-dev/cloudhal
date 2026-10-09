import type { MapGeoJson } from "../src/index.ts";

/** Labels as Studio will pass them from `useT()`; the blocks hold no English of their own. */
export const breakdownLabels = {
  item: "Page",
  value: "Page views",
  secondary: "Visits",
  share: "Share",
  other: "Other",
  caption: "Top content",
};

export const rangeLabels = {
  group: "Date range",
  presets: {
    today: "Today",
    "7d": "7 days",
    "30d": "30 days",
    "90d": "90 days",
    "12m": "12 months",
  },
  custom: "Custom…",
  customTitle: "Custom range",
  apply: "Apply",
  cancel: "Cancel",
  timezone: "UTC",
  pickHint: "Choose the first and the last day.",
  tooLong: "Choose at most 2 years.",
  compare: "Compare with the previous period",
};

export const timeseriesLabels = {
  description: "Page views 290, visits 190, last 3 days",
  timezone: "Times in UTC",
  showTable: "Show as table",
  showChart: "Show as chart",
  time: "Time (UTC)",
};

/** Two boxes standing in for countries, keyed like Natural Earth (`ISO_A2_EH`). */
export const AnalyticsCountryMapFixture: MapGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { ISO_A2_EH: "DE", NAME: "Germany" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [6, 47],
            [15, 47],
            [15, 55],
            [6, 55],
            [6, 47],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { ISO_A2_EH: "-99", NAME: "Nowhere" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-10, 0],
            [-5, 0],
            [-5, 5],
            [-10, 5],
            [-10, 0],
          ],
        ],
      },
    },
  ],
};
