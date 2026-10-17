/** German `analytics.*` (see `analytics.en.ts`). Machine-translated (AI), awaiting human review. */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"analytics"> = {
  analytics: {
    page: {
      title: "Analysen",
      description:
        "Besuche auf deiner Website, gezählt ohne Cookies und ohne personenbezogene Daten.",
    },
    refresh: "Analysen aktualisieren",
    noData: "Keine Daten",
    other: "Sonstige",
    gate: { title: "Analysen sind für Autoren und höher" },
    range: {
      group: "Zeitraum",
      today: "Heute",
      "7d": "7 Tage",
      "30d": "30 Tage",
      "90d": "90 Tage",
      "12m": "12 Monate",
      custom: "Benutzerdefiniert…",
      customTitle: "Benutzerdefinierter Zeitraum",
      apply: "Übernehmen",
      pickHint: "Wähle den ersten und den letzten Tag.",
      tooLong: "Wähle höchstens 2 Jahre.",
      timezone: "Tage sind in UTC",
      previousMonth: "Vorheriger Monat",
      nextMonth: "Nächster Monat",
      months: "Monate",
      dayToday: "Heute, {date}",
      daySelected: "{date}, ausgewählt",
      compare: "Vergleichen",
    },
    delta: {
      change: "{value} gegenüber dem vorherigen Zeitraum",
      flat: "Etwa wie im vorherigen Zeitraum",
    },
    chart: {
      timezone: "Zeiten in UTC",
      showTable: "Als Tabelle anzeigen",
      showChart: "Als Diagramm anzeigen",
      time: "Zeit (UTC)",
    },
    metrics: {
      pageviews: "Seitenaufrufe",
      visits: "Besuche",
      visitors: "Eindeutige Besucher",
      viewsPerVisit: "Aufrufe pro Besuch",
      previousPageviews: "Seitenaufrufe, vorheriger Zeitraum",
      visitsHint:
        "Ein Besuch beginnt, wenn jemand von einer anderen Website, einer Suche, einem Link oder durch Eintippen der Adresse kommt.",
      aboutVisits: "Über Besuche",
      visitorsHint:
        "Tägliche eindeutige Besucher, aufsummiert: Wer an einem anderen Tag wiederkommt, zählt erneut.",
      aboutVisitors: "Über eindeutige Besucher",
    },
    columns: {
      content: "Seite",
      channel: "Kanal",
      referrer: "Verweisquelle",
      country: "Land",
      share: "Anteil",
      status: "Status",
      requested: "Angefragter Pfad",
      hits: "Treffer",
      linkedFrom: "Verlinkt von",
      lastSeen: "Zuletzt gesehen",
      oldPath: "Alter Pfad",
      target: "Führt zu",
      crawler: "Crawler",
      kind: "Art",
      rendered: "Gerenderte Seiten",
    },
    traffic: {
      title: "Zugriffe",
      figures: "Zugriffe, {range}",
      chartDescription: "Seitenaufrufe {pageviews} und Besuche {visits}, {range}.",
      export: "CSV exportieren",
      partial:
        "Ein Teil dieses Zeitraums konnte nicht gelesen werden, daher können einige Zahlen zu niedrig sein.",
      estimated: "Einige Zahlen sind Schätzungen.",
    },
    content: {
      title: "Top-Inhalte",
      caption: "Top-Inhalte, {range}",
      showAll: "Alle anzeigen",
      empty: "Keine Seitenaufrufe in diesem Zeitraum",
      gone: "Existiert nicht mehr",
      kinds: { entry: "Artikel", page: "Seite", archive: "Archiv" },
    },
    sources: {
      title: "Quellen",
      caption: "Quellen, {range}",
      tabs: { channels: "Kanäle", referrers: "Verweisquellen", campaigns: "Kampagnen" },
      campaigns: { utmCampaign: "Kampagne", utmSource: "Quelle", utmMedium: "Medium" },
      empty: {
        channels: "Keine Besuche in diesem Zeitraum",
        referrers: "Keine Besuche kamen von anderen Websites",
        campaigns: "Keine Kampagnenbesuche",
      },
      campaignsHint:
        "Füge utm_source, utm_medium und utm_campaign zu den Links hinzu, die du teilst, um sie hier zu sehen.",
      referrersNote:
        "Nur der Name der Website wird gespeichert, nie die vollständige Adresse. Verweisquellen werden angezeigt, nicht verlinkt.",
    },
    channels: {
      direct: "Direkt",
      internal: "Intern",
      search: "Suche",
      social: "Soziale Medien",
      ai: "KI-Assistenten",
      email: "E-Mail",
      paid: "Bezahlt",
      referral: "Andere Websites",
    },
    countries: {
      title: "Länder",
      map: "Seitenaufrufe nach Land, {range}",
      other: "Andere Länder",
      empty: "Noch keine Länder",
      unknown: "Unbekannt",
      tor: "Tor",
      high: "Hoch",
      low: "Niedrig",
    },
    devices: {
      title: "Geräte",
      tabs: { device: "Gerät", browser: "Browser", os: "Betriebssystem" },
      empty: "Noch keine Geräte",
      desktop: "Desktop",
      mobile: "Mobil",
      tablet: "Tablet",
      bot: "Bots",
      unknown: "Unbekannt",
    },
    browsers: {
      chrome: "Chrome",
      edge: "Edge",
      firefox: "Firefox",
      safari: "Safari",
      samsung: "Samsung Internet",
      opera: "Opera",
      other: "Sonstige",
    },
    oses: {
      windows: "Windows",
      macos: "macOS",
      ios: "iOS",
      android: "Android",
      linux: "Linux",
      chromeos: "ChromeOS",
      other: "Sonstige",
    },
    vitals: {
      title: "Core Web Vitals",
      tabs: { all: "Alle", mobile: "Mobil", desktop: "Desktop" },
      metrics: {
        lcp: { short: "LCP", name: "Largest Contentful Paint" },
        inp: { short: "INP", name: "Interaction to Next Paint" },
        cls: { short: "CLS", name: "Cumulative Layout Shift" },
      },
      ratings: { good: "Gut", needsImprovement: "Verbesserungswürdig", poor: "Schlecht" },
      good: "Gute Seitenaufrufe",
      value: "p75 {p75} · {good} gut",
      p75Only: "p75 {p75}",
      noSamples: "Keine Stichproben",
      empty: "Keine Stichproben zur Seitengeschwindigkeit in diesem Zeitraum",
      off: "Die Seitengeschwindigkeit wird nicht gemessen",
      offDescription:
        "Aktiviere in den Analyse-Einstellungen die Stichproben zur Seitengeschwindigkeit, um LCP, INP und CLS zu sehen.",
      turnOn: "Analyse-Einstellungen",
      sample: "Aus 1 von {n} Seitenaufrufen. Gemessen in den Browsern deiner Besucher.",
      sampleEvery: "Aus jedem Seitenaufruf. Gemessen in den Browsern deiner Besucher.",
    },
    errors: {
      title: "Die Analysen konnten nicht geladen werden",
      busyTitle: "Der Analysedienst von Cloudflare ist ausgelastet",
      busyDescription:
        "Versuche es gleich noch einmal; vollständige Tage werden weiterhin aus den Tagessummen angezeigt.",
      retry: "Erneut versuchen",
      card: "Dies konnte nicht geladen werden",
      cardTitle: "Fehler und Weiterleitungen",
      tabs: { errors: "Defekte Links", redirects: "Weiterleitungen" },
      empty: {
        errors: "Keine defekten Links in diesem Zeitraum",
        redirects: "Keinen Weiterleitungen wurde gefolgt",
      },
      noReferrer: "Eingetippt oder extern",
      createRedirectFor: "Weiterleitung für {path} erstellen",
      createRedirect: "Weiterleitung erstellen…",
      note: "Enthält jeden Fehler, ob zwischengespeichert oder nicht. Angefragte Pfade sind das, was Besucher aufgerufen haben: Sie werden angezeigt, nie verlinkt.",
      redirectsNote:
        "Alte Adressen, die noch Besucher bringen, zum Beispiel nach einer Slug-Änderung.",
    },
    crawlers: {
      title: "KI- und Such-Crawler",
      cacheMisses: "Nur Cache-Fehltreffer",
      description:
        "Seiten, die für Crawler gerendert wurden, wenn der Cache nicht traf; zwischengespeicherte Antworten sind nicht sichtbar, das sind also Untergrenzen.",
      empty: "Keine Crawler-Renderings in diesem Zeitraum",
      classes: {
        ai: "KI",
        search: "Suche",
        social: "Soziale Medien",
        monitor: "Monitoring",
        other: "Sonstige",
      },
    },
    about: {
      title: "Über diese Daten",
      privacy: "Datenschutz",
      privacyHint:
        "Keine Cookies, keine gespeicherten IP-Adressen oder Browserdetails, nichts, was Besuchern über Websites hinweg folgt.",
      cookieless: "Ohne Cookies",
      uniqueVisitors: "Eindeutige Besucher",
      uniqueVisitorsHint:
        "Gezählt mit einem Zufallswert, der jeden Tag gelöscht wird, und nur, wenn der Inhaber der Website es aktiviert.",
      on: "An",
      off: "Aus",
      change: "In den Einstellungen ändern",
      source: "Quelle",
      estimated: "Einige Zahlen sind Schätzungen.",
      sources: { live: "Live", rollups: "Tagessummen", mixed: "Live und Tagessummen" },
      requests: "Anfragen durch Analysen gestern",
      requestsValue: "{used} von {limit} pro Tag bei Workers Free",
      requestsHint:
        "Seitenaufrufe und Stichproben zur Seitengeschwindigkeit senden jeweils eine Anfrage. Workers Paid hat kein Tageslimit.",
      signals: "Datenschutzsignale",
      signalsValue: "{share} der Seitenaufrufe",
      signalsHint:
        "Seitenaufrufe aus Browsern, die Global Privacy Control oder Do Not Track senden, werden gezählt, aber nie gehasht, eindeutige Besucher sind also eine Untergrenze.",
      cacheHits: "Cache-Treffer (geschätzt)",
      cacheHitsValue: "etwa {share}",
      cacheHitsHint:
        "1 − von der Website gerenderte Seiten ÷ Seitenaufrufe in diesem Zeitraum. Eine Schätzung: Besucher ohne JavaScript werden nicht als Seitenaufrufe gezählt.",
      budget: "Live-Abfragen heute",
      budgetValue: "{used} von {limit}",
      updated: "Tagessummen aktualisiert",
      rollupsScheduled: "Vollständige Tage werden stündlich aufsummiert; heute wird live gelesen.",
      rollupsOnRead: "Tagessummen werden berechnet, wenn du Analysen öffnest.",
    },
    banners: {
      notRunning: {
        title: "Analysen laufen auf diesem Deployment nicht",
        description:
          "Setze analytics.enabled in cloudhal.json und deploye erneut, um Besuche zu zählen.",
      },
      cantRead: {
        title: "Studio kann Besuche noch nicht lesen",
        description:
          "Besuche werden aufgezeichnet. Studio kann sie mit diesem Cloudflare-Tarif noch nicht lesen; sie werden 3 Monate aufbewahrt.",
      },
      quota: {
        title: "Analysen könnten dich über das Limit von Workers Free bringen",
        description:
          "Jeder Seitenaufruf sendet eine Anfrage, Stichproben zur Seitengeschwindigkeit senden weitere. Verringere die Stichprobenrate oder wechsle zu Workers Paid, wenn du dich dem Limit näherst.",
        meter: "Anfragen gestern",
        meterValue: "{used} von {limit} pro Tag",
        settings: "Analyse-Einstellungen",
      },
      budget: {
        title: "Live-Zahlen sind für heute pausiert",
        description:
          "Das heutige Abfragebudget ist aufgebraucht. Live-Zahlen werden um Mitternacht UTC fortgesetzt; vollständige Tage werden weiterhin angezeigt.",
      },
      siteOff: {
        title: "Analysen sind für diese Website deaktiviert",
        description:
          "Es werden keine neuen Besuche gezählt. Frühere Besuche werden unten weiterhin angezeigt.",
      },
    },
    filter: {
      title: "Nur {label} wird angezeigt",
      clear: "Alle Zugriffe anzeigen",
      kinds: {
        node: "Nur Besuche dieser Seite.",
        channel: "Nur Besuche aus diesem Kanal.",
        country: "Nur Besuche aus diesem Land.",
        device: "Nur Besuche von dieser Geräteart.",
      },
    },
    off: { turnOn: "In den Einstellungen aktivieren" },
    empty: {
      notRunning: {
        title: "Analysen laufen nicht",
        description:
          "Dieses Deployment zeichnet keine Besuche auf. Aktiviere Analysen in cloudhal.json und deploye dann.",
      },
      off: {
        title: "Analysen sind für diese Website deaktiviert",
        description:
          "Aktiviere sie, um Besuche mit einem 1 KB großen Skript von deiner eigenen Website zu zählen. Keine Cookies.",
      },
      cantRead: { title: "Studio kann Besuche noch nicht lesen" },
      noVisits: {
        title: "Noch keine Besuche",
        description:
          "Zahlen erscheinen etwa eine Minute nach dem ersten Besuch einer veröffentlichten Seite.",
        openSite: "Website öffnen",
      },
      noVisitsInRange: {
        title: "Keine Besuche in diesem Zeitraum",
        description:
          "An den gewählten Tagen hat niemand die Website besucht. Frühere Besuche sind vorhanden.",
        action: "Die letzten 12 Monate anzeigen",
      },
    },
    bots: {
      titleLikely: "Möglicher Bot-Traffic",
      titleWatch: "Ungewöhnlicher Anstieg der Seitenaufrufe",
      description:
        "{pageviews} Seitenaufrufe kamen in der Stunde ab {hour} UTC an, das {multiple}-Fache einer üblichen Stunde. Die Zahlen für diesen Zeitraum könnten durch Skripte, die sich als Besucher ausgeben, aufgebläht sein.",
      advice:
        "Prüfe die Top-Seiten und Verweisquellen dieses Tages. Wenn es wieder passiert, setze analytics.rateLimit in cloudhal.json und deploye erneut: Das Rate-Limiting-Binding von Cloudflare begrenzt dann die Seitenaufrufe pro Besucher auf deiner gesamten Website.",
      details: "Warum diese Warnung",
      note: "Dies ist eine Schätzung anhand von Mustern, kein Beweis. Sie vergleicht die geschäftigste Stunde der letzten 7 Tage dieses Zeitraums mit einer üblichen Stunde. Ein in Chat-Apps geteilter Beitrag, die keine Verweisquelle senden, kann genauso aussehen.",
      showDay: "Diesen Tag anzeigen",
      reasons: {
        hourlySpike:
          "{pageviews} Seitenaufrufe in der Stunde ab {hour} UTC: das {multiple}-Fache einer üblichen Stunde ({baseline}). Warnt ab dem {threshold}-Fachen.",
        directEntrances:
          "{share} der Besuche dieser Stunde kamen ohne Verweisquelle (eingetippt oder von einem Skript gesendet). Warnt ab {threshold}.",
        singleBrowser:
          "{share} der Seitenaufrufe dieser Stunde kamen von einem Browser, {browser}. Warnt ab {threshold}.",
        singlePage: "{share} der Seitenaufrufe dieser Stunde betrafen eine Seite: {page}.",
      },
    },
  },
};
