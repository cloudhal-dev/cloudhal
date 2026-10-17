/** Turkish `aiSettings.*` (see `aiSettings.en.ts`). */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"aiSettings"> = {
  aiSettings: {
    title: "Yapay zekâ",
    description:
      "Editörler seçili metni Cloudflare Workers AI ile iyileştirebilir, kısaltabilir, çevirebilir ya da yeniden yazabilir. Sen açana kadar hiçbir şey gönderilmez.",
    unavailable: {
      title: "Bu kurulum henüz Workers AI'a ulaşamıyor",
      description:
        "cloudhal.json dosyasına \"ai\": '{}' ekleyip yeniden dağıt. Kendi sunucunda CLOUDFLARE_ACCOUNT_ID ve CLOUDHAL_AI_TOKEN değişkenlerini ayarla. Ayarları şimdiden seçebilirsin.",
    },
    enabled: {
      label: "Editörde yapay zekâ",
      hint: "Editörler seçili metinde “Yapay zekâya sor” menüsünü görür. Sonuç, ancak Değiştir'i seçerlerse metnin yerine geçer.",
    },
    model: {
      label: "Model",
      hint: "Kalite, hız ve fiyat modele göre değişir. Karar vermeden önce gerçek bir makalede dene.",
      placeholder: "Model ara",
      empty: "Eşleşen model yok",
      clear: "Temizle",
      show: "Modelleri göster",
      recommended: "Önerilen",
      notes: {
        default: "Cloudhal testlerinde sayfayı en güvenilir kuran model; Türkçe iyi yazar.",
        quality: "Daha güçlü yazım, daha yüksek fiyatla.",
        budget: "Hızlı ve ucuz; sayfa kurmada daha zayıf.",
        general: "Bilinen, genel amaçlı bir model.",
      },
      context: "{tokens} token bağlam",
      gone: "{model} artık Workers AI'da sunulmuyor. Başka bir model seç, yoksa yapay zekâ komutları başarısız olur.",
      catalogUnavailable: "Model listesi okunamadı; yalnızca önerilen modeller gösteriliyor.",
      privacyWorkers: "Seçili metin bu Cloudflare hesabındaki Workers AI'a gider.",
      privacyProvider: "Seçili metin AI Gateway üzerinden {provider} sağlayıcısına gider.",
    },
    limit: {
      label: "Günlük sınır",
      hint: "Bu sitenin her gün (UTC) çalıştırabileceği yapay zekâ komutu sayısı. 0 komutları durdurur.",
      error: "0 ile 10.000 arasında bir tam sayı",
      used: "Bugün {limit} komutun {used} tanesi kullanıldı",
    },
    advanced: "AI Gateway ve diğer sağlayıcılar",
    gateway: {
      label: "AI Gateway",
      hint: "İsteğe bağlı. Bu Cloudflare hesabındaki bir gateway yapay zekâ çağrılarını kaydeder, önbelleğe alır ve sınırlar.",
      placeholder: "my-gateway",
      error: "Küçük harf, rakam ve tire",
    },
    provider: {
      label: "Başka bir sağlayıcının modeli",
      hint: "sağlayıcı/model biçiminde, ör. openai/gpt-4.1-mini. Gateway'de saklanan anahtarlarla ya da birleşik faturalandırmayla çalışır; Cloudhal anahtar saklamaz.",
      placeholder: "openai/gpt-4.1-mini",
      error: "sağlayıcı/model biçiminde yaz",
      needsGateway: "Önce bir AI Gateway ayarla.",
    },
    saved: "Yapay zekâ ayarları kaydedildi",
    failed: "Yapay zekâ ayarları kaydedilemedi",
    conflict:
      "Bu ayarları bu arada başka biri değiştirdi. Onların sürümünü görmek için yeniden yükle.",
    reload: "Yeniden yükle",
  },
};
