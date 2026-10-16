/** Turkish `appearanceColors.*` (see `appearanceColors.en.ts`). */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"appearanceColors"> = {
  appearanceColors: {
    preview: "Renk rolleri",
    light: "Açık",
    dark: "Koyu",
    heading: "Bir başlık",
    body: "Gövde metni böyle okunur, bir de",
    link: "bağlantı",
    button: "Düğme",
    accent: "Yeni",
    notes: "Kontrast için ayarlananlar",
    legacy:
      "Bu renkler temanın renk alanlarından geliyor. Koyu modu da olan, kontrastı denetlenmiş tam bir palet için bir çekirdek renk seç.",
    lightened: "açıldı",
    darkened: "koyulaştırıldı",
    repairPair:
      "{scheme}: {role}, {against} üstünde okunsun diye {steps} adım {direction} ({ratio}:1)",
    repairFill:
      "{scheme}: {role}, üstündeki {against} okunsun diye {steps} adım {direction} ({ratio}:1)",
    roles: {
      surface: "Sayfa",
      "surface-muted": "Soluk yüzey",
      "surface-raised": "Yükseltilmiş yüzey",
      "surface-inverse": "Ters yüzey",
      text: "Metin",
      "text-muted": "Soluk metin",
      "text-subtle": "Silik metin",
      "text-inverse": "Ters metin",
      border: "Kenarlık",
      "border-strong": "Belirgin kenarlık",
      brand: "Marka",
      "on-brand": "Marka üstü metin",
      accent: "Vurgu",
      "on-accent": "Vurgu üstü metin",
      link: "Bağlantı",
      focus: "Odak halkası",
      gradient: "Geçiş sonu",
    },
  },
};
