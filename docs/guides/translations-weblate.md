# Translations on Hosted Weblate: the owner's steps

Studio's translations move to **Hosted Weblate on the Libre plan** (ADR-0034, decisions of 2026-10-18). Agents prepare everything in the repo but **never create accounts or apply on your behalf**. This page lists what only you can do.

What the Libre plan is, from https://weblate.org/en/hosting/:
- free hosting for **public** projects;
- set up from https://hosted.weblate.org/hosting/;
- the same limits as the 160k plan: **160,000 hosted strings**, counted as source strings × (languages + 1), with unlimited projects, components and translators.

Studio has about 4,800 message keys and 18 languages besides English (`apps/studio/src/i18n/locales.ts`), so all of them together are about 90,000 hosted strings, within the limit.

## 1. Account and project (you)

1. Sign in at https://hosted.weblate.org (your GitHub account works). Use your own account, never a shared or bot one.
2. Open https://hosted.weblate.org/hosting/ and start a **Libre** project for Cloudhal. Describe it as "Cloudhal Studio, the admin app of an open-source (Apache-2.0) site platform", and give the repository URL https://github.com/cloudhal-dev/cloudhal.
3. If Weblate asks for anything beyond what is listed here (a review of the project, a contact), answer it yourself. Write to sales@weblate.org if the hosting page is unclear.

## 2. Repository access (you)

Weblate is Git-based: it reads the translation files from a branch and pushes translators' work back as commits.
- Give Weblate access to the repository the way its project settings offer: a deploy key, or the Weblate GitHub app.
- Allow push to the **`i18n` branch** only, never `main`.
- An agent prepares that branch (see 4). Translations reach `main` only through a pull request that runs `pnpm i18n:import` and its checks.

## 3. Components (you, or tell an agent the project URL and it writes the exact values)

One Weblate component per catalog file, all in the same project:

| Setting | Value |
|---|---|
| File format | JSON nested structure file (`json-nested`) |
| Monolingual base (template) | `i18n/en/<file>.json`; `<file>` is `core`, a namespace (`analytics`, `comments`, …) or `status` |
| File mask | `i18n/*/<file>.json` |
| Source language | English |
| Quality checks (flags) | `icu-message-format` (ICU syntax and placeholders, RFC-0032) |
| Languages | every language in `apps/studio/src/i18n/locales.ts`: Turkish (reviewed, by you), the others machine drafts for community review |

The `status` component is the one visitor-facing catalog: the site status pages (coming soon, maintenance, unavailable, error, expired preview link) from `packages/astro-renderer/src/status-strings/` (RFC-0043 §1.5), about 14 keys. Its messages take simple `{name}` arguments only, never `plural` or `select`; give it the same flags.

Turn on **reviews** (translated → approved), so "approved by a reviewer" is what makes a language `reviewed: true` in `apps/studio/src/i18n/locales.ts`.

## 4. What agents do, and what stays yours

| Agents (in PRs you review) | You |
|---|---|
| Maintain the `i18n` branch with `pnpm i18n:export` output under `i18n/` (follow-up PR, once the project exists) | Create the account, apply, accept Weblate's terms |
| Import Weblate's commits with `pnpm i18n:import` and run the checks | Give repository access (push to `i18n` only) |
| Draft new strings and run the AI consistency pass (`translate` skill), uploading nothing themselves | Invite and approve reviewers; decide when a language is `reviewed: true` |
| Keep English the only hand-edited catalog | Settle disputes about terms (glossary) |

## 5. Not in scope yet

Visitor-facing strings (themes, privacy notices on sites) are not on Weblate yet (ADR-0034).

## 6. Glossary of coined terms

