import type { NamespaceMessages } from "../namespaces.ts";

/** Turkish `build.*` (lazy namespace; keys from `build.en.ts`). */
export const messages: NamespaceMessages<"build"> = {
  build: {
    title: "Kurulum · {title}",
    description:
      "Ajanlar bu taslağı temanın kataloğuyla değiştirir; her adım olduğu anda burada görünür.",
    backToEditor: "Editöre dön",
    preview: "Canlı önizleme",
    connection: {
      live: "Canlı",
      connecting: "Bağlanıyor…",
      lost: "Yeniden bağlanıyor…",
    },
    connect: {
      title: "Bir ajan bağlayın",
      description:
        "Herhangi bir MCP istemcisini bu Studio'ya yönlendirin. Ajan kataloğu okur, sonra sayfayı adım adım kurar; siz yayınlayana kadar hiçbir şey yayınlanmaz.",
      endpoint: "MCP adresi",
      steps: "Ajanınızdan isteyin:",
      step1: "kullanabileceği bileşenler için get_catalog çağırsın",
      step2: "bu sayfada JSON Patch işlemleriyle patch_draft çağırsın",
      step3: "VALIDATION_FAILED dönen yerleri düzeltip yeniden göndersin",
      pageId: "Sayfa kimliği",
    },
    activity: {
      title: "Etkinlik",
      empty: "Henüz bir şey yok",
      emptyDescription:
        "Bir ajan ya da kişi bu sayfayı kaydettiği anda değişiklikler burada görünür.",
      applied: "Uygulandı",
      rejected: "Reddedildi",
      changed: "{count} bölüm değişti",
      changedOne: "1 bölüm değişti",
      unchanged: "Sayfa bilgileri değişti",
      operations: "{count} işlem",
      refused: "Düzeltilecek {count} sorun",
      refusedOne: "Düzeltilecek 1 sorun",
      repair: "Onarıldı: {text}",
    },
  },
};
