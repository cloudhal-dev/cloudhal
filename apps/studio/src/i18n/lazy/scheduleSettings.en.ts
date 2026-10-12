/**
 * English `scheduleSettings.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1, §2x):
 * site settings' "Time zone" field and the Schedules section (scheduler health, the kill switch, the
 * daily automation write cap). The source of truth for its keys; `scheduleSettings.tr.ts` is typed
 * against it.
 */
export const messages = {
  scheduleSettings: {
    title: "Schedules",
    description:
      "Scheduled publishing, embargoes and automations on this site. Pausing stops them all at once.",
    unavailable: "Schedules aren't available on this server.",
    timeZone: {
      label: "Time zone",
      description:
        "Schedules, embargoes and automations run on this clock. Changing it keeps every scheduled instant as it is.",
      placeholder: "Search time zones",
      empty: "No time zone matches",
      clear: "Clear",
      show: "Show time zones",
      useBrowser: "Use {zone}",
      invalid: "The server doesn't know this time zone. Pick one from the list.",
    },
    health: {
      label: "Scheduler",
      hint: "Releases run within about a minute of their time.",
      state: { running: "Running", late: "Late", stopped: "Stopped", unknown: "Not started" },
      lastTick: "Last tick {time}",
      never: "Never ran",
      modes: {
        cron: "Woken by an every-minute cron",
        alarm: "Woken by a Durable Object alarm",
        node: "Woken by a Node timer",
        request: "Woken by requests only",
        unknown: "Not reported",
      },
    },
    killSwitch: {
      label: "Pause schedules and automations",
      hint: "Due releases wait (and are missed after an hour), automations don't start, open runs stop.",
      paused: "Paused {time} by {name}",
      reasonShown: "“{reason}”",
      confirmTitle: "Pause every schedule on this site?",
      confirmDescription:
        "Nothing scheduled publishes and no automation runs until someone resumes them. Releases due in the meantime are missed after an hour.",
      reason: "Reason",
      reasonPlaceholder: "Election night: holding everything until the results are final",
      reasonHint: "Shown on the Schedules page and in Activity.",
      pause: "Pause",
      resumeTitle: "Resume schedules?",
      resumeDescription:
        "Releases that are still within the hour publish, late; automations start at their next time.",
      resume: "Resume",
      pausedToast: "Schedules paused",
      resumedToast: "Schedules resumed",
    },
    cap: {
      label: "Daily automation writes",
      hint: "Changes automations may make per day (UTC), across all of them.",
      used: "{used} of {cap} used today",
      error: "A whole number from 1 to 100,000.",
      saved: "Daily cap saved",
    },
    conflict: "These settings changed somewhere else. Load the latest and try again.",
    reload: "Load the latest",
    failed: "Couldn't save the schedule settings",
  },
} as const;
