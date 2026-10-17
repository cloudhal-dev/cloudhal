/**
 * English `commentsSettings.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1, §2w):
 * loaded with site settings (Settings › Comments, in every locale for the disclosure snippet) and
 * the Agents page ("Allow comments"). The source of truth for its keys; `commentsSettings.tr.ts`
 * is typed against it.
 */
export const messages = {
  commentsSettings: {
    title: "Comments",
    description:
      "Let readers comment on articles. Every guest comment waits for a person before anyone sees it.",
    status: { on: "On", off: "Off", unavailable: "Not available" },
    noAccessTitle: "You can't see comment settings",
    unavailableTitle: "Comments aren't available on this server",
    unavailableDescription:
      "This deployment runs without reader comments (no CLOUDHAL_COMMENTS_KEY, or comments.available is false in cloudhal.json).",
    enabled: {
      label: "Accept comments",
      hint: "Readers can comment on the collections below. Their comments wait for approval; nothing is public until someone approves it.",
    },
    collections: {
      label: "Collections",
      hint: "Where readers can comment. Each collection can close threads on its own schedule.",
      closeAfter: "Close threads in {collection}",
      sameAsSite: "Same as the site",
    },
    showWhenOff: {
      label: "Keep approved comments visible while comments are off",
      hint: "Turning comments off then only stops new ones; the conversation stays on the page.",
    },
    closeAfter: {
      label: "Close threads after",
      hint: "Counted from each article's publish date. An article can override it in its Comments card.",
      never: "Never",
      days: "{days} days",
      year: "1 year",
    },
    protection: {
      legend: "Bot protection",
      pow: "Proof of work",
      powHint:
        "The reader's browser does a few hundred milliseconds of work. No third parties, nothing to solve.",
      powBadge: "Default",
      turnstile: "Cloudflare Turnstile",
      turnstileHint:
        "Adds Cloudflare's script to pages where comments are open. Needs a site key and its secret.",
      siteKey: "Turnstile site key",
      siteKeyHint: "From the Turnstile widget in your Cloudflare dashboard.",
      siteKeyInvalid: "Paste the site key exactly as shown (letters, digits, _ and -).",
      secret: "Turnstile secret key",
      secretHint: "Write-only: Studio never shows it again after you save it.",
      secretSavedOn: "Saved {date}",
      secretReplace: "Replace",
      secretRemove: "Remove",
      secretSave: "Save secret",
      secretSavedToast: "Turnstile secret saved",
      secretRemovedToast: "Turnstile secret removed",
      secretFailed: "Couldn't save the secret",
      keysMissing:
        "This deployment has no CLOUDHAL_COMMENTS_KEY, so secrets can't be stored. Use proof of work, or add the key and deploy again.",
      csp: "Pages with an open comment form then allow scripts and frames from challenges.cloudflare.com in their Content Security Policy. Nothing changes on other pages.",
      needsSecret: "Save the secret key too, or comments are refused while Turnstile is on.",
    },
    noScript: {
      label: "Accept comments from browsers without JavaScript",
      hint: "Readers with scripts off can still post through a plain form, under stricter limits.",
    },
    linkLimit: {
      label: "Links before a comment is labelled",
      hint: "Comments with more links get the “Links” label. 0 to 10.",
      invalid: "Use a whole number from 0 to 10.",
    },
    words: {
      watch: "Watch words",
      watchHint:
        "Comments with these words get the “Watch word” label. They still wait for you like any other.",
      blocked: "Blocked words",
      blockedHint:
        "Comments with these words go straight to spam. Matching ignores case and Turkish dotted letters.",
      invalid: "At most 200 words of up to 64 characters each.",
    },
    dailyCap: {
      label: "Comments stored per day",
      hint: "Past it, new comments are refused until midnight UTC. Each comment costs about {rows} database writes, so {cap} a day is about {writes} writes.",
      invalid: "Use a whole number from 1 to 100,000.",
      today: "Stored today",
      todayValue: "{used} of {cap}",
    },
    ai: {
      label: "Label comments with Workers AI",
      hint: "A model in your Cloudflare account suggests labels (spam, toxic, question…). Labels never publish or hide anything.",
      hintUnavailable:
        "A model in your Cloudflare account suggests labels (spam, toxic, question…). Labels never publish or hide anything. Not available on this deployment yet.",
      confirmTitle: "Send comments to Workers AI?",
      confirmDescription:
        "Each new comment's text is sent to a Workers AI model in your own Cloudflare account to suggest labels. Names and emails are not sent.",
      confirmBanner:
        "It runs within Workers AI's free daily allowance; past it, labelling stops until the next day. Mention it in your privacy notice (the snippet below does).",
      confirm: "Turn on AI labels",
    },
    retention: {
      title: "Retention",
      hint: "How long Cloudhal keeps comments it no longer shows. Deletions run every hour.",
      pendingDays: "Undecided pending comments",
      spamDays: "Spam",
      deletedDays: "Deleted comments",
      hiddenDays: "Hidden comments",
      clientDataDays: "Network hashes and challenge ids",
      resolvedReportDays: "Resolved reports and statements of reasons",
      days: "{days} days",
      keep: "Keep until deleted",
      sixMonths: "6 months",
      year: "1 year",
    },
    notice: {
      title: "Privacy notice",
      hint: "Paste it into your site's privacy page. It follows the switches above.",
      hintUnsaved:
        "Paste it into your site's privacy page. It follows the switches above. It shows your unsaved changes.",
      languages: "Notice language",
      heading: "Comments",
      base: "When you comment, we store the name and text you submit, and your email address if you give one. Your email is never shown and is used only to handle requests about your comment. To prevent abuse, we keep a scrambled form of your network address for up to 30 days; we never store the address itself. Comments are reviewed before they appear. We do not use cookies for comments. You can ask us to remove your name or your comment at any time.",
      turnstile:
        "To keep out bots, the comment form uses Cloudflare Turnstile, which processes information about your browser and connection under Cloudflare's privacy policy.",
      ai: "Comments may be checked by an automated classifier run by our hosting provider, Cloudflare, before a person reviews them.",
      copy: "Copy notice",
      copied: "Notice copied",
      legal: "Information, not legal advice. You are the controller of your readers' data.",
    },
    saved: "Comment settings saved",
    savedPurged: "Pages with comments update within a minute.",
    failed: "Couldn't save comment settings",
    conflictTitle: "These settings changed somewhere else",
    conflictDescription:
      "Someone saved comment settings after you opened them. Load the latest copy: your other changes stay.",
    loadLatest: "Load latest",
    keys: {
      missing: "No comments",
      missingHint:
        "This key was made before agents could read reader comments, or without that scope. Keys never gain access on their own: allow it to let the agent read comments (never emails). Approving, replying and reopening still wait for a person.",
      allow: "Allow comments",
      allowed: "Comments allowed",
      allowedDescription: "{name} can read reader comments from its next call.",
      failed: "Couldn't allow comments",
      unsupported:
        "This server can't add comment access to an existing key yet. Create a new key: new keys read comments.",
      ownerCannot: "{name}'s role can't read comments, so their key can't either.",
      writeHint:
        "This key reads reader comments and can change content: text written by visitors reaches an agent that edits your site.",
      writeHintBadge: "Reads comments, edits content",
    },
  },
} as const;
