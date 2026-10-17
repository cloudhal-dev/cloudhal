/** Turkish `menus.*` (see `menus.en.ts`). */
import type { NamespaceMessages } from "../namespaces.ts";

export const messages: NamespaceMessages<"menus"> = {
  menus: {
    places: { primary: "Üst menü", footer: "Alt menü", sidebar: "Kenar menüsü" },
    placeWithKey: "{place} ({key})",
    newMenu: "Yeni menü",
    depthOne: "1 seviye",
    depthMany: "{count} seviye",
    saved: "{name} kaydedildi",
    created: "{name} oluşturuldu",
    deleted: "{name} silindi",
    readOnly: {
      title: "Bakabilirsin ama değiştiremezsin",
      description:
        "Menüler her sayfada göründüğü için yalnızca Editör ve üstü roller değiştirebilir. Değişikliği bir Editör'den ya da Yönetici'den iste.",
    },
    conflict: {
      title: "Bu menü başka bir yerde değişti",
      description:
        "Sen düzenlerken biri {name} için yeni bir sürüm kaydetti. Düzenlemelerin hâlâ burada: en güncel sürümle karşılaştırıp yeniden kaydedebilir ya da en güncel hâlini yükleyip kendi değişikliklerini bırakabilirsin.",
      keep: "En güncelle karşılaştır",
      reload: "En güncelini yükle",
    },
    problems: {
      title: "Bu menü henüz kaydedilemiyor",
      emptyGroup: "“{label}” içi boş bir grup. Altına bir öğe ekle ya da grubu kaldır.",
      label:
        "“{label}” için bir etiket gerekli: grupların, koleksiyonların ve dış bağlantıların kendi başlığı yok.",
      depth:
        "“{label}”, bu menünün izin verdiği {max} seviyeden daha derinde. Yukarı taşı ya da Ayarlar'dan seviye sayısını artır.",
      perLevel: "Bir seviyede {max} öğeden fazlası var.",
      total: "Bu menüde {max} öğeden fazlası var.",
    },
    items: {
      title: "{place} öğeleri",
      titleLoading: "Öğeler",
      add: "Öğe ekle",
      count: "{count} / {limit}",
      countHint: "Tüm seviyelerdeki öğeler. Bir menüde en fazla {limit} öğe olabilir.",
      description:
        "Tutamaçtan sürükle ya da bir öğe seçip Alt ile ok tuşlarını kullan: yukarı ve aşağı sırayı değiştirir, sağ üstteki öğenin altına alır, sol bir seviye dışarı çıkarır. Bu menü {max} seviyeye kadar iner.",
      descriptionReadOnly: "Öğeler, bir sonraki yayından sonra ziyaretçilerin göreceği hâliyle.",
      empty: "Henüz öğe yok",
      emptyDescription: {
        primary:
          "Boş bir üst menü sitende hiç bağlantı göstermez. Sayfa, makale, kategori, koleksiyon, dış bağlantı ya da grup ekle.",
        footer:
          "Boş bir alt menü hiç bağlantı göstermez. Sayfa, makale, kategori, koleksiyon, dış bağlantı ya da grup ekle.",
        custom: "Sayfa, makale, kategori, koleksiyon, dış bağlantı ya da grup ekle.",
      },
    },
    tree: {
      label: "{place} öğeleri",
      instructions:
        "Ok tuşlarıyla öğeler arasında gezin; sağ ve sol bir öğeyi açar ve kapatır. Alt ile yukarı ya da aşağı öğeyi taşır, Alt ile sağ onu üstteki öğenin altına alır, Alt ile sol bir seviye dışarı çıkarır. Enter düzenler, Delete kaldırır.",
      expand: "{label} altındaki öğeleri göster",
      collapse: "{label} altındaki öğeleri gizle",
      topLevel: "en üst seviye",
      under: "{parent} altında, {level}. seviye",
      moved: "{label} taşındı: {total} öğeden {position}. sırada, {where}.",
      indented: "{label} içeri alındı: {total} öğeden {position}. sırada, {where}.",
      outdented: "{label} dışarı alındı: {total} öğeden {position}. sırada, {where}.",
      blocked: {
        first: "{label} zaten ilk sırada.",
        last: "{label} zaten son sırada.",
        "no-previous": "{label} öğesinin üstünde altına girebileceği bir öğe yok.",
        "top-level": "{label} zaten en üst seviyede.",
        depth: "{label} daha derine inemez: bu menü en fazla {max} seviyeli.",
        size: "O seviye dolu.",
      },
      refused: {
        depth: "{label} oraya taşınamaz: bu menü en fazla {max} seviyeli.",
        size: "{label} oraya taşınamaz: o seviye dolu.",
        "inside-itself": "{label} kendi içine taşınamaz.",
      },
    },
    hint: {
      page: "sayfa başlığından",
      contentEntry: "makale başlığından",
      term: "terimin adından",
    },
    chips: {
      page: "Sayfa {where}",
      contentEntry: "Makale {where}",
      term: "{taxonomy} {name}",
      termFallback: "Terim",
      collection: "Koleksiyon {where}",
      url: "Dış bağlantı {where} ↗",
      group: "Grup",
      newTab: "(yeni sekmede açılır)",
      missing: {
        page: "Silinmiş sayfa",
        contentEntry: "Silinmiş makale",
        term: "Silinmiş terim",
      },
    },
    hidden: {
      badge: "Gizli: {reason}",
      bannerOne: "1 öğe sitende görünmüyor",
      banner: "{count} öğe sitende görünmüyor",
      bannerDescription:
        "Ziyaretçiler gizli bir öğeyi ve altındakileri görmez; böylece menülerin kaybolmuş bir sayfaya asla bağlantı vermez. Başka bir hedef seçmek ya da kaldırmak için Düzelt'i kullan.",
      reasons: {
        missing: {
          page: "sayfa silinmiş",
          contentEntry: "makale silinmiş",
          term: "terim silinmiş",
        },
        unpublished: {
          page: "sayfa yayında değil",
          contentEntry: "makale yayında değil",
          term: "yayında değil",
        },
        "other-locale": "başka dilde",
        "not-served": "arşiv boş ya da herkese açık değil",
        retired: "terim kaldırılmış",
        "no-index": "bu koleksiyonu listeleyen sayfa yok",
        "empty-group": "içinde görünen öğe yok",
        "parent-hidden": "üstündeki öğe gizli",
      },
      explain: {
        missing: {
          page: "Sayfa silindi. Öğe, başka bir hedef seçene ya da kaldırana kadar menüde gizli olarak kalır.",
          contentEntry:
            "Makale silindi. Öğe, başka bir hedef seçene ya da kaldırana kadar menüde gizli olarak kalır.",
          term: "Terim silindi. Öğe, başka bir hedef seçene ya da kaldırana kadar menüde gizli olarak kalır.",
        },
        unpublished: {
          page: "Sayfa henüz yayında değil. Yayınlandığında öğe kendiliğinden görünür.",
          contentEntry: "Makale henüz yayında değil. Yayınlandığında öğe kendiliğinden görünür.",
          term: "Terim henüz yayında değil.",
        },
        "other-locale": "Hedef, önizlemedeki dilden farklı bir dilde.",
        "not-served":
          "Arşivi yayında değil: henüz yayınlanmış makalesi yok, herkese açık değil ya da arşivler kapalı.",
        retired: "Terim kaldırıldı. Öğeyi onun yerine geçen terime yönlendir.",
        "no-index":
          "Bu koleksiyonu listeleyen bir sayfa yok, bu yüzden bağlantı verilecek bir yer de yok.",
        "empty-group": "Bu gruptaki öğelerin hiçbiri görünmüyor, bu yüzden grup da gizli.",
        "parent-hidden": "Üstündeki bir öğe gizli; o da altındaki her şeyi gizler.",
      },
    },
    row: {
      noLabel: "Etiket yok",
      edit: "Düzenle",
      editLabel: "{label} öğesini düzenle",
      menu: "Diğer işlemler",
      menuLabel: "{label} için diğer işlemler",
      fix: "Düzelt",
      retarget: "Başka bir hedef seç…",
      addInside: "İçine öğe ekle",
      addInsideLimit:
        "Buradaki öğeler bu menünün izin verdiği en derin seviyede ({max}). Daha derine inmek için Ayarlar'dan seviye sayısını artır.",
      moveUp: "Yukarı taşı",
      moveDown: "Aşağı taşı",
      indent: "Üstteki öğenin altına al",
      indentLimit:
        "Bu menü {max} seviyeye kadar iner. Daha derine inmek için Ayarlar'dan seviye sayısını artır.",
      indentFull: "Üstteki öğenin altında zaten {max} öğe var.",
      indentNoPrevious: "Altına alınabileceği bir üst öğe yok.",
      outdent: "Bir seviye dışarı al",
      remove: "Kaldır",
    },
    removeTree: {
      title: "“{label}” ve altındakiler kaldırılsın mı?",
      description:
        "Altındaki {count} öğe de gider. Menüyü kaydedene kadar sitende hiçbir şey değişmez.",
    },
    item: {
      addTitle: "Öğe ekle",
      editTitle: "Öğeyi düzenle",
      description:
        "Sayfalar, makaleler ve kategoriler kimlikleriyle bağlanır; böylece yeniden adlandırma ya da adres değişikliği menüyü asla bozmaz.",
      target: "Bağlantı hedefi",
      targetHint:
        "Sayfa, makale, kategori, etiket ve koleksiyonlarda ara ya da bir dış bağlantı veya grup seç.",
      targetPlaceholder: "Ara ya da seç…",
      href: "Web adresi",
      hrefHint:
        "Başka bir sitedeki https:// adresi. Kendi sayfalarına bağlantı vermek için onları yukarıdan seç.",
      leavesFor: "Ziyaretçiler {host} adresine gider.",
      newTab: "Yeni sekmede aç",
      groupHint:
        "Grubun kendi bağlantısı yoktur: altına aldığın öğeleri tutar, üst menüdeki bir açılır liste gibi. İçindekilerin hiçbiri görünmüyorsa grup da gizlenir.",
      labels: "Etiketler",
      label: "Etiket",
      labelIn: "Etiket ({locale})",
      labelRequired: "Zorunlu: bu tür öğelerin kendi başlığı yok.",
      labelPickFirst: "Önce öğenin neye bağlanacağını seç.",
      labelFallback: {
        page: "Boş bırakırsan sayfa başlığı görünür; böylece yeniden adlandırmalar menüye de yansır.",
        contentEntry:
          "Boş bırakırsan makale başlığı görünür; böylece yeniden adlandırmalar menüye de yansır.",
        term: "Boş bırakırsan terimin adı görünür; böylece yeniden adlandırmalar menüye de yansır.",
      },
      labelOtherLocale: "Boş bırakırsan {locale} etiketi görünür.",
      place: "Yeri",
      placeHint: "Yeni öğenin gideceği yer. Sonradan istediğin yere sürükleyebilirsin.",
      topLevel: "En üst seviye",
      under: "“{label}” altında",
      add: "Öğe ekle",
      apply: "Uygula",
      targetGone: {
        page: "Bu öğenin bağlandığı sayfa silindi. Başka bir hedef seç ya da öğeyi kaldır.",
        contentEntry:
          "Bu öğenin bağlandığı makale silindi. Başka bir hedef seç ya da öğeyi kaldır.",
        term: "Bu öğenin bağlandığı terim silinmiş ya da kaldırılmış. Başka bir hedef seç ya da öğeyi kaldır.",
      },
      hiddenUntil: {
        draft: "Bu bir taslak. Öğe, yayınlanana kadar sitende gizli kalır.",
        review: "Bu incelemede. Öğe, yayınlanana kadar sitende gizli kalır.",
        archived: "Bu arşivlenmiş. Öğe sitende gizli kalır.",
        proposed: "Bu terim bir öneri. Öğe, biri onaylayana kadar gizli kalır.",
        internal: "Bu terim dahili. Arşivi herkese açık değil, bu yüzden öğe gizli kalır.",
      },
      errors: {
        target: "Öğenin neye bağlanacağını seç.",
        href: {
          required: "Bir https:// adresi gir.",
          insecure: "https:// kullan. Menülerde düz http:// bağlantılarına izin verilmez.",
          invalid:
            "Boşluk ya da kullanıcı adı içermeyen, yalın bir alan adına sahip https:// adresi kullan (uluslararası adlar punycode ile).",
        },
        label: {
          required: "Bir etiket gir.",
          tooLong: "En fazla {max} karakter.",
          invalid: "Etiketler tek satırlık düz metindir.",
        },
      },
    },
    picker: {
      url: "Dış bağlantı",
      group: "Grup (bağlantısız)",
      groups: {
        pages: "Sayfalar",
        articles: "Makaleler",
        collections: "Koleksiyonlar",
        other: "Diğer",
      },
      status: {
        draft: "Taslak",
        review: "İncelemede",
        archived: "Arşivlendi",
        proposed: "Önerildi",
        internal: "Dahili",
      },
    },
    save: {
      button: "Menüyü kaydet",
      title: "{name} kaydedilsin mi?",
      summaryOne: "1 değişiklik · {before} → {after} öğe",
      summary: "{count} değişiklik · {before} → {after} öğe",
      changes: "Değişiklikler",
      onlyDepth: "Yalnızca seviye sayısı değişiyor.",
      hiddenOne: "1 öğe sitende gizli kalacak",
      hidden: "{count} öğe sitende gizli kalacak",
      hiddenDescription:
        "Yine de kaydedebilirsin: hedefleri yayınlandığında kendiliğinden görünürler.",
      confirm: "Menüyü kaydet",
    },
    delta: {
      quoted: "“{label}”",
      quotedTitle: "“{label}” (başlık)",
      none: "(yok)",
      noArchive: "arşiv yok",
      topLevel: "en üst seviye, {position}. sıra",
      under: "“{parent}” altında, {position}. sıra",
      withBelowOne: ", altında 1 öğeyle",
      withBelow: ", altında {count} öğeyle",
      add: "{label} → {where}, {place}{below}",
      remove: "{label} → {where}",
      removeTreeOne: "{label} ve altındaki 1 öğe",
      removeTree: "{label} ve altındaki {count} öğe",
      move: "{label}: {from}. sıradan {to}. sıraya",
      reparent: "{label}, “{parent}” altına taşındı (önceden “{was}” altındaydı)",
      reparentFromTop: "{label}, “{parent}” altına taşındı (önceden en üst seviyedeydi)",
      toTop: "{label} en üst seviyeye taşındı (önceden “{was}” altındaydı)",
      label: "{label}: etiket [{locale}] {from} → {to}",
      target: "{label}: hedef {from} → {to}",
      newTabOn: "{label}: yeni sekmede açılır",
      newTabOff: "{label}: aynı sekmede açılır",
      hidden: "{label} gizli kalıyor: {reason}",
      where: {
        page: "{where} (sayfa)",
        contentEntry: "{where} (makale)",
        term: "{where} ({taxonomy} “{name}”)",
        collection: "{where} koleksiyonu",
        url: "dış bağlantı: {host}",
        urlNewTab: "dış bağlantı: {host}, yeni sekme",
        group: "grup",
        missing: {
          page: "silinmiş bir sayfa",
          contentEntry: "silinmiş bir makale",
          term: "silinmiş bir terim",
        },
      },
    },
    settings: {
      title: "Ayarlar",
      depth: "Seviyeler",
      depthHint: {
        primary:
          "Öğelerin ne kadar derine inebileceği. Blog teması üst menüde üç seviyeyi açılır liste olarak gösterir.",
        footer:
          "Öğelerin ne kadar derine inebileceği. Alt menüler genelde düz ya da iki seviyeli olur.",
        custom:
          "Öğelerin ne kadar derine inebileceği. Kaç seviye gösterileceğine teman karar verir.",
      },
      depthTooLow: "Öğeler zaten {depth} seviye derinde. Önce onları yukarı taşı.",
      items: "Öğeler",
      itemsHint: "Tüm seviyelerde, bir menünün alabileceği en fazla sayıya göre.",
      levels: "En derin seviye",
      levelsHint: "En derindeki öğe, bu menünün izin verdiği seviyelere göre.",
      levelsValue: "{max} seviyeden {depth}",
      fullest: "En dolu seviye",
      fullestHint: "Bir seviyede en fazla {limit} öğe olabilir.",
    },
    details: { key: "Anahtar" },
    delete: {
      title: "Bu menüyü sil",
      action: "Menüyü sil",
      confirmTitle: "{name} menüsü silinsin mi?",
      detail: "Önceki snapshot'lar menüyü saklar; geri alma onu geri getirir.",
      hint: {
        primary:
          "Bir sonraki yayınla siten, temanın en üst seviyedeki sayfalarından ve kategorilerinden oluşturduğu üst menüye döner.",
        footer: "Bir sonraki yayınla siten, temanın kendi alt bilgisine döner.",
        custom: "Bir sonraki yayınla temalar bu menüyü göstermeyi bırakır.",
      },
    },
    leave: {
      title: "{name} üzerindeki değişikliklerin silinsin mi?",
      description: "Henüz kaydetmedin. Menü değiştirirsen değişikliklerin gider.",
      confirm: "Değişiklikleri sil",
    },
    derived: {
      title: { primary: "Şu anki üst menü", footer: "Şu anki alt menü" },
      description: {
        primary:
          "Bu sitenin bir üst menüsü yok; bu yüzden tema üst menüyü yayındaki en üst seviye sayfalarından ve kategorilerinden oluşturuyor. Öğeleri yeniden sıralamak, yeniden adlandırmak, bazılarını gizlemek ya da açılır listeler ve dış bağlantılar eklemek için bir menü oluştur.",
        footer:
          "Bu sitenin bir alt menüsü yok; bu yüzden alt bilgide temanın kendi bağlantıları görünüyor. Bunları seçmek için bir menü oluştur.",
      },
      empty: {
        primary: "Türetilen üst menü boş: doldurmak için en üst seviyede bir sayfa yayınla.",
        footer: "Burada temanın kendi alt bilgi bağlantıları (RSS) görünür.",
      },
      treeLabel: "Şu anki {place} öğeleri",
      treeHint: "Salt okunur: tema bugün bunları gösteriyor.",
      startEmpty: "Boş başla",
      fromPages: "Mevcut sayfalardan menü oluştur",
    },
    fromPages: {
      title: "{name}: mevcut sayfalardan oluştur",
      description:
        "Bunlar sitenin bugün gösterdiği öğeler. Etiketler boş kalır; böylece sayfa adlarındaki değişiklikler menüye yansımaya devam eder.",
      items: "Öğeler",
      none: "Henüz en üst seviyede sayfa yok. Menü boş başlar.",
      page: "Sayfa",
      category: "Kategori",
      categories: "En üst seviye kategorileri de ekle ({count})",
      labelsHint: "Taslak sayfalar da listelenir: yayınlayana kadar gizli kalırlar.",
      confirm: "Menüyü oluştur",
    },
    create: {
      title: "Yeni menü",
      description: "Menüler boş başlar. Oluşturduktan sonra öğe eklersin.",
      place: "Nereye gidecek",
      placeHint: {
        primary: "Her sayfanın en üstündeki bağlantılar.",
        footer: "Her sayfanın en altındaki bağlantılar.",
      },
      custom: "Özel anahtar",
      customHint:
        "Temanın tanımladığı yerler için; örneğin bir kenar menüsü ya da sosyal bağlantılar.",
      key: "Anahtar",
      keyHint: "Küçük harfler, rakamlar ve tek tireler. Sonradan değiştirilemez.",
      depth: "Seviyeler",
      depthHint: "Öğelerin ne kadar derine inebileceği. Sonradan değiştirebilirsin.",
      confirm: "Menüyü oluştur",
      errors: {
        required: "Bir anahtar gir.",
        invalid: "Küçük harf, rakam ve tek tire kullan.",
        tooLong: "En fazla 128 karakter.",
        taken: "Bu sitede bu anahtarla bir menü zaten var.",
      },
    },
    preview: {
      title: "Önizleme",
      description:
        "Üst ve alt menünün kaydedilmemiş değişikliklerinle nasıl göründüğü. Hangi öğenin geçerli olarak işaretlendiğini görmek için bir yol gir.",
      path: "Şu sayfada önizle",
      pathHint: "Sitende bir yol; örneğin /about ya da /category/news.",
      locale: "Dil",
      header: "Üst menü önizlemesi",
      footer: "Alt menü önizlemesi",
      defaultFooter: "RSS",
      credit: "Cloudhal ile yapıldı",
      empty: "Gösterilen öğe yok",
      menu: "Menü",
      customTitle: "Bu menünün yerini teman belirler",
      customDescription:
        "Blog teması üst ve alt menüyü gösterir; “{key}” menüsü bir temanın onu koyduğu yerde görünür. Aşağıda: öğelerinin çözümlenmiş hâli.",
      match: {
        exact: "Altı çizili öğe bu yolla birebir eşleşiyor.",
        prefix: "İşaretli öğe bu yolun en yakın üst öğesi.",
        context: "İşaretli öğe bağlamdan eşleşiyor: makalenin kategorisi ya da koleksiyonu.",
      },
    },
    inMenu: { badge: "Menüde", hint: "{menus} içinde bağlantı var." },
    usedIn: {
      title: "Menülerde",
      none: "Hiçbir menüde değil",
      noneDescription: {
        page: "Menüler ekranından üst ya da alt menüye ekleyebilirsin.",
        contentEntry: "Menüler ekranından bir menüye ekleyebilirsin.",
        term: "Arşivini Menüler ekranından bir menüye ekleyebilirsin.",
      },
      description: {
        page: "Sayfayı yeniden adlandırmak, kendi etiketi olmayan öğeleri de yeniden adlandırır. Sayfayı silersen bu öğeler gizlenir.",
        contentEntry:
          "Makaleyi yeniden adlandırmak, kendi etiketi olmayan öğeleri de yeniden adlandırır. Makaleyi silersen bu öğeler gizlenir.",
        term: "Terimi kaldırmak ya da dahili yapmak bu öğeleri gizler.",
      },
      open: "Menüler'i aç",
    },
    deleteNotice: {
      titleOne: {
        page: "Bir menü bu sayfaya bağlanıyor",
        contentEntry: "Bir menü bu makaleye bağlanıyor",
      },
      title: {
        page: "{count} menü öğesi bu sayfaya bağlanıyor",
        contentEntry: "{count} menü öğesi bu makaleye bağlanıyor",
      },
      description:
        "Sildikten sonra menüde kalırlar; sen düzeltene kadar sitende gizlenir ve Menüler ekranında işaretlenirler.",
    },
    how: {
      title: "Menüler nasıl çalışır",
      ids: "Kimlikle bağlanır",
      idsHint:
        "Öğeler adreslere değil sayfalara, makalelere ve kategorilere bağlanır; yeniden adlandırma onları asla bozmaz.",
      hidden: "Gizlenir, asla kırılmaz",
      hiddenHint:
        "Sayfası silinen ya da yayından kaldırılan bir öğe sitende gizlenir ve burada işaretlenir.",
      agents: "Agent'lar önce sorar",
      agentsHint: "Bir agent'ın önerdiği her menü değişikliği bir kişinin onayını bekler.",
      snapshot: "Tek kayıt, tek snapshot",
    },
    diff: {
      summary: "+{added} −{removed} ↕{moved} ~{changed}",
      items: "{before} → {after} öğe",
    },
  },
};
