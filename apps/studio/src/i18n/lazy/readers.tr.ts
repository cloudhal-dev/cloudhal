import type { NamespaceMessages } from "../namespaces.ts";

/** Turkish `readers.*` (lazy namespace; keys from `readers.en.ts`). */
export const messages: NamespaceMessages<"readers"> = {
  readers: {
    title: "Okurlar",
    range: "Dönem",
    ranges: { "7d": "7 gün", "30d": "30 gün", all: "Tümü" },
    periods: { "7d": "son 7 gün", "30d": "son 30 gün", all: "tüm zamanlar" },
    figures: "Okurlar, {period}",
    pageviews: "Sayfa görüntüleme",
    visits: "Ziyaret",
    delta: "Önceki {days} güne göre {delta}",
    channelsLabel: "Okurların geldiği yerler",
    other: "Diğer",
    open: "Analitikte aç",
    redirects: "Eski adresler hâlâ okur getiriyor: {period} içinde {count}",
    redirectsAll: "Eski adresler hâlâ okur getiriyor: toplam {count}",
    partial: "Bu dönemin bir kısmı henüz okunamıyor, sayılar düşük görünebilir.",
    channels: {
      search: "Arama motorları",
      social: "Sosyal medya",
      ai: "Yapay zekâ asistanları",
      email: "E-posta",
      paid: "Ücretli kampanyalar",
      referral: "Diğer siteler",
      internal: "Bu site",
      direct: "Doğrudan",
    },
    chart: {
      description: "Günlük sayfa görüntüleme, {period}: toplam {total}.",
      timezone: "Saatler UTC",
      showTable: "Tablo olarak göster",
      showChart: "Grafik olarak göster",
      time: "Gün (UTC)",
    },
    states: {
      neverPublished: {
        article: "İstatistikler bu yazı yayımlanınca başlar",
        page: "İstatistikler bu sayfa yayımlanınca başlar",
      },
      neverPublishedHint: "Ziyaretler ilk yayından itibaren çerezsiz sayılır.",
      noReaders: "Henüz okur yok",
      noReadersHint: "Sayılar ilk ziyaretten yaklaşık bir dakika sonra görünür.",
      cantRead: "Ziyaretler henüz okunamıyor",
      cantReadHint:
        "Ziyaretler kaydediliyor ama Studio bu Cloudflare planında onları henüz okuyamıyor; 3 ay saklanıyorlar.",
      notPermitted: "Analitik senin rolüne dahil değil",
    },
    overview: {
      title: "Son 7 gün",
      view: "Analitiği aç",
      figures: "Son 7 gündeki ziyaretler",
      mostRead: "En çok okunanlar",
      topContent: "Son 7 günde en çok okunanlar",
      noVisits: "Henüz ziyaret yok",
      noVisitsHint:
        "Sayılar, yayımlanmış bir sayfaya gelen ilk ziyaretten yaklaşık bir dakika sonra görünür.",
      untitled: "Başlıksız",
      gone: "Artık yok",
    },
    listColumn: {
      title: "Görüntülenme · 30 gün",
      notTop: "Son 30 günde en çok okunan {count} içerik arasında değil",
    },
  },
};
