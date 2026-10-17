/** German `commentsSettings.*` (see `commentsSettings.en.ts`). Machine-translated (AI), awaiting human review. */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"commentsSettings"> = {
  commentsSettings: {
    title: "Kommentare",
    description:
      "Lass Leser Artikel kommentieren. Jeder Gastkommentar wartet auf eine Person, bevor ihn jemand sieht.",
    status: { on: "An", off: "Aus", unavailable: "Nicht verfügbar" },
    noAccessTitle: "Du kannst die Kommentareinstellungen nicht sehen",
    unavailableTitle: "Kommentare sind auf diesem Server nicht verfügbar",
    unavailableDescription:
      "Diese Bereitstellung läuft ohne Leserkommentare (kein CLOUDHAL_COMMENTS_KEY, oder comments.available ist in cloudhal.json false).",
    enabled: {
      label: "Kommentare annehmen",
      hint: "Leser können die Sammlungen unten kommentieren. Ihre Kommentare warten auf Freigabe; nichts ist öffentlich, bis jemand es freigibt.",
    },
    collections: {
      label: "Sammlungen",
      hint: "Wo Leser kommentieren können. Jede Sammlung kann Threads nach eigenem Zeitplan schließen.",
      closeAfter: "Threads in {collection} schließen",
      sameAsSite: "Wie die Website",
    },
    showWhenOff: {
      label: "Freigegebene Kommentare sichtbar lassen, während Kommentare aus sind",
      hint: "Das Ausschalten der Kommentare stoppt dann nur neue; die Unterhaltung bleibt auf der Seite.",
    },
    closeAfter: {
      label: "Threads schließen nach",
      hint: "Gezählt ab dem Veröffentlichungsdatum jedes Artikels. Ein Artikel kann das in seiner Kommentare-Karte überschreiben.",
      never: "Nie",
      days: "{days} Tagen",
      year: "1 Jahr",
    },
    protection: {
      legend: "Bot-Schutz",
      pow: "Proof of Work",
      powHint:
        "Der Browser des Lesers rechnet ein paar hundert Millisekunden. Keine Dritten, nichts zu lösen.",
      powBadge: "Standard",
      turnstile: "Cloudflare Turnstile",
      turnstileHint:
        "Fügt Seiten mit offenen Kommentaren das Skript von Cloudflare hinzu. Benötigt einen Site Key und das zugehörige Secret.",
      siteKey: "Turnstile Site Key",
      siteKeyHint: "Aus dem Turnstile-Widget in deinem Cloudflare-Dashboard.",
      siteKeyInvalid:
        "Füge den Site Key genau so ein, wie er angezeigt wird (Buchstaben, Ziffern, _ und -).",
      secret: "Turnstile Secret Key",
      secretHint: "Nur schreibbar: Studio zeigt ihn nach dem Speichern nie wieder an.",
      secretSaved: "Gespeichert",
      secretSavedOn: "Gespeichert am {date}",
      secretMissing: "Noch nicht gespeichert",
      secretReplace: "Ersetzen",
      secretRemove: "Entfernen",
      secretSave: "Secret speichern",
      secretSavedToast: "Turnstile-Secret gespeichert",
      secretRemovedToast: "Turnstile-Secret entfernt",
      secretFailed: "Das Secret konnte nicht gespeichert werden",
      keysMissing:
        "Diese Bereitstellung hat keinen CLOUDHAL_COMMENTS_KEY, daher können keine Secrets gespeichert werden. Nutze Proof of Work oder füge den Schlüssel hinzu und stelle erneut bereit.",
      csp: "Seiten mit offenem Kommentarformular erlauben dann in ihrer Content Security Policy Skripte und Frames von challenges.cloudflare.com. Auf anderen Seiten ändert sich nichts.",
      needsSecret:
        "Speichere auch den Secret Key, sonst werden Kommentare abgelehnt, solange Turnstile an ist.",
    },
    noScript: {
      label: "Kommentare von Browsern ohne JavaScript annehmen",
      hint: "Leser mit ausgeschalteten Skripten können weiterhin über ein einfaches Formular posten, mit strengeren Limits.",
    },
    linkLimit: {
      label: "Links, ab denen ein Kommentar markiert wird",
      hint: "Kommentare mit mehr Links erhalten das Label „Links“. 0 bis 10.",
      invalid: "Verwende eine ganze Zahl von 0 bis 10.",
    },
    words: {
      watch: "Beobachtete Wörter",
      watchHint:
        "Kommentare mit diesen Wörtern erhalten das Label „Beobachtetes Wort“. Sie warten trotzdem wie alle anderen auf dich.",
      blocked: "Gesperrte Wörter",
      blockedHint:
        "Kommentare mit diesen Wörtern landen direkt im Spam. Der Abgleich ignoriert Groß-/Kleinschreibung und türkische Buchstaben mit Punkt.",
      invalid: "Höchstens 200 Wörter mit je bis zu 64 Zeichen.",
    },
    dailyCap: {
      label: "Pro Tag gespeicherte Kommentare",
      hint: "Darüber hinaus werden neue Kommentare bis Mitternacht UTC abgelehnt. Jeder Kommentar kostet etwa {rows} Datenbank-Schreibvorgänge, {cap} pro Tag sind also etwa {writes} Schreibvorgänge.",
      invalid: "Verwende eine ganze Zahl von 1 bis 100.000.",
      today: "Heute gespeichert",
      todayValue: "{used} von {cap}",
    },
    ai: {
      label: "Kommentare mit Workers AI labeln",
      hint: "Ein Modell in deinem Cloudflare-Konto schlägt Labels vor (Spam, toxisch, Frage…). Labels veröffentlichen oder verbergen nie etwas.",
      unavailable: "Auf dieser Bereitstellung noch nicht verfügbar.",
      confirmTitle: "Kommentare an Workers AI senden?",
      confirmDescription:
        "Der Text jedes neuen Kommentars wird an ein Workers-AI-Modell in deinem eigenen Cloudflare-Konto gesendet, um Labels vorzuschlagen. Namen und E-Mail-Adressen werden nicht gesendet.",
      confirmBanner:
        "Es läuft im kostenlosen Tageskontingent von Workers AI; darüber hinaus stoppt das Labeln bis zum nächsten Tag. Erwähne es in deiner Datenschutzerklärung (der Textbaustein unten tut das).",
      confirm: "KI-Labels einschalten",
    },
    retention: {
      title: "Aufbewahrung",
      hint: "Wie lange Cloudhal Kommentare aufbewahrt, die es nicht mehr anzeigt. Löschungen laufen stündlich.",
      pendingDays: "Unentschiedene ausstehende Kommentare",
      spamDays: "Spam",
      deletedDays: "Gelöschte Kommentare",
      hiddenDays: "Verborgene Kommentare",
      clientDataDays: "Netzwerk-Hashes und Challenge-IDs",
      resolvedReportDays: "Erledigte Meldungen und Begründungen",
      days: "{days} Tage",
      keep: "Bis zur Löschung behalten",
      sixMonths: "6 Monate",
      year: "1 Jahr",
    },
    notice: {
      title: "Datenschutzhinweis",
      hint: "Füge ihn in die Datenschutzseite deiner Website ein. Er folgt den Schaltern oben.",
      unsaved: "Er zeigt deine ungespeicherten Änderungen.",
      languages: "Sprache des Hinweises",
      heading: "Kommentare",
      base: "Wenn Sie einen Kommentar schreiben, speichern wir den Namen und den Text, den Sie übermitteln, sowie Ihre E-Mail-Adresse, falls Sie eine angeben. Ihre E-Mail-Adresse wird nie angezeigt und nur verwendet, um Anfragen zu Ihrem Kommentar zu bearbeiten. Um Missbrauch zu verhindern, bewahren wir eine unkenntlich gemachte Form Ihrer Netzwerkadresse bis zu 30 Tage lang auf; die Adresse selbst speichern wir nie. Kommentare werden geprüft, bevor sie erscheinen. Für Kommentare verwenden wir keine Cookies. Sie können uns jederzeit bitten, Ihren Namen oder Ihren Kommentar zu entfernen.",
      turnstile:
        "Zum Schutz vor Bots verwendet das Kommentarformular Cloudflare Turnstile, das Informationen über Ihren Browser und Ihre Verbindung gemäß der Datenschutzrichtlinie von Cloudflare verarbeitet.",
      ai: "Kommentare können von einem automatischen Klassifikator unseres Hosting-Anbieters Cloudflare geprüft werden, bevor eine Person sie prüft.",
      copy: "Hinweis kopieren",
      copied: "Hinweis kopiert",
      legal:
        "Information, keine Rechtsberatung. Du bist der Verantwortliche für die Daten deiner Leser.",
    },
    saved: "Kommentareinstellungen gespeichert",
    savedPurged: "Seiten mit Kommentaren werden innerhalb einer Minute aktualisiert.",
    failed: "Die Kommentareinstellungen konnten nicht gespeichert werden",
    conflictTitle: "Diese Einstellungen wurden anderswo geändert",
    conflictDescription:
      "Jemand hat die Kommentareinstellungen gespeichert, nachdem du sie geöffnet hast. Lade die neueste Fassung: deine anderen Änderungen bleiben erhalten.",
    loadLatest: "Neueste laden",
    keys: {
      missing: "Keine Kommentare",
      missingHint:
        "Dieser Schlüssel wurde erstellt, bevor Agents Leserkommentare lesen konnten, oder ohne diesen Bereich. Schlüssel erhalten nie von selbst Zugriff: Erlaube es, damit der Agent Kommentare lesen kann (nie E-Mail-Adressen). Freigeben, Antworten und Wiedereröffnen warten weiterhin auf eine Person.",
      allow: "Kommentare erlauben",
      allowed: "Kommentare erlaubt",
      allowedDescription: "{name} kann ab dem nächsten Aufruf Leserkommentare lesen.",
      failed: "Kommentare konnten nicht erlaubt werden",
      unsupported:
        "Dieser Server kann einem bestehenden Schlüssel noch keinen Kommentarzugriff hinzufügen. Erstelle einen neuen Schlüssel: Neue Schlüssel lesen Kommentare.",
      ownerCannot:
        "Die Rolle von {name} kann keine Kommentare lesen, daher kann es auch der Schlüssel nicht.",
      writeHint:
        "Dieser Schlüssel liest Leserkommentare und kann Inhalte ändern: Von Besuchern geschriebener Text erreicht einen Agent, der deine Website bearbeitet.",
      writeHintBadge: "Liest Kommentare, bearbeitet Inhalte",
    },
  },
};
