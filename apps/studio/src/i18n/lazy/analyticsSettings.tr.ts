import type { NamespaceMessages } from "../namespaces.ts";

/** Turkish `analyticsSettings.*` (lazy namespace; keys from `analyticsSettings.en.ts`). */
export const messages: NamespaceMessages<"analyticsSettings"> = {
  analyticsSettings: {
    title: "İstatistikler",
    description:
      "Bu sitenin ziyaretleri, çerezsiz sayılır. Değişiklikler bir dakika içinde siteye yansır.",
    status: { on: "Açık", off: "Kapalı", notRunning: "Çalışmıyor" },
    noAccessTitle: "İstatistikleri göremezsin",
    notAvailableTitle: "Bu sunucu istatistik sunmuyor",
    notAvailableDescription:
      "Sunucu istatistik servisi olmadan çalışıyor. Ziyaretleri saymak için Cloudhal'ı güncelle ve yeniden deploy et.",
    deployment: {
      title: "Bu kurulum",
      offTitle: "Bu kurulumda istatistikler çalışmıyor",
      offDescription:
        "Site hiçbir ziyareti kaydetmiyor. cloudhal.json'da analytics.enabled'ı aç ve cloudhal deploy'u çalıştır; aşağıdaki ayarlar kayıt başlar başlamaz geçerli olur.",
      cantReadTitle: "Ziyaretler kaydediliyor ama Studio henüz okuyamıyor",
      cantReadDescription:
        "Bu Cloudflare hesabı, kurulumun Workers Analytics Engine verilerini geri okumasına henüz izin vermiyor. Hiçbir şey kaybolmaz: ziyaretler kaydedilmeye devam eder, okuma çalışana kadar İstatistikler elindeki günlük toplamları gösterir.",
      store: "Kaydedildiği yer",
      stores: {
        wae: "Workers Analytics Engine",
        sql: "Bu kurulumun veritabanı",
        none: "Hiçbir yer, kayıt yok",
      },
      reader: "Okunduğu yer",
      readers: {
        binding: "Analytics Engine SQL",
        sql: "Bu kurulumun veritabanı",
        none: "Henüz yok",
      },
      rollups: "Günlük toplamlar",
      rollupModes: {
        scheduled: "Saatte bir hesaplanır",
        "on-read": "Biri İstatistikler'i açtığında hesaplanır",
      },
      rollupHints: {
        scheduled: "Admin Worker'ındaki bir Cron Trigger ile.",
        "on-read": "Admin Worker'ının Cron Trigger'ı yok; örneğin hesap sınırına ulaşmış olabilir.",
      },
      liveDays: "Canlı veri",
      liveDaysValue: "Son {days} gün",
      liveDaysHint: "Daha eski dönemler günlük toplamlardan gelir.",
    },
    enabled: {
      label: "Ziyaretleri say",
      hint: "Kendi sitenden 1 KB'lık bir betik ekler. Çerez yok, ziyaretçilerin cihazında hiçbir şey saklanmaz.",
    },
    unique: {
      label: "Tekil ziyaretçileri say",
      hint: "Yine çerezsiz: her ziyaretçinin IP adresi ve tarayıcı bilgisi her gün değişen rastgele bir değerle birleştirilir, yalnızca sonuç saklanır. Rastgele değer 24 saat içinde silinir; böylece kimse ziyaretçilerin izini süremez ya da onları günler arasında eşleştiremez.",
      hintNeedsVisits:
        "Yine çerezsiz: her ziyaretçinin IP adresi ve tarayıcı bilgisi her gün değişen rastgele bir değerle birleştirilir, yalnızca sonuç saklanır. Rastgele değer 24 saat içinde silinir; böylece kimse ziyaretçilerin izini süremez ya da onları günler arasında eşleştiremez. Önce Ziyaretleri say'ı aç.",
      offWarningTitle: "Kaydetmek bugünün rastgele değerini siler",
      offWarning:
        "Bu kurulumdaki tüm siteler bu değeri paylaşır, bu yüzden hepsi için birden silinir. Burada tekil ziyaretçiler artık sayılmaz; tekil ziyaretçi sayan diğer sitelerde bugün yeniden gelen biri iki kez sayılabilir.",
      confirmTitle: "Tekil ziyaretçiler sayılsın mı?",
      confirmDescription:
        "Tekil ziyaretçiler kaydettiğin andan itibaren sayılır. Önceki günlerde bu bilgi olmaz.",
      confirmBannerTitle: "Bu, kişisel verinin işlenmesidir",
      confirmBanner:
        "Ziyaretçilerinin IP adresi ve tarayıcı bilgisi her gün silinen rastgele bir değerle birleştirilir. Kimseyi tanımlayan hiçbir şey saklanmaz, ama bu yine de kişisel verinin işlenmesidir: gizlilik politikanı güncelle.",
      confirmNotice: "Bunu gizlilik politikana ekle",
      confirm: "Tekil ziyaretçileri say",
    },
    vitals: {
      label: "Sayfa hızını ölç",
      hint: "Sayfa görüntülemelerinden bir örneklemle Core Web Vitals.",
      cost: "Siteye yaklaşık %{percent} daha fazla istek ekler.",
      costOff: "Ek istek yok.",
      options: {
        "0": "Kapalı",
        "20": "20'de 1",
        "10": "10'da 1",
        "5": "5'te 1 (varsayılan)",
        "2": "2'de 1",
        "1": "Her sayfa görüntülemesi",
      },
    },
    retention: {
      label: "Günlük toplamları sakla",
      hint: "Cloudflare ham ziyaretleri 3 ay saklar (kendi bilgisayarında 90 gün); günlük toplamlar senin seçtiğin süre kadar kalır.",
      options: { forever: "Süresiz (varsayılan)", "1825": "5 yıl", "730": "2 yıl", "365": "1 yıl" },
      days: "{days} gün",
    },
    plan: {
      label: "Cloudflare planı",
      hint: "Yalnızca ziyaretler Workers Free'nin günlük 100.000 istek sınırına yaklaşmadan seni uyarmak için kullanılır. Cloudhal planını okuyamaz.",
      options: { unknown: "Emin değilim", free: "Workers Free", paid: "Workers Paid" },
    },
    notice: {
      title: "Siten için gizlilik bildirimi",
      hint: "Gizlilik politikana ekle. Yukarıdaki anahtarlara göre değişir.",
      hintUnsaved:
        "Gizlilik politikana ekle. Yukarıdaki anahtarlara göre değişir. Kaydedilmemiş değişikliklerini zaten yansıtıyor.",
      languages: "Bildirimin dili",
      copy: "Bildirimi kopyala",
      copied: "Gizlilik bildirimi kopyalandı",
      heading: "İstatistikler",
      base: "Bu site ziyaretleri, sitenin geri kalanıyla birlikte barındırılan kendi çerezsiz istatistik aracıyla sayar. Hangi sayfaların görüntülendiğini, seni yönlendiren web sitesini ya da kampanyayı (yalnızca alan adını), ülkeni, cihaz türünü ve tarayıcı aileni kaydederiz. Çerez ya da benzeri bir depolama kullanmayız, IP adresini ya da tarayıcı bilgilerini saklamayız ve seni web siteleri arasında izlemeyiz.",
      unique:
        "Tekil ziyaretçileri saymak için IP adresin ve tarayıcı bilgilerin her 24 saatte bir silinen rastgele bir değerle birleştirilir ve yalnızca sonuç saklanır; bu sonuç sana kadar geri izlenemez ve günler arasında eşleştirilemez. Tarayıcın Global Privacy Control ya da Do Not Track sinyali gönderirse ziyareti sayarız ama bu adımı atlarız.",
      legal: "Bu bir bilgilendirmedir, hukuki tavsiye değildir.",
    },
    conflictTitle: "Bu ayarlar başka bir yerde değişti",
    conflictDescription:
      "Sen açtıktan sonra biri bu sitenin istatistik ayarlarını kaydetti. En son sürümü yükle, değişikliğini kontrol et ve yeniden kaydet.",
    loadLatest: "En son sürümü yükle",
    failed: "İstatistik ayarları kaydedilemedi",
    saved: "İstatistik ayarları kaydedildi",
    savedPurged: "Site değişikliği bir dakika içinde alır.",
    savedNotPurged: "Ayarlar kaydedildi; önbellekteki sayfalar süreleri doldukça güncellenir.",
    savedSaltDeleted: "Bugünün rastgele değeri bu kurulumdaki tüm siteler için silindi.",
    keys: {
      missing: "İstatistik yok",
      missingHint:
        "Bu anahtar, agent'lar istatistik okuyamadan önce ya da bu yetki olmadan oluşturuldu. Anahtarlar kendiliğinden yetki kazanmaz: agent'ın site istatistiklerini okuyabilmesi için izin ver (yalnızca toplamlar, kişisel veri yok).",
      allow: "İstatistiklere izin ver",
      allowed: "İstatistiklere izin verildi",
      allowedDescription:
        "{name} bir sonraki çağrısından itibaren site istatistiklerini okuyabilir.",
      failed: "İstatistiklere izin verilemedi",
      ownerCannot:
        "{name} kişisinin rolü istatistikleri okuyamıyor, bu yüzden anahtarları da okuyamaz.",
    },
  },
};
