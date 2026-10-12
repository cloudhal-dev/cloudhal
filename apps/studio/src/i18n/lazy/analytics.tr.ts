import type { NamespaceMessages } from "../namespaces.ts";

/** Turkish `analytics.*` (lazy namespace; keys from `analytics.en.ts`). */
export const messages: NamespaceMessages<"analytics"> = {
  analytics: {
    page: {
      title: "Analitik",
      description: "Sitenin ziyaretleri; çerezsiz ve kişisel veri tutmadan sayılır.",
    },
    refresh: "Analitiği yenile",
    noData: "Veri yok",
    other: "Diğer",
    gate: { title: "Analitiği Yazarlar ve üstü görür" },
    range: {
      group: "Tarih aralığı",
      today: "Bugün",
      "7d": "7 gün",
      "30d": "30 gün",
      "90d": "90 gün",
      "12m": "12 ay",
      custom: "Özel…",
      customTitle: "Özel aralık",
      apply: "Uygula",
      pickHint: "İlk ve son günü seç.",
      tooLong: "En fazla 2 yıl seçebilirsin.",
      timezone: "Günler UTC saatine göre",
      previousMonth: "Önceki ay",
      nextMonth: "Sonraki ay",
      months: "Aylar",
      dayToday: "Bugün, {date}",
      daySelected: "{date}, seçili",
      compare: "Karşılaştır",
    },
    delta: {
      change: "önceki döneme göre {value}",
      flat: "Önceki dönemle hemen hemen aynı",
    },
    chart: {
      timezone: "Saatler UTC",
      showTable: "Tablo olarak göster",
      showChart: "Grafik olarak göster",
      time: "Zaman (UTC)",
    },
    metrics: {
      pageviews: "Sayfa görüntüleme",
      visits: "Ziyaret",
      visitors: "Tekil ziyaretçi",
      viewsPerVisit: "Ziyaret başına görüntüleme",
      previousPageviews: "Sayfa görüntüleme, önceki dönem",
      visitsHint:
        "Biri başka bir siteden, aramadan, bir bağlantıdan ya da adresi yazarak geldiğinde bir ziyaret başlar.",
      aboutVisits: "Ziyaretler hakkında",
      visitorsHint:
        "Günlük tekil ziyaretçilerin toplamı: başka bir gün yeniden gelen biri tekrar sayılır.",
      aboutVisitors: "Tekil ziyaretçiler hakkında",
    },
    columns: {
      content: "Sayfa",
      channel: "Kanal",
      referrer: "Yönlendiren",
      country: "Ülke",
      share: "Pay",
      status: "Durum",
      requested: "İstenen yol",
      hits: "İstek",
      linkedFrom: "Bağlantı veren",
      lastSeen: "Son görülme",
      oldPath: "Eski yol",
      target: "Hedef",
      crawler: "Tarayıcı bot",
      kind: "Tür",
      rendered: "Oluşturulan sayfa",
    },
    traffic: {
      title: "Trafik",
      figures: "Trafik, {range}",
      chartDescription: "{range} döneminde {pageviews} sayfa görüntüleme ve {visits} ziyaret.",
      export: "CSV indir",
      partial: "Bu dönemin bir kısmı okunamadı; bazı sayılar düşük görünebilir.",
      estimated: "Bazı sayılar tahmindir.",
    },
    content: {
      title: "En çok okunanlar",
      caption: "En çok okunanlar, {range}",
      showAll: "Tümünü göster",
      empty: "Bu dönemde sayfa görüntüleme yok",
      gone: "Artık yok",
      kinds: { entry: "Yazı", page: "Sayfa", archive: "Arşiv" },
    },
    sources: {
      title: "Kaynaklar",
      caption: "Kaynaklar, {range}",
      tabs: { channels: "Kanallar", referrers: "Yönlendirenler", campaigns: "Kampanyalar" },
      campaigns: { utmCampaign: "Kampanya", utmSource: "Kaynak", utmMedium: "Ortam" },
      empty: {
        channels: "Bu dönemde ziyaret yok",
        referrers: "Başka sitelerden ziyaret gelmedi",
        campaigns: "Kampanya ziyareti yok",
      },
      campaignsHint:
        "Burada görmek için paylaştığın bağlantılara utm_source, utm_medium ve utm_campaign ekle.",
      referrersNote:
        "Yalnızca sitenin adı tutulur, tam adres asla. Yönlendirenler gösterilir, bağlantı verilmez.",
    },
    channels: {
      direct: "Doğrudan",
      internal: "Site içi",
      search: "Arama",
      social: "Sosyal",
      ai: "Yapay zekâ asistanları",
      email: "E-posta",
      paid: "Ücretli",
      referral: "Diğer siteler",
    },
    countries: {
      title: "Ülkeler",
      map: "Ülkelere göre sayfa görüntüleme, {range}",
      other: "Diğer ülkeler",
      empty: "Henüz ülke yok",
      unknown: "Bilinmiyor",
      tor: "Tor",
      high: "Yüksek",
      low: "Düşük",
    },
    devices: {
      title: "Cihazlar",
      tabs: { device: "Cihaz", browser: "Tarayıcı", os: "İşletim sistemi" },
      empty: "Henüz cihaz yok",
      desktop: "Masaüstü",
      mobile: "Mobil",
      tablet: "Tablet",
      bot: "Botlar",
      unknown: "Bilinmiyor",
    },
    browsers: {
      chrome: "Chrome",
      edge: "Edge",
      firefox: "Firefox",
      safari: "Safari",
      samsung: "Samsung Internet",
      opera: "Opera",
      other: "Diğer",
    },
    oses: {
      windows: "Windows",
      macos: "macOS",
      ios: "iOS",
      android: "Android",
      linux: "Linux",
      chromeos: "ChromeOS",
      other: "Diğer",
    },
    vitals: {
      title: "Core Web Vitals",
      tabs: { all: "Tümü", mobile: "Mobil", desktop: "Masaüstü" },
      metrics: {
        lcp: { short: "LCP", name: "En büyük içerikli boyama" },
        inp: { short: "INP", name: "Etkileşimden sonraki boyama" },
        cls: { short: "CLS", name: "Kümülatif düzen kayması" },
      },
      ratings: { good: "İyi", needsImprovement: "İyileştirilmeli", poor: "Zayıf" },
      good: "İyi sayfa görüntülemeleri",
      value: "p75 {p75} · {good} iyi",
      p75Only: "p75 {p75}",
      noSamples: "Örnek yok",
      empty: "Bu dönemde sayfa hızı örneği yok",
      off: "Sayfa hızı ölçülmüyor",
      offDescription:
        "LCP, INP ve CLS değerlerini görmek için analitik ayarlarında sayfa hızı örneklemesini aç.",
      turnOn: "Analitik ayarları",
      sample: "{n} sayfa görüntülemeden birinden. Ziyaretçilerinin tarayıcılarında ölçülür.",
      sampleEvery: "Her sayfa görüntülemeden. Ziyaretçilerinin tarayıcılarında ölçülür.",
    },
    errors: {
      title: "Analitik yüklenemedi",
      busyTitle: "Cloudflare'ın analitik hizmeti şu an yoğun",
      busyDescription:
        "Birazdan yeniden dene; tamamlanmış günler günlük toplamlardan görünmeye devam eder.",
      retry: "Yeniden dene",
      card: "Bu bölüm yüklenemedi",
      cardTitle: "Hatalar ve yönlendirmeler",
      tabs: { errors: "Kırık bağlantılar", redirects: "Yönlendirmeler" },
      empty: { errors: "Bu dönemde kırık bağlantı yok", redirects: "Hiç yönlendirme izlenmedi" },
      noReferrer: "Yazılmış ya da dışarıdan",
      createRedirectFor: "{path} için yönlendirme oluştur",
      createRedirect: "Yönlendirme oluştur…",
      note: "Önbellekte olsun olmasın her hatayı içerir. İstenen yollar ziyaretçilerin istediği adreslerdir: gösterilir, asla bağlantı verilmez.",
      redirectsNote:
        "Hâlâ ziyaretçi getiren eski adresler; örneğin bir kısa ad değişikliğinden sonra.",
    },
    crawlers: {
      title: "Yapay zekâ ve arama botları",
      cacheMisses: "Yalnızca önbellek dışı",
      description:
        "Önbellekte bulunmadığında botlar için oluşturulan sayfalar; önbellekten verilen yanıtlar görülmez, bu yüzden sayılar alt sınırdır.",
      empty: "Bu dönemde bot için sayfa oluşturulmadı",
      classes: {
        ai: "Yapay zekâ",
        search: "Arama",
        social: "Sosyal",
        monitor: "İzleme",
        other: "Diğer",
      },
    },
    about: {
      title: "Bu veriler hakkında",
      privacy: "Gizlilik",
      privacyHint:
        "Çerez yok; IP adresi ya da tarayıcı bilgisi saklanmaz; ziyaretçileri siteler arasında izleyen hiçbir şey yok.",
      cookieless: "Çerezsiz",
      uniqueVisitors: "Tekil ziyaretçiler",
      uniqueVisitorsHint:
        "Yalnızca site sahibi açtığında, her gün silinen rastgele bir değerle sayılır.",
      on: "Açık",
      off: "Kapalı",
      change: "Ayarlardan değiştir",
      source: "Kaynak",
      estimated: "Bazı sayılar tahmindir.",
      sources: { live: "Canlı", rollups: "Günlük toplamlar", mixed: "Canlı ve günlük toplamlar" },
      requests: "Dün analitikten gelen istekler",
      requestsValue: "Workers Free'de günde {limit} istekten {used}",
      requestsHint:
        "Her sayfa görüntüleme ve her sayfa hızı örneği bir istek gönderir. Workers Paid'de günlük sınır yok.",
      signals: "Gizlilik sinyalleri",
      signalsValue: "Sayfa görüntülemelerinin {share} kadarı",
      signalsHint:
        "Global Privacy Control ya da Do Not Track gönderen tarayıcıların sayfa görüntülemeleri sayılır ama hiç özetlenmez; bu yüzden tekil ziyaretçi sayısı bir alt sınırdır.",
      cacheHits: "Önbellekten sunulan (tahmini)",
      cacheHitsValue: "yaklaşık {share}",
      cacheHitsHint:
        "1 − sitenin oluşturduğu sayfalar ÷ bu dönemdeki sayfa görüntülemeleri. Tahmindir: JavaScript'i kapalı ziyaretçiler sayfa görüntülemesi olarak sayılmaz.",
      budget: "Bugünkü canlı sorgular",
      budgetValue: "{limit} sorgudan {used}",
      updated: "Günlük toplamların güncellenmesi",
      rollupsScheduled: "Tamamlanan günler saatte bir toplanır; bugün canlı okunur.",
      rollupsOnRead: "Günlük toplamlar Analitik'i açtığında hesaplanır.",
    },
    banners: {
      notRunning: {
        title: "Analitik bu kurulumda çalışmıyor",
        description:
          "Ziyaretleri saymaya başlamak için cloudhal.json dosyasında analytics.enabled ayarını aç ve yeniden yayına al.",
      },
      cantRead: {
        title: "Studio ziyaretleri henüz okuyamıyor",
        description:
          "Ziyaretler kaydediliyor. Studio bu Cloudflare planında onları henüz okuyamıyor; 3 ay boyunca saklanıyorlar.",
      },
      quota: {
        title: "Analitik seni Workers Free sınırının üstüne çıkarabilir",
        description:
          "Her sayfa görüntüleme bir istek gönderir, sayfa hızı örnekleri daha fazlasını. Sınıra yaklaşırsan örneklemeyi azalt ya da Workers Paid'e geç.",
        meter: "Dünkü istekler",
        meterValue: "Günde {limit} istekten {used}",
        settings: "Analitik ayarları",
      },
      budget: {
        title: "Canlı sayılar bugün için duraklatıldı",
        description:
          "Bugünkü sorgu bütçesi doldu. Canlı sayılar UTC gece yarısında yeniden başlar; tamamlanan günler görünmeye devam eder.",
      },
      siteOff: {
        title: "Bu sitede analitik kapalı",
        description:
          "Yeni ziyaretler sayılmıyor. Önceki ziyaretler aşağıda görünmeye devam ediyor.",
      },
    },
    filter: {
      title: "Yalnızca {label} gösteriliyor",
      clear: "Tüm trafiği göster",
      kinds: {
        node: "Yalnızca bu sayfanın ziyaretleri.",
        channel: "Yalnızca bu kanaldan gelen ziyaretler.",
        country: "Yalnızca bu ülkeden gelen ziyaretler.",
        device: "Yalnızca bu tür cihazlardan gelen ziyaretler.",
      },
    },
    off: { turnOn: "Ayarlardan aç" },
    empty: {
      notRunning: {
        title: "Analitik çalışmıyor",
        description:
          "Bu kurulum ziyaretleri kaydetmiyor. Analitiği cloudhal.json dosyasında aç ve yeniden yayına al.",
      },
      off: {
        title: "Bu sitede analitik kapalı",
        description:
          "Ziyaretleri kendi sitenden yüklenen 1 KB'lık bir betikle saymak için aç. Çerez yok.",
      },
      cantRead: { title: "Studio ziyaretleri henüz okuyamıyor" },
      noVisits: {
        title: "Henüz ziyaret yok",
        description:
          "Sayılar, yayımlanmış bir sayfanın ilk ziyaretinden yaklaşık bir dakika sonra görünür.",
        openSite: "Siteyi aç",
      },
      noVisitsInRange: {
        title: "Bu dönemde ziyaret yok",
        description: "Seçilen günlerde kimse gelmedi. Daha önceki ziyaretler duruyor.",
        action: "Son 12 ayı göster",
      },
    },
  },
};