Studio coins a few terms of its own (issue #112). Each language should use one rendering for each, so drafts and reviewers stay consistent. The table is the rendering the catalogs use after the QA pass of November 2026 ([docs/i18n-review/qa-2026-11.md](../i18n-review/qa-2026-11.md)), normally the majority form in that language's Studio. It holds within the reviewed namespaces (the pass's 494 keys); elsewhere the pass only searched for the variant forms it had found and fixed the clear cases, and the report lists the strings it left ("Outside the 494 keys"). Other catalogs may still use older terms: when you find one, align it. Reviewers may change a term: change it in every key that uses it, and in this table, in the same PR. On Weblate, these rows go into the project glossary.

General rules for every language:

- Product and technical names stay as they are: Cloudhal, Studio, MCP, OAuth, URL, JSON, Markdown, Snapshot, Release, SEO, sitemap.xml, file paths, environment variables and CLI flags.
- Names of buttons in other apps (Claude's *Settings* and *Connectors*, Claude Code's *Authenticate*, MCP Inspector's *Streamable HTTP* and *Quick OAuth Flow*) stay in English unless that app is localized in your language.
- Studio uses the language's usual UI register throughout, and one register per language: informal where Studio already is (Turkish *sen*, German *du*, Spanish *tú*, Korean 해요체), formal where it already is (French *vous*, Indonesian *Anda*, Persian *شما*). Hebrew uses gender-neutral forms (plural or impersonal imperatives). The status pages are read by site visitors: neutral public register.
- Turkish says *giriş yap* for sign in, never *oturum aç*, and *çıkış yap* for signing out of Studio; *oturumu kapat* (close the session) remains in the session list and the invite page (left for the owner, see the report).

### Content

| Language | collection | entry | field | listing fields | structured data |
|---|---|---|---|---|---|
| `tr` | koleksiyon | kayıt | alan | liste alanları | yapılandırılmış veri |
| `de` | Sammlung | Eintrag | Feld | Listenfelder | strukturierte Daten |
| `es` | colección | entrada | campo | campos de listado | datos estructurados |
| `fr` | collection | entrée | champ | champs de liste | données structurées |
| `it` | raccolta | voce | campo | campi di elenco | dati strutturati |
| `pt-BR` | coleção | entrada | campo | campos de listagem | dados estruturados |
| `nl` | collectie | item | veld | lijstvelden | gestructureerde gegevens |
| `pl` | kolekcja | wpis | pole | pola list | dane strukturalne |
| `ru` | коллекция | запись | поле | поля списков | структурированные данные |
| `uk` | колекція | запис | поле | поля списків | структуровані дані |
| `ja` | コレクション | エントリー | フィールド | リスト用フィールド | 構造化データ |
| `ko` | 컬렉션 | 항목 | 필드 | 목록 필드 | 구조화된 데이터 |
| `zh-Hans` | 集合 | 条目 | 字段 | 列表字段 | 结构化数据 |
| `hi` | संग्रह | एंट्री | फ़ील्ड | लिस्टिंग फ़ील्ड | स्ट्रक्चर्ड डेटा |
| `id` | Koleksi | Entri | Kolom | Kolom daftar | Data terstruktur |
| `ar` | المجموعة | الإدخال | الحقل | حقول القوائم | البيانات المنظمة |
| `fa` | مجموعه | ورودی | فیلد | فیلدهای فهرست | داده‌های ساختاریافته |
| `he` | אוסף | רשומה | שדה | שדות רשימה | נתונים מובנים |

### Expiry

The two actions must read as clearly different: *Leave lists* keeps the page at its address, *Hide the page* makes it answer “not found”. Write them as actions on the entry, never as an order to the reader (“leave the lists!”).

| Language | expiry | Leave lists (unlist) | Hide the page (hide) | Ended (collection rule) |
|---|---|---|---|---|
| `tr` | sona erme | Listelerden çıkar | Sayfayı gizle | Sona erdi (koleksiyon kuralı) |
| `de` | Ablauf | Aus Listen nehmen | Seite ausblenden | Beendet (Sammlungsregel) |
| `es` | caducidad | Salir de las listas | Ocultar la página | Finalizada (regla de la colección) |
| `fr` | expiration | Retirer des listes | Masquer la page | Terminée (règle de la collection) |
| `it` | scadenza | Togli dagli elenchi | Nascondi la pagina | Terminata (regola della raccolta) |
| `pt-BR` | expiração | Sair das listas | Ocultar a página | Encerrada (regra da coleção) |
| `nl` | verloopdatum (regel: verloopregel) | Uit lijsten halen | Pagina verbergen | Beëindigd (collectieregel) |
| `pl` | wygaśnięcie | Usuń z list | Ukryj stronę | Zakończone (reguła kolekcji) |
| `ru` | истечение срока | Убрать из списков | Скрыть страницу | Завершено (правило коллекции) |
| `uk` | закінчення терміну | Прибрати зі списків | Сховати сторінку | Завершено (правило колекції) |
| `ja` | 有効期限 | リストから外す | ページを非表示にする | 終了（コレクションのルール） |
| `ko` | 만료 | 목록에서 제외 | 페이지 숨기기 | 종료됨(컬렉션 규칙) |
| `zh-Hans` | 到期 | 移出列表 | 隐藏页面 | 已结束（集合规则） |
| `hi` | समाप्ति | सूचियों से हटाएँ | पेज छिपाएँ | ख़त्म हुई (संग्रह का नियम) |
| `id` | Kedaluwarsa | Keluarkan dari daftar | Sembunyikan halaman | Berakhir (aturan koleksi) |
| `ar` | الانتهاء | الخروج من القوائم | إخفاء الصفحة | انتهى (قاعدة المجموعة) |
| `fa` | انقضا | خروج از فهرست‌ها | پنهان کردن صفحه | پایان‌یافته (قاعدهٔ مجموعه) |
| `he` | תפוגה | יציאה מרשימות | הסתרת העמוד | הסתיימה (כלל האוסף) |

### Comparison operators

`listings:contentList.ops.*`. Dates: *is before / is on or before / is after / is on or after*; numbers: *is less than / is at most / is greater than / is at least*. The date forms must also read with the value *Now*.

| Language | dates | numbers |
|---|---|---|
| `tr` | öncesinde / aynı gün ya da öncesinde / sonrasında / aynı gün ya da sonrasında | küçüktür / en fazla / büyüktür / en az |
| `de` | liegt vor / liegt am oder vor / liegt nach / liegt am oder nach | ist kleiner als / ist höchstens / ist größer als / ist mindestens |
| `es` | es anterior a / es igual o anterior a / es posterior a / es igual o posterior a | es menor que / es como máximo / es mayor que / es como mínimo |
| `fr` | est avant / est antérieur ou égal à / est après / est postérieur ou égal à | est inférieur à / est au plus / est supérieur à / est au moins |
| `it` | è prima di / è entro / è dopo / è a partire da | è minore di / è al massimo / è maggiore di / è almeno |
| `pt-BR` | é antes de / é em ou antes de / é depois de / é em ou depois de | é menor que / é no máximo / é maior que / é no mínimo |
| `nl` | is vóór / is op of vóór / is na / is op of na | is kleiner dan / is hoogstens / is groter dan / is minstens |
| `pl` | jest przed / jest nie później niż / jest po / jest nie wcześniej niż | jest mniejsze niż / wynosi najwyżej / jest większe niż / wynosi co najmniej |
| `ru` | раньше / не позже / позже / не раньше | меньше / не больше / больше / не меньше |
| `uk` | раніше / не пізніше / пізніше / не раніше | менше / не більше / більше / не менше |
| `ja` | より前 / 以前 / より後 / 以降 | より小さい / 以下 / より大きい / 以上 |
| `ko` | 이전 / 당일 또는 이전 / 이후 / 당일 또는 이후 | 미만 / 이하 / 초과 / 이상 |
| `zh-Hans` | 早于 / 不晚于 / 晚于 / 不早于 | 小于 / 不大于 / 大于 / 不小于 |
| `hi` | से पहले है / को या उससे पहले है / के बाद है / को या उसके बाद है | से कम है / अधिकतम है / से ज़्यादा है / कम से कम है |
| `id` | sebelum / pada atau sebelum / setelah / pada atau setelah | kurang dari / paling banyak / lebih dari / paling sedikit |
| `ar` | قبل / في أو قبل / بعد / في أو بعد | أقل من / على الأكثر / أكثر من / على الأقل |
| `fa` | پیش از / در یا پیش از / پس از / در یا پس از | کمتر از / حداکثر / بیشتر از / حداقل |
| `he` | לפני / ב- או לפני / אחרי / ב- או אחרי | קטן מ / לכל היותר / גדול מ / לפחות |

### Agents and identity

Security wording: *not verified* stays a plain negation (not “not yet verified”), and *self-registered* says the app registered itself.

| Language | connected agent | agent key | self-registered | not verified | setup link |
|---|---|---|---|---|---|
| `tr` | bağlı agent | agent anahtarı | kendini kaydetmiş | doğrulanmamış | kurulum bağlantısı |
| `de` | verbundener Agent (Plural: Agents) | Agent-Schlüssel | selbst registriert | nicht geprüft | Einrichtungslink |
| `es` | agente conectado | clave de agente | autorregistrado | sin verificar | enlace de configuración |
| `fr` | agent connecté | clé d’agent | auto-enregistré | non vérifié | lien de configuration |
| `it` | agente connesso / collegato | chiave agente | registrato da sé | non verificato | link di configurazione |
| `pt-BR` | agente conectado | chave de agente | autorregistrado | não verificado | link de configuração |
| `nl` | gekoppelde agent | agentsleutel | zelf geregistreerd | niet geverifieerd | installatielink |
| `pl` | połączony agent | klucz agenta | zarejestrowany samodzielnie | niezweryfikowany | link konfiguracyjny |
| `ru` | подключённый агент | ключ агента | зарегистрировался сам | не проверен | ссылка настройки |
| `uk` | під'єднаний агент | ключ агента | зареєструвався сам | не перевірений | посилання для налаштування |
| `ja` | 接続済みのエージェント | エージェントキー | 自己登録 | 未確認 | セットアップリンク |
| `ko` | 연결된 에이전트 | 에이전트 키 | 자체 등록됨 | 확인되지 않음 | 설정 링크 |
| `zh-Hans` | 已连接的智能体 | 智能体密钥 | 自行注册 | 未经验证 | 设置链接 |
| `hi` | कनेक्ट किए गए एजेंट | एजेंट कुंजी | स्वयं पंजीकृत | सत्यापित नहीं | सेटअप लिंक |
| `id` | Agen terhubung | kunci agen | Terdaftar sendiri | tidak terverifikasi | tautan penyiapan |
| `ar` | الوكلاء المتصلون | مفتاح وكيل | مسجّل ذاتيًا | غير مُتحقَّق منه | رابط الإعداد |
| `fa` | عامل متصل | کلید عامل | خودثبت‌شده | تأییدنشده | پیوند راه‌اندازی |
| `he` | סוכן מחובר | מפתח סוכן | נרשם בעצמו | לא מאומת | קישור ההגדרה |

### Consent screen

Use one verb for approve across the consent screen and the setup hints, the same as the Approve button.

| Language | permissions (scopes) | agent mode | Approve | Deny | Disconnect |
|---|---|---|---|---|---|
| `tr` | izinler | agent modu | Onayla | Reddet | Bağlantıyı kes |
| `de` | Berechtigungen | Agent-Modus | zustimmen | ablehnen | trennen |
| `es` | permisos | modo del agente | aprobar | rechazar | desconectar |
| `fr` | autorisations | mode de l’agent | approuver | refuser | déconnecter |
| `it` | autorizzazioni | modalità dell’agente | Approva | Rifiuta | Scollega |
| `pt-BR` | permissões | modo do agente | Aprovar | Recusar | Desconectar |
| `nl` | rechten | agentmodus | Goedkeuren | Weigeren | Ontkoppelen |
| `pl` | uprawnienia | tryb agenta | Zatwierdź | Odrzuć | Odłącz |
| `ru` | разрешения | режим агента | Разрешить | Отклонить | Отключить |
| `uk` | дозволи | режим агента | Дозволити | Відхилити | Від'єднати |
| `ja` | 権限 | エージェントモード | 承認 | 拒否 | 接続を解除 |
| `ko` | 권한 | 에이전트 모드 | 승인 | 거부 | 연결 해제 |
| `zh-Hans` | 权限 | 智能体模式 | 批准 | 拒绝 | 断开连接 |
| `hi` | अनुमतियां | एजेंट मोड | मंज़ूर करें | अस्वीकार करें | डिस्कनेक्ट करें |
| `id` | Izin | Mode agen | Setujui | Tolak | Putuskan koneksi |
| `ar` | الأذونات | وضع الوكيل | موافقة | رفض | اقطع الاتصال |
| `fa` | مجوزها | حالت عامل | تأیید | رد | قطع اتصال |
| `he` | הרשאות | מצב הסוכן | אישור | דחייה | ניתוק |

### Open term questions for reviewers

- **hi**: *entry* is एंट्री and *collection* संग्रह (the majority forms); प्रविष्टि would pair better with संग्रह. A reviewer may switch every key.
- **fa**: *entry* is ورودی (the majority); مطلب may read more naturally. A reviewer may switch every key.
- **it**: *self-registered* is “Registrato da sé”; “Autoregistrato” is the usual form. A reviewer may switch both labels.
- **de**, **ru**, **uk**, **it**: the setup hints still use a second verb for approving or connecting in a few keys (listed as review items in the QA report).

## 7. Reviewing your language

Thank you for reviewing. Until the Weblate project exists, review in the repository:

1. Export your language: `pnpm i18n:export` writes `.i18n/<locale>/<file>.json` for every language, with English in `.i18n/en/` and each key's English text and translator note in `.i18n/descriptions.json`.
2. Read [the QA report](../i18n-review/qa-2026-11.md) for your language: what was fixed and the open review items. Use the glossary above.
3. Edit only `.i18n/<locale>/*.json`: same keys, nesting and order as English, ICU MessageFormat values (keep every `{argument}`; a `plural` needs every category your language has; the `translate` skill in `.agents/skills/translate/SKILL.md` has the rules).
4. Import: `pnpm i18n:import --locale <locale>`. It checks keys and ICU syntax, rewrites the catalogs and runs the catalog tests. Never edit `apps/studio/src/i18n/<locale>.ts` by hand; the check fails.
5. Open a pull request that says which parts you reviewed. When a person has reviewed the whole catalog, the owner sets `reviewed: true` for the language in `apps/studio/src/i18n/locales.ts` (agents never do).
