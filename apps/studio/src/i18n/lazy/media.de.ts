/** German `media.*` (see `media.en.ts`). Machine-translated (AI), awaiting human review. */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"media"> = {
  media: {
    search: "Titel, Alternativtexte, Bildunterschriften, Urheberangaben und Dateinamen durchsuchen",
    views: { grid: "Raster", list: "Liste" },
    filters: {
      label: "Filter",
      kind: "Art",
      allKinds: "Alle Arten",
      show: "Anzeigen",
      active: "Alle Dateien",
      unused: "Unbenutzt",
      missingAlt: "Ohne Alternativtext",
      agents: "Von Agents hinzugefügt",
      retired: "Ausgemustert",
      clear: "Filter zurücksetzen",
    },
    kinds: {
      image: "Bild",
      video: "Video",
      audio: "Audio",
      document: "Dokument",
      data: "Daten",
      other: "Datei",
    },
    kindsPlural: {
      image: "Bilder",
      video: "Video",
      audio: "Audio",
      document: "Dokumente",
      data: "Datendateien",
      other: "Andere Dateien",
    },
    columns: {
      file: "Datei",
      type: "Typ",
      size: "Größe",
      usage: "Verwendet in",
      added: "Hinzugefügt",
    },
    usage: {
      none: "Unbenutzt",
      one: "An 1 Stelle verwendet",
      many: "An {count} Stellen verwendet",
    },
    badges: {
      retired: "Ausgemustert",
      retiredHint:
        "In der Mediathek und in Auswahldialogen ausgeblendet, damit nichts Neues sie verwendet. Seiten, die sie bereits zeigen, zeigen sie weiterhin.",
      missingAlt: "Kein Alternativtext",
      missingAltShort: "Kein Alt",
      missingAltHint:
        "Dieses Bild hat keinen Alternativtext und ist nicht als dekorativ markiert. Screenreader würden nur den Dateinamen vorlesen.",
      agent: "Agent",
      agentHint: "Hinzugefügt vom Agent {name}",
    },
    empty: {
      title: "Noch keine Dateien",
      description:
        "Lade Bilder, Videos, Audio, PDFs und Datendateien hoch oder zieh sie hierher. Sie gehen mit der nächsten Veröffentlichung live.",
      filteredTitle: "Keine passenden Dateien",
      filteredDescription:
        "Probiere eine andere Art oder einen anderen Filter, oder suche nach etwas anderem.",
    },
    loaded: "{count} Dateien werden angezeigt",
    loadMore: "Mehr laden",
    allLoaded: "Alle Dateien werden angezeigt",
    preview: {
      empty: "Keine Vorschau",
      loading: "Vorschau wird geladen…",
      broken: "Die Vorschau konnte nicht geladen werden",
    },
    drop: {
      title: "Dateien hier ablegen",
      description:
        "Bilder bis 20 MB, PDFs bis 50 MB, Video, Audio und Daten bis 100 MB · bis zu 20 Dateien auf einmal",
      imageDescription: "JPEG, PNG, WebP, AVIF, GIF oder SVG, bis 20 MB",
      choose: "Dateien auswählen",
      release: "Loslassen zum Hochladen",
    },
    upload: {
      button: "Hochladen",
      title: "Dateien hochladen",
      description:
        "Beschreibe jedes Bild für Menschen, die es nicht sehen können, oder markiere es als dekorativ. Fotos verlieren ihren Aufnahmeort und ihre Kameradaten, sofern du sie nicht behältst. Nichts ist öffentlich, bevor die Website veröffentlicht wird.",
      queueLabel: "Dateien",
      summary: "{done} von {total} hochgeladen",
      start: "{count, plural, one {# Datei hochladen} other {# Dateien hochladen}}",
      inlineStart: "Hochladen",
      done: "Fertig",
      alt: "Alternativtext",
      altPlaceholder: "Was das Bild zeigt, z. B. Fähren überqueren im Morgengrauen den Bosporus",
      altHint: "Wird von Screenreadern vorgelesen und von Suchmaschinen genutzt.",
      altRequired: "Beschreibe das Bild oder markiere es als dekorativ.",
      decorative: "Dekorativ – es enthält nichts, was Lesenden fehlen würde",
      gpsTitle: "Dieses Foto enthält den Ort, an dem es aufgenommen wurde",
      gpsDescription:
        "Ort und Kameradaten werden beim Hochladen entfernt. Behalte sie nur, wenn du sie veröffentlichen möchtest.",
      keepMetadata: "Ort und Kameradaten behalten",
      progress: "Wird hochgeladen",
      percent: "{percent} %",
      remove: "{name} entfernen",
      cancel: "Hochladen von {name} abbrechen",
      status: {
        preparing: "Datei wird geprüft…",
        ready: "Bereit zum Hochladen",
        uploading: "Wird hochgeladen…",
        done: "Hochgeladen",
        existing: "Bereits in deiner Mediathek",
        error: "Nicht hochgeladen",
        canceled: "Abgebrochen",
      },
      errors: {
        unsupported_type:
          "Dieser Dateityp wird nicht akzeptiert. Bilder: JPEG, PNG, WebP, AVIF, GIF, SVG; Video: MP4, WebM; Audio: MP3, M4A, Ogg, WAV; PDF; Daten: CSV, TSV, JSON, NDJSON, Parquet.",
        heic: "HEIC-Fotos können von Browsern nicht angezeigt werden. Wandle sie zuerst in JPEG um.",
        type_mismatch: "Der Inhalt der Datei passt nicht zu ihrem Typ oder ihrer Endung.",
        too_large: "Diese Datei ist größer als das Limit für ihren Typ.",
        too_many_pixels:
          "Dieses Bild ist zu groß: höchstens 12.000 Pixel pro Seite und 50 Megapixel.",
        svg_unsafe:
          "SVG-Dateien dürfen keine Skripte, Event-Handler oder externen Verweise enthalten. Entferne sie und lade die Datei erneut hoch.",
        metadata_unsupported:
          "Diese AVIF-Datei enthält Orts- oder Kameradaten, die noch nicht entfernt werden können. Exportiere sie erneut ohne Metadaten.",
        quota_exceeded:
          "Der Medienspeicher dieser Website ist voll. Lösche unbenutzte Dateien oder bitte den Betreiber um mehr Speicherplatz.",
        purged:
          "Diese Datei wurde auf dieser Website entfernt. Ein Inhaber muss sie zuerst wieder zulassen.",
        alt_required: "Beschreibe das Bild oder markiere es als dekorativ.",
        checksum_required: "Die Datei konnte nicht geprüft werden. Versuche es erneut.",
        checksum_mismatch:
          "Die Datei hat sich während des Hochladens geändert. Versuche es erneut.",
        size_mismatch: "Das Hochladen war unvollständig. Versuche es erneut.",
        upload_expired:
          "Das Hochladen hat zu lange gedauert und der Link ist abgelaufen. Versuche es erneut.",
        upload_used: "Dieser Upload-Link wurde bereits verwendet. Versuche es erneut.",
        too_many_uploads:
          "Du hast zu viele wartende Uploads. Schließe sie ab oder warte ein paar Minuten.",
        too_many_files: "Höchstens 20 Dateien auf einmal. Füge diese nach den anderen hinzu.",
        retry: "Der Speicher war ausgelastet. Versuche es gleich noch einmal.",
        network: "Die Verbindung wurde unterbrochen. Versuche es erneut.",
        unknown: "Etwas ist schiefgelaufen. Versuche es erneut.",
      },
    },
    picker: {
      title: "Bild auswählen",
      description: "Wähle ein Bild aus der Mediathek oder lade ein neues hoch.",
      library: "Mediathek",
      upload: "Hochladen",
      search: "Bilder durchsuchen",
      empty: "Noch keine Bilder",
      noMatch: "Keine passenden Bilder",
      emptyDescription: "Lade ein Bild hoch, um es hier zu verwenden.",
      use: "Dieses Bild verwenden",
    },
    field: {
      choose: "Aus der Mediathek wählen",
      chooseHint: "Oder lade dort ein neues Bild hoch.",
      change: "Ändern",
      fromLibrary: "Aus deiner Mediathek",
      missing: "Diese Datei ist nicht mehr in der Mediathek.",
      altForUse: "Alternativtext für diese Verwendung",
      altForUseHint: "Leer lassen, um den der Datei zu verwenden: „{alt}“.",
      altNoneHint:
        "Die Datei hat noch keinen Alternativtext. Füge ihn hier oder in der Mediathek hinzu.",
      altDecorativeHint:
        "Die Datei ist als dekorativ markiert. Füge hier einen Alternativtext hinzu, wenn diese Verwendung einen braucht.",
      useAddress: "Stattdessen eine Bildadresse verwenden",
      addressReplaces: "Eine eingegebene Adresse ersetzt das Bild aus der Mediathek.",
      brokenAsset: "Die Datei konnte nicht geladen werden. Möglicherweise wurde sie entfernt.",
    },
    detail: {
      openFile: "Datei öffnen",
      preview: "Vorschau",
      focal: {
        title: "Fokuspunkt",
        hint: "Klicke auf das Motiv oder nutze die Pfeiltasten",
        position: "Links {x} %, oben {y} %",
        unset: "Nicht gesetzt: Zuschnitte behalten die Mitte",
        clear: "Fokuspunkt entfernen",
        previews: "Was Zuschnitte behalten",
      },
      details: "Beschreibung und Urheberangabe",
      detailsImage:
        "Wie das Bild überall beschrieben wird, wo es erscheint. Eine Seite kann für eine einzelne Verwendung trotzdem einen eigenen Alternativtext angeben.",
      detailsFile: "Wie die Datei überall benannt und ausgewiesen wird, wo sie erscheint.",
      defaultLocale: "{locale} (Standard)",
      title: "Titel",
      titleHint:
        "Wird in Download-Listen angezeigt und dient zum Finden der Datei in der Mediathek.",
      alt: "Alternativtext",
      altHint:
        "Beschreibe, was das Bild zeigt. Screenreader lesen es Menschen vor, die das Bild nicht sehen können.",
      altHintLocale:
        "In dieser Sprache optional; ist es leer, wird der Text in {locale} verwendet.",
      decorative: "Dekoratives Bild",
      decorativeHint:
        "Dekorative Bilder tragen keine Information (eine Textur, ein Trenner) und werden von Screenreadern übersprungen.",
      caption: "Bildunterschrift",
      captionHint: "Die Standard-Bildunterschrift unter dieser Datei, wo sie gezeigt wird.",
      credit: "Urheberangabe",
      creditPlaceholder: "Foto: Ayşe Yılmaz",
      creditHint: "Wer sie erstellt hat; wird daneben angezeigt.",
      license: "Lizenz",
      licenseHint: "Die Bedingungen, unter denen andere sie weiterverwenden dürfen.",
      address: "Adresse",
      addressDescription:
        "Die öffentliche URL der Datei. Ihr erster Teil ist der Fingerabdruck der Datei, die Adresse ändert sich also nur, wenn sich die Bytes ändern.",
      slug: "Dateiname",
      slugHint:
        "Kleingeschriebene Wörter, mit Bindestrichen verbunden. Alte Links funktionieren weiter: Sie leiten weiter.",
      file: "Datei",
      dimensions: "Abmessungen",
      sha256: "SHA-256",
      sha256Hint: "Die Prüfsumme, die bei jedem Download angezeigt wird.",
      originalSha256: "SHA-256 beim Hochladen",
      originalSha256Hint: "Bevor Ort und Kameradaten entfernt wurden.",
      publicUrl: "Öffentliche URL",
      publicUrlHint: "Live nach der nächsten Veröffentlichung, mit ihrer Prüfsummendatei.",
      download: "Herunterladen",
      sourceTitle: "Hinzugefügt von",
      source: {
        upload: "Hochgeladen als {name}",
        fetch: "Abgerufen von {url}",
        import: "Importiert aus {from}",
        link: "Von einer anderen Website verlinkt",
      },
      id: "ID",
      notOwn:
        "Diese Datei wurde von jemand anderem hinzugefügt. Ihr Uploader sowie Redakteure und höher können sie ändern.",
      saved: "Dateidetails gespeichert",
      retired: "Datei ausgemustert",
      retiredHint: "Seiten, die sie bereits zeigen, zeigen sie weiterhin.",
      restored: "Datei wiederhergestellt",
      deleted: "{name} gelöscht",
      retiredTitle: "Diese Datei ist ausgemustert",
      retiredDescription:
        "Sie ist in der Standardansicht der Mediathek und in Auswahldialogen ausgeblendet. Seiten, die sie bereits zeigen, zeigen sie weiterhin.",
      resourceType: "Datei",
      errors: {
        altRequired: "Beschreibe das Bild in der Standardsprache oder markiere es als dekorativ.",
        altTooLong: "Höchstens 500 Zeichen.",
        tooLong: "Höchstens {max} Zeichen.",
        slug: "Verwende Kleinbuchstaben, Ziffern und Bindestriche.",
      },
    },
    licenses: {
      none: "Keine Lizenz angegeben",
      spdx: "Andere SPDX-Lizenz…",
      url: "Link zu einer Lizenz…",
      spdxId: "SPDX-Kennung",
      spdxHint: "Zum Beispiel CC-BY-NC-SA-4.0 oder MIT OR Apache-2.0.",
      invalidSpdx: "Gib eine SPDX-Kennung wie CC-BY-4.0 ein.",
      urlLabel: "Lizenzadresse",
      invalidUrl: "Gib eine https://-Adresse ein.",
      name: "Lizenzname",
      ids: {
        "CC-BY-4.0": "CC BY 4.0",
        "CC-BY-SA-4.0": "CC BY-SA 4.0",
        "CC-BY-NC-4.0": "CC BY-NC 4.0",
        "CC0-1.0": "CC0 (gemeinfrei)",
        "LicenseRef-AllRightsReserved": "Alle Rechte vorbehalten",
        MIT: "MIT",
        "Apache-2.0": "Apache 2.0",
      },
    },
    uses: {
      title: "Verwendet in",
      empty: "Nirgends verwendet",
      emptyDescription:
        "Keine Seite, kein Artikel und keine Kategorie zeigt diese Datei. Unbenutzte Dateien können gelöscht werden.",
      columns: { node: "Wo", slot: "Als" },
      kinds: { contentEntry: "Artikel", page: "Seite", term: "Kategorie oder Schlagwort" },
      slots: {
        cover: "Titelbild",
        social: "Teilen-Bild",
        section: "Bild in einem Abschnitt",
        termImage: "Archivbild",
        text: "Im Text",
        logo: "Website-Logo",
      },
    },
    danger: {
      retireTitle: "Diese Datei ausmustern",
      retireDescription:
        "Blende sie in der Mediathek und in Auswahldialogen aus, damit nichts Neues sie verwendet. Seiten, die sie zeigen, zeigen sie weiterhin.",
      retire: "Ausmustern",
      restoreTitle: "Diese Datei wiederherstellen",
      restoreDescription: "Mache sie in der Mediathek und in Auswahldialogen wieder verfügbar.",
      restorePurged: "Entfernt: Lasse den Inhalt wieder zu, bevor du ihn wiederherstellst.",
      restore: "Wiederherstellen",
      deleteTitle: "Diese Datei löschen",
      deleteDescription:
        "Entferne sie aus der Mediathek. Frühere Snapshots behalten ihre Bytes, sodass das Zurücksetzen weiter funktioniert.",
      delete: "Datei löschen",
      inUse:
        "An {count} Stellen verwendet. Entferne zuerst diese Verwendungen oder mustere sie stattdessen aus.",
      takedownTitle: "Entfernen",
      takedownDescription:
        "Bei Urheberrechtshinweisen, personenbezogenen Daten oder rechtswidrigen Inhalten: Die Bytes werden gelöscht, sogar aus dem Verlauf.",
      takedown: "Entfernen…",
    },
    takedown: {
      title: "{name} entfernen?",
      description:
        "Ihre Bytes werden aus dem Speicher und aus jedem Snapshot gelöscht. Die Metadaten bleiben erhalten, damit der Verlauf nachvollziehbar bleibt.",
      warningTitle: "Das kannst du nicht rückgängig machen",
      warning:
        "Die Bytes können aus Cloudhal nicht wiederhergestellt werden. Behalte eine eigene Kopie, falls du sie brauchen könntest.",
      consequences: "Was passiert",
      points: {
        bytes: "Die Datei wird aus dem Speicher und aus jedem Snapshot gelöscht.",
        status:
          "Ihre Adresse antwortet mit 410 Gone oder, wenn ein rechtlicher Grund angegeben ist, mit 451 Unavailable For Legal Reasons.",
        retired: "Die Datei wird ausgemustert; Seiten, die sie zeigen, verlieren das Bild.",
        reupload: "Dieselben Bytes werden abgelehnt, bis ein Inhaber sie wieder zulässt.",
        caches:
          "Browser und Dienste, die bereits eine Kopie gespeichert haben, behalten sie womöglich.",
      },
      reason: "Grund",
      reasonPlaceholder: "Urheberrechtshinweis der Fotografin, eingegangen am 8. Oktober",
      reasonHint: "Wird mit deinem Namen im Aktivitätsprotokoll festgehalten.",
      reasonRequired: "Gib an, warum die Datei entfernt wird.",
      legal: "Dies ist eine rechtliche Verpflichtung (Antwort 451)",
      confirm: "Entfernen",
      ownerOnly: "Nur der Inhaber kann Dateien entfernen.",
      done: "Datei entfernt",
      done410: "Ihre Adresse antwortet jetzt mit 410 Gone.",
      done451: "Ihre Adresse antwortet jetzt mit 451 Unavailable For Legal Reasons.",
    },
    purged: {
      title410: "Diese Datei wurde entfernt",
      title451: "Diese Datei wurde aus rechtlichen Gründen entfernt",
      description: "Ihre Bytes sind aus dem Speicher und jedem Snapshot gelöscht. Grund: {reason}",
      lift: "Wieder zulassen",
      lifted: "Der Inhalt darf wieder hochgeladen werden",
      liftedHint: "Lade dieselbe Datei erneut hoch, um sie zurückzuholen.",
    },
  },
};
