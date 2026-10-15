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
    chat: {
      title: "AI ile kur",
      description:
        "Bu sayfada ne olması gerektiğini anlatın. Sitenin modeli taslağı adım adım kurar; doğru görününce siz yayınlarsınız.",
      label: "Kurulum sohbeti",
      placeholder:
        "Lansmanımız için bir açılış sayfası: başlık ve düğmeli koyu bir giriş, üç özellik, sekmeli fiyatlandırma ve kısa bir SSS.",
      brief: "Sayfada neler olsun?",
      send: "Kur",
      stop: "Durdur",
      writing: "Yazılıyor: {components}…",
      thinking: "Düşünüyor…",
      fixing: "Reddedilenler düzeltiliyor…",
      done: "Taslağa {steps} adım uygulandı",
      doneRefused: "{steps} adım uygulandı; {refused} adım reddedilip modele geri gönderildi",
      nothing: "Hiçbir şey değişmedi",
      stopped: "Durduruldu",
      off: "Bu sitede AI kapalı",
      offHint: "Bir Yönetici, Ayarlar › AI bölümünden açıp bir model seçebilir.",
      unavailable: "Bu kurulum Workers AI'a ulaşamıyor",
      unavailableHint:
        "Cloudflare'de AI, Worker'ın bağlantısını kullanır; yerelde CLOUDFLARE_ACCOUNT_ID ve CLOUDHAL_AI_TOKEN ayarlayın.",
      settings: "Ayarları aç",
      pick: "Seç",
      picking: "Sayfadan bir parçaya tıklayın",
      pickLabel: "Değiştirilecek parçayı sayfadan seçin",
      pickHint: "Önizlemede bir bölüme ya da öğeye tıklayın; Escape ile çıkın.",
      scope: "Değişecek: {part}",
      scopeSection: "{index}. bölüm",
      scopeComponent: "{index}. bölümdeki {component} “{id}”",
      clearScope: "Bunun yerine tüm sayfayı değiştir",
      modelHint:
        "Build en iyi {model} ile çalışıyor: Cloudhal'ın model karşılaştırmasında her isteği tamamladı. Bir Yönetici bunu Ayarlar › AI bölümünden seçebilir.",
      errors: {
        ai_budget:
          "Bu sitenin bugünkü AI hakları bitti. Bir Yönetici, Ayarlar › AI bölümünden günlük sınırı artırabilir.",
        ai_busy: "Size ait başka bir AI işi hâlâ çalışıyor.",
        ai_off: "Bu sitede AI kapalı. Bir Yönetici, Ayarlar › AI bölümünden açabilir.",
        ai_model_unavailable:
          "Seçilen model kullanılamıyor. Bir Yönetici, Ayarlar › AI bölümünden başka bir model seçebilir.",
        ai_rate_limited: "Workers AI şu anda yoğun. Biraz sonra yeniden deneyin.",
        ai_unavailable: "Bu kurulum Workers AI'a ulaşamıyor.",
        ai_failed: "Model işini bitiremedi. O ana kadar kurduğu her şey taslakta duruyor.",
      },
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
