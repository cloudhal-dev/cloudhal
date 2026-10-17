/** German `build.*` (see `build.en.ts`). Machine-translated (AI), awaiting human review. */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"build"> = {
  build: {
    title: "Build · {title}",
    description:
      "Agents ändern diesen Entwurf mit dem Katalog des Themes; jeder Schritt erscheint hier, sobald er passiert.",
    backToEditor: "Zurück zum Editor",
    preview: "Live-Vorschau",
    connection: {
      live: "Live",
      connecting: "Verbinde…",
      lost: "Verbinde erneut…",
    },
    connect: {
      title: "Agent verbinden",
      description:
        "Richte einen beliebigen MCP-Client auf dieses Studio. Der Agent liest den Katalog und baut die Seite dann Schritt für Schritt; nichts wird veröffentlicht, bevor du es tust.",
      endpoint: "MCP-Endpunkt",
      steps: "Bitte deinen Agent,",
      step1: "get_catalog aufzurufen, um die Komponenten zu erhalten, die er verwenden darf",
      step2: "patch_draft mit JSON-Patch-Operationen auf dieser Seite aufzurufen",
      step3: "zu beheben, was als VALIDATION_FAILED zurückkommt, und erneut zu senden",
      pageId: "Seiten-ID",
    },
    chat: {
      title: "Mit KI bauen",
      description:
        "Beschreibe, was diese Seite enthalten soll. Das Modell der Website baut sie Schritt für Schritt im Entwurf; du veröffentlichst, wenn es passt.",
      label: "Build-Unterhaltung",
      placeholder:
        "Eine Landingpage für unseren Launch: ein dunkler Hero mit Überschrift und Button, drei Features, Preise in Tabs und eine kurze FAQ.",
      brief: "Was soll die Seite enthalten?",
      send: "Bauen",
      stop: "Stopp",
      writing: "Schreibt {components}…",
      thinking: "Denkt nach…",
      fixing: "Behebt, was abgelehnt wurde…",
      /** RFC-0021 21c: the model looks at its page in a browser once per turn. */
      lookedClean: "Seite im Browser angesehen: Alle Prüfungen bestanden",
      lookedIssues: "Seite im Browser angesehen: {checks} zu beheben",
      improving: "Verbessert, was es gesehen hat…",
      /** Components the model added but did not place on the page yet. */
      linking: "Platziert die hinzugefügten Teile…",
      checks: {
        "overflow-x": "seitliches Scrollen",
        "img-alt": "Bilder ohne Alternativtext",
        "img-broken": "defekte Bilder",
        "heading-order": "Reihenfolge der Überschriften",
        contrast: "Textkontrast",
        "empty-section": "leere Abschnitte",
        "tap-target": "kleine Tippflächen",
        "long-line": "lange Zeilen",
        "input-label": "Eingabefelder ohne Beschriftung",
        "chart-empty": "leere Diagramme",
      },
      done: "{steps} Schritte auf den Entwurf angewendet",
      doneRefused:
        "{steps} Schritte angewendet; {refused} abgelehnt und an das Modell zurückgeschickt",
      nothing: "Nichts geändert",
      stopped: "Gestoppt",
      off: "KI ist für diese Website deaktiviert",
      offHint:
        "Ein Administrator kann sie unter Einstellungen › KI aktivieren und ein Modell wählen.",
      unavailable: "Dieses Deployment kann Workers AI nicht erreichen",
      unavailableHint:
        "Auf Cloudflare nutzt die KI das Binding des Workers; lokal setze CLOUDFLARE_ACCOUNT_ID und CLOUDHAL_AI_TOKEN.",
      settings: "Einstellungen öffnen",
      /** RFC-0020 §6: picking a part of the page in the preview to aim the next brief at it. */
      pick: "Auswählen",
      picking: "Klicke auf einen Teil der Seite",
      pickLabel: "Wähle einen Teil der Seite, der geändert werden soll",
      pickHint:
        "Klicke in der Vorschau auf einen Abschnitt oder ein Element; Escape beendet die Auswahl.",
      scope: "Ändert {part}",
      scopeSection: "Abschnitt {index}",
      scopeComponent: "{component} „{id}“ in Abschnitt {index}",
      clearScope: "Stattdessen die ganze Seite ändern",
      /** RFC-0020 open question 7: the eval's pick for Build. */
      modelHint:
        "Build funktioniert am besten mit {model}: Es hat jede Aufgabe in Cloudhals Modell-Eval abgeschlossen. Ein Administrator kann es unter Einstellungen › KI auswählen.",
      errors: {
        ai_budget:
          "Die heutigen KI-Befehle für diese Website sind aufgebraucht. Ein Administrator kann das Tageslimit unter Einstellungen › KI erhöhen.",
        ai_busy: "Ein anderer KI-Auftrag von dir läuft noch.",
        ai_off:
          "KI ist für diese Website deaktiviert. Ein Administrator kann sie unter Einstellungen › KI aktivieren.",
        ai_model_unavailable:
          "Das gewählte Modell ist nicht verfügbar. Ein Administrator kann unter Einstellungen › KI ein anderes wählen.",
        ai_rate_limited: "Workers AI ist gerade ausgelastet. Versuche es gleich noch einmal.",
        ai_unavailable: "Dieses Deployment kann Workers AI nicht erreichen.",
        ai_failed:
          "Das Modell konnte nicht fertig werden. Was es bisher gebaut hat, bleibt im Entwurf.",
      },
    },
    activity: {
      title: "Aktivität",
      empty: "Noch nichts",
      emptyDescription:
        "Änderungen erscheinen hier, sobald ein Agent oder eine Person diese Seite speichert.",
      applied: "Angewendet",
      rejected: "Abgelehnt",
      changed: "{count, plural, one {# Abschnitt geändert} other {# Abschnitte geändert}}",
      unchanged: "Seitendetails geändert",
      operations: "{count} Operationen",
      refused: "{count, plural, one {# Problem zu beheben} other {# Probleme zu beheben}}",
      repair: "Repariert: {text}",
    },
  },
};
