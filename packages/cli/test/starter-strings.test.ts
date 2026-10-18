/**
 * The blog starter's own words (RFC-0033 §4a): every language it ships has every word, a language
 * it does not ship reads English (never a blank), and the site's `strings` setting goes over both.
 */
import { describe, expect, it } from "vitest";
import { themeSettings } from "../../../starters/blog/src/settings.ts";
import { strings } from "../../../starters/blog/src/strings.ts";

describe("blog starter strings", () => {
  it("ships Turkish with every English word, the not-found page included", () => {
    const en = strings("en");
    const tr = strings("tr");
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
    expect(tr.notFoundTitle).toBe("Sayfa bulunamadı");
    expect(strings("tr-TR").notFoundHome).toBe("Ana sayfaya dön");
    expect(strings("TR").search).toBe("Ara");
  });

  it("falls back to English for a language it does not ship", () => {
    for (const locale of ["de", "pt-BR", "ar", "toString", ""]) {
      const t = strings(locale);
      expect(t.notFoundTitle).toBe("Page not found");
      expect(t.notFoundText).toBeTruthy();
      expect(t.searchModal.kinds.article).toBe("Articles");
    }
  });

  it("puts the site's own words over the theme's, per language, plain strings only", () => {
    const own = [
      { locale: "de", notFoundTitle: "Seite nicht gefunden", notFoundHome: "Zur Startseite" },
      { locale: "tr", notFoundText: "Bu adreste bir şey yok." },
      { locale: "es", posts: "not a function", searchModal: "nope" },
    ];
    const de = strings("de-AT", own);
    expect(de.notFoundTitle).toBe("Seite nicht gefunden");
    expect(de.notFoundHome).toBe("Zur Startseite");
    expect(de.notFoundText).toBe(strings("en").notFoundText);
    expect(strings("tr", own).notFoundText).toBe("Bu adreste bir şey yok.");
    expect(strings("tr", own).notFoundTitle).toBe("Sayfa bulunamadı");
    const es = strings("es", own);
    expect(es.posts(2)).toBe("2 posts");
    expect(typeof es.searchModal).toBe("object");
  });

  it("lets the settings declare every not-found word", () => {
    const words = themeSettings.properties.strings as unknown as { items: { properties: object } };
    expect(Object.keys(words.items.properties)).toEqual(
      expect.arrayContaining(["notFoundTitle", "notFoundText", "notFoundHome", "notFoundSearch"]),
    );
  });
});
