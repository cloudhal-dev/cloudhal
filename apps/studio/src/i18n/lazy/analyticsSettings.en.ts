/**
 * English `analyticsSettings.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1
 * "Lazy message namespaces"): loaded with site settings (the Analytics section) and Agents (the
 * keys' "Allow analytics"), not with every page. The source of truth for its keys;
 * `analyticsSettings.tr.ts` is typed against it.
 */
export const messages = {
  analyticsSettings: {
    title: "Analytics",
    description:
      "Visits to this site, counted without cookies. Changes reach the site within a minute.",
    status: { on: "On", off: "Off", notRunning: "Not running" },
    loadFailed: "Couldn't load the analytics settings",
    noAccessTitle: "You can't see analytics",
    notAvailableTitle: "This server doesn't offer analytics",
    notAvailableDescription:
      "It runs without the analytics service. Update Cloudhal and deploy again to count visits.",
    deployment: {
      title: "This deployment",
      offTitle: "Analytics aren't running on this deployment",
      offDescription:
        "The site records no visits. Set analytics.enabled in cloudhal.json and run cloudhal deploy; the settings below apply as soon as it records.",
      cantReadTitle: "Visits are recorded, but Studio can't read them yet",
      cantReadDescription:
        "This Cloudflare account doesn't let the deployment read Workers Analytics Engine back yet. Nothing is lost: visits keep being recorded, and Analytics shows the daily totals it has until reading works.",
      store: "Recorded in",
      stores: {
        wae: "Workers Analytics Engine",
        sql: "This deployment's database",
        none: "Nowhere, not recording",
      },
      reader: "Read from",
      readers: {
        binding: "Analytics Engine SQL",
        sql: "This deployment's database",
        none: "Not available yet",
      },
      rollups: "Daily totals",
      rollupModes: {
        scheduled: "Computed every hour",
        "on-read": "Computed when someone opens Analytics",
      },
      rollupHints: {
        scheduled: "A Cron Trigger on the admin Worker.",
        "on-read":
          "The admin Worker has no Cron Trigger, for example when the account is at its limit.",
      },
      liveDays: "Live data",
      liveDaysValue: "Last {days} days",
      liveDaysHint: "Older periods come from daily totals.",
    },
    enabled: {
      label: "Count visits",
      hint: "Adds a 1 KB script from your own site. No cookies, nothing stored on visitors' devices.",
    },
    unique: {
      label: "Count unique visitors",
      hint: "Still cookie-less: each visitor's IP address and browser details are combined with a random value that changes every day, and only the result is kept. The random value is deleted within 24 hours, so nobody can trace visitors or link them across days.",
      hintNeedsVisits:
        "Still cookie-less: each visitor's IP address and browser details are combined with a random value that changes every day, and only the result is kept. The random value is deleted within 24 hours, so nobody can trace visitors or link them across days. Turn on Count visits first.",
      offWarningTitle: "Saving deletes today's random value",
      offWarning:
        "Every site on this deployment shares it, so it is deleted for all of them at once. Unique visitors stop being counted here; on other sites that count them, someone who comes back later today may be counted twice.",
      confirmTitle: "Count unique visitors?",
      confirmDescription:
        "Unique visitors are counted from the moment you save. Earlier days stay without them.",
      confirmBannerTitle: "This is processing of personal data",
      confirmBanner:
        "Your visitors' IP address and browser details are combined with a random value that is deleted every day. Nothing is stored that identifies anyone, but this is processing of personal data: update your privacy policy.",
      confirmNotice: "Add this to your privacy policy",
      confirm: "Count unique visitors",
    },
    vitals: {
      label: "Measure page speed",
      hint: "Core Web Vitals from a sample of page views.",
      cost: "Adds about {percent}% more requests to the site.",
      costOff: "No extra requests.",
      options: {
        "0": "Off",
        "20": "1 in 20",
        "10": "1 in 10",
        "5": "1 in 5 (default)",
        "2": "1 in 2",
        "1": "Every page view",
      },
    },
    retention: {
      label: "Keep daily totals",
      hint: "Cloudflare keeps raw visits for 3 months (90 days on your own machine); daily totals stay as long as you choose.",
      options: {
        forever: "Forever (default)",
        "1825": "5 years",
        "730": "2 years",
        "365": "1 year",
      },
      days: "{days} days",
    },
    plan: {
      label: "Cloudflare plan",
      hint: "Only used to warn you before visits approach the Workers Free limit of 100,000 requests a day. Cloudhal can't read your plan.",
      options: { unknown: "Not sure", free: "Workers Free", paid: "Workers Paid" },
    },
    notice: {
      title: "Privacy notice for your site",
      hint: "Add it to your privacy policy. It follows the switches above.",
      hintUnsaved:
        "Add it to your privacy policy. It follows the switches above. It already reflects your unsaved changes.",
      languages: "Language of the notice",
      copy: "Copy notice",
      copied: "Privacy notice copied",
      heading: "Analytics",
      base: "This site counts visits with its own cookie-free analytics, hosted with the rest of the site. We record which pages are viewed, the website or campaign that referred you (the domain name only), your country, and your device type and browser family. We do not use cookies or similar storage, do not store your IP address or browser details, and do not follow you across websites.",
      unique:
        "To count unique visitors, your IP address and browser details are combined with a random value that is deleted every 24 hours, and only the result is kept; it cannot be traced back to you or linked across days. If your browser sends Global Privacy Control or Do Not Track, we count the visit but skip this step.",
      legal: "This is information, not legal advice.",
    },
    conflictTitle: "These settings changed somewhere else",
    conflictDescription:
      "Someone saved this site's analytics settings after you opened them. Load the latest version, check your change and save again.",
    loadLatest: "Load latest",
    failed: "Couldn't save the analytics settings",
    saved: "Analytics settings saved",
    savedPurged: "The site picks up the change within a minute.",
    savedNotPurged: "The settings are saved; cached pages pick them up as they expire.",
    savedSaltDeleted: "Today's random value was deleted for every site on this deployment.",
    keys: {
      missing: "No analytics",
      missingHint:
        "This key was made before agents could read analytics, or without that scope. Keys never gain access on their own: allow it to let the agent read site analytics (totals only, no personal data).",
      allow: "Allow analytics",
      allowed: "Analytics allowed",
      allowedDescription: "{name} can read site analytics from its next call.",
      failed: "Couldn't allow analytics",
      ownerCannot: "{name}'s role can't read analytics, so their keys can't either.",
    },
  },
} as const;
