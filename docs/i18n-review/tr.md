# Turkish review pack: strings changed since your last review

Every Turkish string added or changed after your review of collections, fields and listings (issue #112, 2026-10-23, commit 2e896582), as of this PR: 92 keys, plus one older string fixed for the glossary (last section). Security-relevant screens come first.

- **English**: the source (`en`).
- **Current Turkish**: what Studio shows after this PR. Rows marked **fixed in this PR** were clear errors; the machine draft is quoted under the table.
- **Suggested**: only where I would change it. Empty means I would keep it. These are suggestions, not applied.

To accept or change a line, edit `.i18n/tr/<file>.json` after `pnpm i18n:export --locale tr`, then `pnpm i18n:import --locale tr` (the key column is `<file>:<key>`). Or reply on the PR and an agent applies it.

## Review result (2026-11-11)

The owner asked the PM to check and approve this pack. Every key below was reviewed by two independent AI reviewers (one for faithfulness and security wording, one for idiom and catalog-wide terminology) and a judge, then read by the PM; the owner approved the result. 95 keys were checked: 22 changed, the rest kept as they are. The open question is answered: the invite page now says *Çıkış yap*, the name of its own button.

| Key | Now | Why |
|---|---|---|
| `oauthConsent:title` | {client} bağlantısı | '{client} bağla' would need an accusative suffix on the arbitrary name, so it reads as broken Turkish. The noun phrase needs no suffix on the argument and matches disconnectLabel '{client} bağlantısını kes'. Both reviewers agree. |
| `oauthConsent:titleFrom` | {host}: {client} bağlantısı | Same fix as title, so the two headings stay parallel. Both args are intact. |
| `oauthConsent:invalid.description` | Süresi doldu, zaten yanıtlandı ya da aktarılırken değiştirildi. Bağlantıyı agent'tan yeniden başlat. | 'yolda değiştirildi' is a literal calque. 'aktarılırken' means 'altered in transit', which is the intended sense. |
| `oauthConsent:who.lookalike` | Adı {client} gibi görünüyor ama herkes istediği adla istemci kaydedebilir. Yalnızca bu bağlantıyı {client} üzerinden kendin başlattıysan ve yukarıda gösterilen dönüş adresi gerçekten onun kullandığı adresse onayla. | Takes the pack's improvements: possessive 'Adı', the natural 'istediği adla', and 'gerçekten', which makes the check stronger. Drops the comma before 'ama', which standard Turkish leaves out and the catalog mostly omits. 'Yalnızca' and both conditions stay, and no suffix lands on {client}. |
| `oauthConsent:who.stepUp` | Bu agent zaten bağlı ve daha fazlasını istiyor. Şu an yapabildikleri işaretli. | The English 'today' means 'currently'. 'Bugün' reads as 'on this calendar day'. 'Şu an' matches tr.ts ('şu an yapabileceklerini'). |
| `oauthConsent:scopes.offline` | Bağlantı iptal edilene ya da erişimin bitene kadar, en fazla 90 gün boyunca bağlı kalır ve erişimini kendisi yeniler. | In tr.ts 'revoke' is consistently 'iptal et' (revokeKey, revoked, invite revoke), while 'geri al' means undo or rollback. The 90-day cap and both end conditions are kept. |
| `connectedAgents:description` | URL ile bağladığın Claude, ChatGPT veya Cursor gibi uygulamalar. Her biri, sen bağlantısını kesene kadar senin adına çalışır ve senin rolünü asla aşmaz. | The current 'rolünün ötesine geçmeden' softens 'never'. The pack's 'rolünün ötesine geçmez' restores it, but 'rolünün' can also be read as 'its own role'. 'senin rolünü asla aşmaz' says whose role it is and matches tr.ts ('rolünü asla aşmaz'). |
| `connectedAgents:allDescription` | Tüm üyelerin bağlantıları. Kestiğin bağlantı hemen sona erer; onu bağlayan üye yeniden bağlayabilir. | 'üyesi' ('its member') is awkward, and 'Birinin bağlantısını kesmek' can be read as 'someone's connection'. The new text keeps 'at once' (hemen) and avoids 'sahibi', which could be confused with the Sahip role. |
| `core:auth.setupDescription` | Cloudhal başlarken ya da dağıtılırken yazdırılan kurulum bağlantısıyla geldin. Şimdi oluşturacağın hesap Sahip olur; ardından kayıt kapanır. | With a lowercase 'sahip', 'hesap sahip olur' reads as the verb 'to own' with no object. Studio capitalises the role in running text ('ilk hesap Sahip olur', tr.ts). 'yeni kayıtlar' can also mean new entries, while the sign-up settings say 'kayıt ... kapandı'. |
| `connectedAgents:columns.connected` | Bağlandı | ConnectedAgents.tsx:269 shows this as a prefix directly before a RelativeTime ('Connected 3 days ago'), not as a column header. 'Bağlandı 3 gün önce' reads naturally. 'Bağlanma' also reads as the negative imperative, and 'Bağlanma tarihi 3 gün önce' (a date followed by 'ago') is awkward. |
| `connectedAgents:never` | Hiç kullanılmadı | It stands alone in the Last used cell, where a bare 'Hiç' looks clipped. This follows the existing 'Hiç çalışmadı' in scheduleSettings. |
| `connectedAgents:setup.description` | Bir uygulamaya bu Studio'nun MCP URL'sini ver, onay istediğinde onayla. Giriş yapamayan betikler ve istemciler içinse bir agent anahtarı oluştur. | Imperative 'istediğinde onayla' with no subject can read as 'approve whenever you like' instead of 'when it asks'. 'onay istediğinde' removes that, and two sentences replace the run-on 've ... ya da' chain. The 'giriş yap' fix is kept. |
| `connectedAgents:setup.hints.inspector` | Çalıştır, Streamable HTTP'yi seç, URL'yi yapıştır ve Auth Settings'i, ardından Quick OAuth Flow'u aç. Bir bağlantıyı denemek için kullanışlıdır. | '... için iyidir' is a calque of 'Good for'; 'kullanışlıdır' is the idiomatic UI phrasing. The rest is unchanged. |
| `connectedAgents:setup.needsDcr` | {client} kendini kaydeder (dinamik istemci kaydı) ve bu sunucuda bu özellik kapalı. Sunucunun işletmecisinden CLOUDHAL_MCP_DCR ayarını yeniden açmasını iste ya da bir agent anahtarı kullan. | Takes the pack's 'ayarını' fix, which avoids a guessed suffix on the variable name. 'operator' becomes 'işletmeci', as in media.tr.ts ('işletmeciden daha fazla alan iste'). 'yönetici' reads as Studio's Yönetici (Admin) role, who cannot change this environment setting. {client} is intact. |
| `connectedAgents:setup.needsPublicUrl` | Claude.ai ve ChatGPT kendi sunucularından bağlanır; bu sunucular {url} adresine erişemez. Studio'yu --base-url ile herkese açık bir https:// adresi vererek başlat ya da bu bilgisayardaki Claude Code veya Codex gibi bir uygulama kullan. | 'Studio'yu ... adresine ayarlayarak' grammatically sets Studio itself to an address. 'adresi vererek' says plainly that --base-url takes the public address, and is shorter than the 'değeri ... olacak şekilde' alternative. {url} needs no suffix. |
| `connectedAgents:setup.unavailable` | Bir uygulamanın kendini tanıtabileceği iki yol da (meta veri belgeleri ve dinamik kayıt) burada kapalı. Bu sunucunun işletmecisine sor ya da bir agent anahtarı kullan. | 'operator' is 'işletmeci' in the catalog (media quota_exceeded). 'yöneticisine' can send users to the Studio Yönetici (Admin) role, who cannot turn these server features on. This also keeps it consistent with needsDcr. |
| `build:chat.playgroundHint` | “AI ile kur” Workers AI ile çalışır; playground'da Workers AI yok. Kullanmak için Cloudhal'ı kendi Cloudflare hesabına kur. | I checked tr.ts: Studio calls it 'Playground' (playground.title, and playground'da in unavailableDescription), and this is the only string that says 'deneme alanı'. The new text also replaces the vague 'bu' with what is actually missing. The second sentence matches unavailableDescription word for word. |
| `status:maintenance.body` | Bu site bakım nedeniyle kapalı. Sabrınız için teşekkür ederiz. | 'teşekkürler' is casual. A formal public page in the siz register calls for 'teşekkür ederiz'. Both reviewers agree. |
| `status:backBy` | Tahmini dönüş: {time} | 'itibarıyla' means 'as of / from then on', not 'by'. The current text also repeats the maintenance title 'Yakında geri döneceğiz' right above it. The pack's label form is the natural Turkish maintenance phrasing, puts no suffix on {time} and keeps the single simple arg. 'Tahmini' fits because the owner-set return time is an expectation. Reviewer A's 'Dönüş: en geç {time}' reads awkwardly. |
| `core:agents.notEnabledDescription` | Bu sunucu giriş gerektirmeden çalışıyor, bu yüzden anahtar üretemez. Kendi bilgisayarındaki agent'lar yine de cloudhal mcp ile stdio üzerinden bağlanabilir. | The glossary fix (giriş) is right, but 'giriş olmadan çalışıyor' is awkward and drops 'This'. 'Bu sunucu ... giriş gerektirmeden' restores the subject and matches the playground copy in tr.ts ('giriş gerektirdiği için'). The meaning is unchanged. |
| `core:inviteAccept.signOutFirst` | Önce çıkış yap, sonra daveti kabul et. | Open question: yes. The current text is 'Önce oturumu kapat, sonra daveti kabul et.' I checked InvitePage.tsx: the banner's button is common.signOut, which reads 'Çıkış yap'. The instruction should name that button. 'oturumu kapat' stays only for closing one session or device in Account. |
| `core:inviteAccept.otherSession` | Bu davet {email} için. Çıkış yap, sonra daveti kabul et. | This banner text sits beside the 'Çıkış yap' button (InvitePage.tsx). It now uses the same verb as the button and as signOutFirst, and 'daveti' keeps the two strings parallel. {email} is followed by the separate word 'için', so no suffix is needed. |

## Consent screen (OAuth) — security

Shown when an agent asks to connect. Every line decides whether someone approves an agent; none may soften.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `oauthConsent:title` (new) | Connect {client} | {client} bağla | {client} bağlantısı |
| `oauthConsent:titleFrom` (new) | {host}: connect {client} | {host}: {client} bağla | {host}: {client} bağlantısı |
| `oauthConsent:description` (new) | An agent asks to work in this Studio for you. Check what it may do before you approve. | Bir agent bu Studio'da senin adına çalışmak istiyor. Onaylamadan önce neler yapabileceğine bak. |  |
| `oauthConsent:invalid.title` (new) | This request can't be used | Bu istek kullanılamaz |  |
| `oauthConsent:invalid.description` (new) | It expired, was already answered, or was changed on the way. Start the connection again from the agent. | Süresi doldu, zaten yanıtlandı ya da yolda değiştirildi. Bağlantıyı agent'tan yeniden başlat. | Süresi doldu, zaten yanıtlandı ya da aktarılırken değiştirildi. Bağlantıyı agent'tan yeniden başlat. |
| `oauthConsent:who.title` (new) | Who is asking | Kim istiyor |  |
| `oauthConsent:who.fromHost` (new) | Identified by {host} | {host} ile tanımlanıyor |  |
| `oauthConsent:who.registered` (new) | Registered with this Studio | Bu Studio'ya kayıtlı |  |
| `oauthConsent:who.selfRegistered` (new) | Self-registered, not verified | Kendini kaydetmiş, doğrulanmamış |  |
| `oauthConsent:who.lookalike` (new) | The name looks like {client}, but anyone can register a client under any name. Approve only if you started this connection from {client} yourself and the address it sends you back to, shown above, is the one it uses. | Ad {client} gibi görünüyor ama herkes herhangi bir adla istemci kaydedebilir. Yalnızca bu bağlantıyı {client} üzerinden kendin başlattıysan ve yukarıda gösterilen dönüş adresi onun kullandığı adresse onayla. | Adı {client} gibi görünüyor, ama herkes istediği adla istemci kaydedebilir. Yalnızca bu bağlantıyı {client} üzerinden kendin başlattıysan ve yukarıda gösterilen dönüş adresi gerçekten onun kullandığı adresse onayla. |
| `oauthConsent:who.sendsBack` (new) | Sends you back to {host} | Seni {host} adresine geri gönderir |  |
| `oauthConsent:who.thisComputer` (new) | Sends you back to an app on this computer | Seni bu bilgisayardaki bir uygulamaya geri gönderir |  |
| `oauthConsent:who.thisComputerApp` (new) | Sends you back to an app on this computer ({scheme}:) | Seni bu bilgisayardaki bir uygulamaya geri gönderir ({scheme}:) |  |
| `oauthConsent:who.loopbackWarning` (new) | Every address this agent can send you back to is on this computer. Approve only if you started the connection from an app here. | Bu agent'ın seni geri gönderebileceği her adres bu bilgisayarda. Yalnızca bağlantıyı buradaki bir uygulamadan başlattıysan onayla. |  |
| `oauthConsent:who.stepUp` (new) | This agent is already connected and asks for more. What it may do today is ticked. | Bu agent zaten bağlı ve daha fazlasını istiyor. Bugün yapabildikleri işaretli. | Bu agent zaten bağlı ve daha fazlasını istiyor. Şu an yapabildikleri işaretli. |
| `oauthConsent:scopes.title` (new) | What it may do | Neler yapabilir |  |
| `oauthConsent:scopes.description` (new) | Untick anything it should not do. Your role decides the rest: what it does not give is left out. | Yapmaması gerekenlerin işaretini kaldır. Gerisine rolün karar verir: rolünün vermediği şeyler dışarıda kalır. |  |
| `oauthConsent:scopes.legend` (new) | Permissions | İzinler |  |
| `oauthConsent:scopes.notInRole` (new) | {label} (not in your role) | {label} (rolünde yok) |  |
| `oauthConsent:scopes.narrowed` (new) | {label}, only for your own work in your role ({scope}) | {label}, rolünde yalnızca kendi işin için ({scope}) |  |
| `oauthConsent:scopes.added` (new) | {label} (new) | {label} (yeni) |  |
| `oauthConsent:scopes.offline` (new) | It stays connected and renews its access by itself, for at most 90 days, until the connection is revoked or your access ends. | Bağlantı geri alınana ya da erişimin bitene kadar, en fazla 90 gün boyunca bağlı kalır ve erişimini kendisi yeniler. | Bağlantı iptal edilene ya da erişimin bitene kadar, en fazla 90 gün boyunca bağlı kalır ve erişimini kendisi yeniler. |
| `oauthConsent:scopes.sites` (new) | {count, plural, one {It reaches only the site you work on.} other {It reaches only the # sites you work on.}} | {count, plural, one {Yalnızca üzerinde çalıştığın siteye erişir.} other {Yalnızca üzerinde çalıştığın {count, number} siteye erişir.}} |  |
| `oauthConsent:scopes.none` (new) | Choose at least one permission. | En az bir izin seç. |  |
| `oauthConsent:mode.title` (new) | How it works | Nasıl çalışır |  |
| `oauthConsent:mode.description` (new) | How independently the agent may work. You can change it later. | Agent'ın ne kadar bağımsız çalışabileceği. Sonra değiştirebilirsin. |  |
| `oauthConsent:mode.legend` (new) | Agent mode | Agent modu |  |
| `oauthConsent:approve` (new) | Approve | Onayla |  |
| `oauthConsent:deny` (new) | Deny | Reddet |  |

## Connected agents: identity labels — security

The badges and messages that say who a connected agent is. Each label here and its consent-screen twin (`connectedAgents:identifiedBy` = `oauthConsent:who.fromHost`, `connectedAgents:selfRegistered` = `oauthConsent:who.selfRegistered`) must stay word for word the same, so a person sees the same words for the same state on both screens; change both or neither.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `connectedAgents:description` (new) | Apps you connected by URL, such as Claude, ChatGPT or Cursor. Each works as you, never beyond your role, until you disconnect it. | URL ile bağladığın Claude, ChatGPT veya Cursor gibi uygulamalar. Her biri sen bağlantısını kesene kadar senin adına, rolünün ötesine geçmeden çalışır. | URL ile bağladığın Claude, ChatGPT veya Cursor gibi uygulamalar. Her biri, sen bağlantısını kesene kadar senin adına çalışır ve hiçbir zaman rolünün ötesine geçmez. |
| `connectedAgents:allDescription` (new) | Every member's connections. Disconnecting one ends it at once; its member can connect it again. | Tüm üyelerin bağlantıları. Birinin bağlantısını kesmek onu hemen sonlandırır; üyesi yeniden bağlayabilir. |  |
| `connectedAgents:identifiedBy` (new) | Identified by {host} | {host} ile tanımlanıyor |  |
| `connectedAgents:selfRegistered` (new) | Self-registered, not verified | Kendini kaydetmiş, doğrulanmamış |  |
| `connectedAgents:lookalike` (new) | Looks like {client}, not verified as it | {client} gibi görünüyor, öyle olduğu doğrulanmadı |  |
| `connectedAgents:disconnectedDescription` (new) | {client} can no longer work in this Studio. If it asks to connect again, you decide again. | {client} artık bu Studio'da çalışamaz. Yeniden bağlanmak isterse yine sen karar verirsin. |  |

## Sign-up with the setup link — security

The first-account screen opened from the setup link.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `core:auth.setupDescription` (changed) | You opened the setup link printed when Cloudhal started or was deployed. The account you create now becomes the owner; afterwards sign-up closes. | Cloudhal başlarken ya da dağıtılırken yazdırılan kurulum bağlantısıyla geldin. Şimdi oluşturacağın hesap sahip olur; ardından yeni kayıtlar kapanır. | Cloudhal başlarken ya da dağıtılırken yazdırılan kurulum bağlantısıyla geldin. Şimdi oluşturacağın hesap Sahip olur; ardından kayıt kapanır. |

## Account › Access

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `core:account.access.features.mcpOauth` (new) | OAuth for MCP clients | MCP istemcileri için OAuth |  |
| `core:account.access.featureHints.mcpOauth` **fixed in this PR** (new) | MCP clients registered with this Studio sign in at /mcp with OAuth; you approve each connection. | Bu Studio'ya kayıtlı MCP istemcileri /mcp adresinde OAuth ile giriş yapar; her bağlantıyı sen onaylarsın. |  |

Fixed in this PR:
- `core:account.access.featureHints.mcpOauth`: was “Bu Studio'ya kayıtlı MCP istemcileri /mcp adresinde OAuth ile oturum açar; her bağlantıyı sen onaylarsın.”. Studio says "giriş yap" for sign in everywhere else.

## Connected agents page

Account › Connected agents and the everyone's list for administrators.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `connectedAgents:title` (new) | Connected agents | Bağlı agent'lar |  |
| `connectedAgents:allTitle` (new) | Everyone's connected agents | Herkesin bağlı agent'ları |  |
| `connectedAgents:columns.agent` (new) | Agent | Agent |  |
| `connectedAgents:columns.owner` (new) | Member | Üye |  |
| `connectedAgents:columns.access` (new) | Access | Erişim |  |
| `connectedAgents:columns.lastUsed` (new) | Last used | Son kullanım |  |
| `connectedAgents:columns.connected` (new) | Connected | Bağlanma | Bağlanma tarihi |
| `connectedAgents:never` (new) | Never | Hiç | Hiç kullanılmadı |
| `connectedAgents:disconnect` (new) | Disconnect | Bağlantıyı kes |  |
| `connectedAgents:disconnectLabel` (new) | Disconnect {client} | {client} bağlantısını kes |  |
| `connectedAgents:resource` (new) | connection | bağlantı |  |
| `connectedAgents:disconnected` (new) | Disconnected | Bağlantı kesildi |  |
| `connectedAgents:empty` (new) | No agents connected by URL | URL ile bağlı agent yok |  |
| `connectedAgents:emptyDescription` (new) | Add this Studio's MCP URL to Claude, ChatGPT, Cursor or VS Code. You approve each connection here. | Bu Studio'nun MCP URL'sini Claude, ChatGPT, Cursor veya VS Code'a ekle. Her bağlantıyı burada onaylarsın. |  |
| `connectedAgents:allEmpty` (new) | Nobody has connected an agent by URL | Henüz kimse URL ile agent bağlamadı |  |

## Connect an agent (MCP client setup)

The Connect by URL / With an agent key panel.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `connectedAgents:setup.description` **fixed in this PR** (new) | Give an app this Studio's MCP URL and approve it when it asks, or create an agent key for scripts and clients that cannot sign in. | Bir uygulamaya bu Studio'nun MCP URL'sini ver ve istediğinde onayla ya da giriş yapamayan betikler ve istemciler için bir agent anahtarı oluştur. |  |
| `connectedAgents:setup.tabs.key` (new) | With an agent key | Agent anahtarıyla |  |
| `connectedAgents:setup.tabs.url` (new) | Connect by URL | URL ile bağlan |  |
| `connectedAgents:setup.url` (new) | MCP URL | MCP URL'si |  |
| `connectedAgents:setup.urlDescription` **fixed in this PR** (new) | The app opens this Studio in your browser, you sign in and approve what it may do. No key to copy. | Uygulama bu Studio'yu tarayıcında açar; giriş yapıp neler yapabileceğini onaylarsın. Kopyalanacak anahtar yok. |  |
| `connectedAgents:setup.client` (new) | App | Uygulama |  |
| `connectedAgents:setup.clients.claudeAi` (new) | Claude.ai, Desktop and mobile | Claude.ai, masaüstü ve mobil |  |
| `connectedAgents:setup.clients.claudeCode` (new) | Claude Code | Claude Code |  |
| `connectedAgents:setup.clients.codex` (new) | ChatGPT and Codex | ChatGPT ve Codex |  |
| `connectedAgents:setup.clients.cursor` (new) | Cursor | Cursor |  |
| `connectedAgents:setup.clients.vscode` (new) | VS Code | VS Code |  |
| `connectedAgents:setup.clients.inspector` (new) | MCP Inspector | MCP Inspector |  |
| `connectedAgents:setup.hints.claudeAi` (new) | In Claude, open Settings, then Connectors, and add a custom connector with this URL. Claude opens Studio to approve it. | Claude'da Settings'i, ardından Connectors'ı aç ve bu URL ile özel bir bağlayıcı (custom connector) ekle. Claude onay için Studio'yu açar. |  |
| `connectedAgents:setup.hints.claudeCode` (new) | Run it in a terminal, then type /mcp inside Claude Code and choose Authenticate. Your browser opens Studio to approve it. | Bir terminalde çalıştır, sonra Claude Code içinde /mcp yaz ve Authenticate'i seç. Tarayıcın onay için Studio'yu açar. |  |
| `connectedAgents:setup.hints.codex` (new) | Codex: run both lines; the second opens Studio to approve it. ChatGPT: add a connector with this URL in its settings. | Codex: iki satırı da çalıştır; ikincisi onay için Studio'yu açar. ChatGPT: ayarlarında bu URL ile bir bağlayıcı ekle. |  |
| `connectedAgents:setup.hints.cursor` **fixed in this PR** (new) | Save it as ~/.cursor/mcp.json, or .cursor/mcp.json in a project, then sign in when Cursor asks. Studio opens to approve it. | ~/.cursor/mcp.json ya da bir projede .cursor/mcp.json olarak kaydet, sonra Cursor isteyince giriş yap. Onaylaman için Studio açılır. |  |
| `connectedAgents:setup.hints.vscode` (new) | Save it as .vscode/mcp.json in your project, then start the server. VS Code asks you to sign in and opens Studio. | Projende .vscode/mcp.json olarak kaydet, sonra sunucuyu başlat. VS Code giriş yapmanı ister ve Studio'yu açar. |  |
| `connectedAgents:setup.hints.inspector` (new) | Run it, choose Streamable HTTP, paste the URL and open Auth Settings, then Quick OAuth Flow. Good for checking a connection. | Çalıştır, Streamable HTTP'yi seç, URL'yi yapıştır ve Auth Settings'i, ardından Quick OAuth Flow'u aç. Bir bağlantıyı denemek için iyidir. |  |
| `connectedAgents:setup.needsDcr` (new) | {client} registers itself (dynamic client registration), which is off on this server. Ask its operator to turn CLOUDHAL_MCP_DCR back on, or use an agent key. | {client} kendini kaydeder (dinamik istemci kaydı) ve bu sunucuda bu özellik kapalı. Sunucunun yöneticisinden CLOUDHAL_MCP_DCR'ı yeniden açmasını iste ya da bir agent anahtarı kullan. | {client} kendini kaydeder (dinamik istemci kaydı) ve bu sunucuda bu özellik kapalı. Sunucunun yöneticisinden CLOUDHAL_MCP_DCR ayarını yeniden açmasını iste ya da bir agent anahtarı kullan. |
| `connectedAgents:setup.needsPublicUrl` (new) | Claude.ai and ChatGPT connect from their own servers, which cannot reach {url}. Start Studio with --base-url set to a public https:// address, or use an app on this computer, such as Claude Code or Codex. | Claude.ai ve ChatGPT kendi sunucularından bağlanır; bu sunucular {url} adresine erişemez. Studio'yu --base-url ile herkese açık bir https:// adresine ayarlayarak başlat ya da bu bilgisayardaki Claude Code veya Codex gibi bir uygulama kullan. |  |
| `connectedAgents:setup.unavailable` (new) | Neither way an app can identify itself is on here (metadata documents and dynamic registration). Ask this server's operator, or use an agent key. | Bir uygulamanın kendini tanıtabileceği iki yol da (meta veri belgeleri ve dinamik kayıt) burada kapalı. Bu sunucunun yöneticisine sor ya da bir agent anahtarı kullan. |  |

Fixed in this PR:
- `connectedAgents:setup.description`: was “Bir uygulamaya bu Studio'nun MCP URL'sini ver ve istediğinde onayla ya da oturum açamayan betikler ve istemciler için bir agent anahtarı oluştur.”. Studio says "giriş yap" for sign in everywhere else.
- `connectedAgents:setup.urlDescription`: was “Uygulama bu Studio'yu tarayıcında açar; giriş yapar ve neler yapabileceğini onaylarsın. Kopyalanacak anahtar yok.”. "giriş yapar" reads as the app signing in; in English the person signs in. "giriş yapıp … onaylarsın" keeps both verbs on the person.
- `connectedAgents:setup.hints.cursor`: was “~/.cursor/mcp.json ya da bir projede .cursor/mcp.json olarak kaydet, sonra Cursor isteyince oturum aç. Onaylaman için Studio açılır.”. Studio says "giriş yap" for sign in everywhere else.

## Collections: Ended badge

Added on 2026-10-25 (#113), after your collections review.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `listings:ended.badge` (new) | Ended (collection rule) | Sona erdi (koleksiyon kuralı) |  |
| `listings:ended.reason` (new) | {action, select, unlist {This entry ended on {time} ({zone} time) under its collection's expiry on “{field}”. It's still published and its page stays at its address, but it has left lists, feeds, the sitemap and search.} hide {This entry ended on {time} ({zone} time) under its collection's expiry on “{field}”. It's still published, but its page answers “not found”, and it has left every list, feed and search.} other {This entry ended on {time} ({zone} time) under its collection's expiry on “{field}”.}} | {action, select, unlist {Bu kayıt, koleksiyonun “{field}” alanına bağlı sona erme kuralıyla {time} zamanında ({zone} saatiyle) sona erdi. Hâlâ yayında ve sayfası adresinde duruyor, ama listelerden, akışlardan, site haritasından ve aramadan çıktı.} hide {Bu kayıt, koleksiyonun “{field}” alanına bağlı sona erme kuralıyla {time} zamanında ({zone} saatiyle) sona erdi. Hâlâ yayında, ama sayfası “bulunamadı” yanıtı veriyor ve tüm listelerden, akışlardan ve aramadan çıktı.} other {Bu kayıt, koleksiyonun “{field}” alanına bağlı sona erme kuralıyla {time} zamanında ({zone} saatiyle) sona erdi.}} |  |

## Build chat on a playground

Added on 2026-10-23 evening, after your review.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `build:chat.playgroundHint` (new) | “Build with AI” runs on Workers AI, which the playground leaves out. Deploy Cloudhal to your Cloudflare account to use it. | “AI ile kur” Workers AI ile çalışır; deneme alanında bu yok. Kullanmak için Cloudhal'ı kendi Cloudflare hesabına kur. |  |

## Status pages (site visitors)

Public pages a visitor sees instead of the site (RFC-0043). Formal register ("siz"); simple `{name}` arguments only.

| Key | English | Current Turkish | Suggested |
|---|---|---|---|
| `status:notPublished.title` (new) | Coming soon | Çok yakında |  |
| `status:notPublished.body` (new) | This site isn't published yet. Check back soon. | Bu site henüz yayımlanmadı. Yakında tekrar bakın. |  |
| `status:maintenance.title` (new) | We'll be back soon | Yakında geri döneceğiz |  |
| `status:maintenance.body` (new) | This site is down for maintenance. Thanks for your patience. | Bu site bakım nedeniyle kapalı. Sabrınız için teşekkürler. |  |
| `status:comingSoon.title` (new) | Coming soon | Çok yakında |  |
| `status:comingSoon.body` (new) | This site isn't open yet. Check back soon. | Bu site henüz açılmadı. Yakında tekrar bakın. |  |
| `status:unavailable.title` (new) | Temporarily unavailable | Geçici olarak erişilemiyor |  |
| `status:unavailable.body` (new) | This site can't be reached right now. Please try again in a few minutes. | Bu siteye şu anda ulaşılamıyor. Lütfen birkaç dakika sonra tekrar deneyin. |  |
| `status:error.title` (new) | Something went wrong | Bir sorun oluştu |  |
| `status:error.body` (new) | This page couldn't be shown. Please try again in a moment. | Bu sayfa gösterilemedi. Lütfen birazdan tekrar deneyin. |  |
| `status:previewExpired.title` (new) | This preview link has expired | Bu önizleme bağlantısının süresi doldu |  |
| `status:previewExpired.body` (new) | Ask for a new link to see this version. | Bu sürümü görmek için yeni bir bağlantı isteyin. |  |
| `status:backBy` (new) | Back by {time} | {time} itibarıyla geri döneceğiz | Tahmini dönüş: {time} |
| `status:reference` (new) | Reference: {reference} | Referans: {reference} |  |
| `status:builtWith` (new) | Built with Cloudhal | Cloudhal ile yapıldı |  |

## Fixed outside the changed keys

Strings you had already reviewed, changed only to keep a glossary term (sign in is *giriş yap*).

| Key | English | Was | Now |
|---|---|---|---|
| `core:agents.notEnabledDescription` | This server runs without sign-in, so it can't issue keys. Agents on your machine can still connect over stdio with cloudhal mcp. | Sunucu oturum açma olmadan çalışıyor, bu yüzden anahtar üretemez. Kendi bilgisayarındaki agent'lar yine de cloudhal mcp ile stdio üzerinden bağlanabilir. | Sunucu giriş olmadan çalışıyor, bu yüzden anahtar üretemez. Kendi bilgisayarındaki agent'lar yine de cloudhal mcp ile stdio üzerinden bağlanabilir. |

Left as they are: the session strings say *oturumu kapat* (close the session) for "sign out" of one session or device (`core:account.sessions.*`, `core:members.remove.signOut`) and in the invite page (`core:inviteAccept.signOutFirst`, `core:inviteAccept.otherSession`), where Studio's own button is *Çıkış yap*. Your call whether the invite page should say *Önce çıkış yap*.

