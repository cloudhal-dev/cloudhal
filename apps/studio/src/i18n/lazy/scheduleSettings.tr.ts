import type { NamespaceMessages } from "../namespaces.ts";

/** Turkish `scheduleSettings.*` (lazy namespace; keys from `scheduleSettings.en.ts`). */
export const messages: NamespaceMessages<"scheduleSettings"> = {
  scheduleSettings: {
    title: "Zamanlamalar",
    description:
      "Bu sitedeki zamanlanmış yayınlar, ambargolar ve otomasyonlar. Duraklatmak hepsini birden durdurur.",
    unavailable: "Bu sunucuda zamanlamalar kullanılamıyor.",
    timeZone: {
      label: "Saat dilimi",
      description:
        "Zamanlamalar, ambargolar ve otomasyonlar bu saate göre çalışır. Değiştirmek zamanlanmış her anı olduğu gibi korur.",
      placeholder: "Saat dilimlerinde ara",
      empty: "Eşleşen saat dilimi yok",
      clear: "Temizle",
      show: "Saat dilimlerini göster",
      useBrowser: "{zone} kullan",
      invalid: "Sunucu bu saat dilimini tanımıyor. Listeden birini seç.",
    },
    health: {
      label: "Zamanlayıcı",
      hint: "Yayın paketleri zamanlarından en fazla yaklaşık bir dakika sonra çalışır.",
      state: { running: "Çalışıyor", late: "Gecikmede", stopped: "Durdu", unknown: "Başlamadı" },
      lastTick: "Son tık {time}",
      never: "Hiç çalışmadı",
      modes: {
        cron: "Dakikalık bir cron uyandırıyor",
        alarm: "Bir Durable Object alarmı uyandırıyor",
        node: "Bir Node zamanlayıcısı uyandırıyor",
        request: "Yalnız istekler uyandırıyor",
        unknown: "Bildirilmedi",
      },
    },
    killSwitch: {
      label: "Zamanlamaları ve otomasyonları duraklat",
      hint: "Zamanı gelen yayın paketleri bekler (bir saat sonra kaçırılmış sayılır), otomasyonlar başlamaz, açık çalıştırmalar durur.",
      paused: "{time} zamanında {name} duraklattı",
      reasonShown: "“{reason}”",
      confirmTitle: "Bu sitedeki tüm zamanlamalar duraklatılsın mı?",
      confirmDescription:
        "Biri yeniden başlatana kadar zamanlanmış hiçbir şey yayınlanmaz ve hiçbir otomasyon çalışmaz. Bu sırada zamanı gelen yayın paketleri bir saat sonra kaçırılmış sayılır.",
      reason: "Neden",
      reasonPlaceholder: "Seçim gecesi: sonuçlar kesinleşene kadar her şey bekliyor",
      reasonHint: "Zamanlamalar sayfasında ve Etkinlik'te görünür.",
      pause: "Duraklat",
      resumeTitle: "Zamanlamalar yeniden başlatılsın mı?",
      resumeDescription:
        "Hâlâ bir saat içinde olan yayın paketleri gecikmeyle yayınlanır; otomasyonlar bir sonraki zamanlarında başlar.",
      resume: "Yeniden başlat",
      pausedToast: "Zamanlamalar duraklatıldı",
      resumedToast: "Zamanlamalar yeniden başladı",
    },
    cap: {
      label: "Günlük otomasyon yazmaları",
      hint: "Otomasyonların hepsinin birlikte bir günde (UTC) yapabileceği değişiklik sayısı.",
      used: "Bugün {cap} hakkın {used} tanesi kullanıldı",
      error: "1 ile 100.000 arasında bir tam sayı.",
      saved: "Günlük sınır kaydedildi",
    },
    conflict: "Bu ayarlar başka bir yerde değişti. En yenisini yükle ve yeniden dene.",
    reload: "En yenisini yükle",
    failed: "Zamanlama ayarları kaydedilemedi",
  },
};
