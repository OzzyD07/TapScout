# TapScout (Otonom Mobil QA) — Versiyon 1 Uygulama Planı

Tarih: 6 Ekim 2026  
Durum: Plan. Bu belge yazılırken kod, servis kurulumu, abonelik ve cihaz runner pilotu yoktur. Tarihler ve kapsam kesintileri öneridir; gate sonuçlarına göre güncellenir.

Bu belge [ürün kapsamı](01-product-scope-draft.md), [mimari](02-architecture.md), [agent ve test tasarımı](03-agent-and-test-design.md) ve [teslim/operasyon](04-delivery-and-operations.md) belgelerini, yarışma teslimine kadar uygulanacak **V1** iş planına çevirir. Tasarım kararları o belgelerde kalır; burada sıra, öncelik, kesinti ve kabul kriteri tanımlanır.

## 1. Yarışma çerçevesi ve V1 tanımı

Kaynak: [Devpost ana sayfa](https://nebiusglobalaihackathon.devpost.com/), [kurallar](https://nebiusglobalaihackathon.devpost.com/rules) — 6 Ekim 2026'da kontrol edildi.

| Konu | Kural | V1'e etkisi |
|---|---|---|
| Zorunlu teknoloji | En az bir NVIDIA açık kaynak model (Nemotron vb.), Nebius Token Factory veya AI Cloud üzerinde runtime çağrı | Planner Nemotron; gerçek çağrılar usage kaydıyla ispatlanır |
| Teslim | Çalışan demo URL, < 3 dk YouTube video, public repo + OSI lisans, kurulumlu README, İngilizce materyal, track seçimi, araç geri bildirimi | F5 fazı ve teslim kontrol listesi |
| Jüri erişimi | Ücretsiz, kısıtlamasız; kapalı sitede giriş bilgisi | Hazır jüri hesabı, hazır örnek build, hazır örnek rapor |
| Değerlendirme | Teknik uygulama, tasarım, potansiyel etki, fikir kalitesi — **eşit ağırlık** | Arayüz cilası ve rapor okunabilirliği ayrı iş kalemi; "Design" puanı ihmal edilmez |
| Son teslim | **30 Ekim 2026, 10:00 PDT = 20:00 Türkiye** | İç hedef: **29 Ekim 20:00** Submitted; 24 saat tampon |
| Değerlendirme | 1 Aralık 20:00 – 15 Aralık 23:00 Türkiye | Servis/kredi/hesap sürekliliği |
| Teslim sonrası | Esaslı değişiklik yasak | Feature freeze ve release tag teslimden önce |

Track: `04` başlangıç tercihi **Best Apps and Agents**. Ancak **Coding and Agentic Engineering** tanımı ("agents that write, run, and test code") test eden bir agent ile doğrudan örtüşür. Seçim §11'de açık karar olarak duruyor.

**V1 = teslim edilen jüri demosu.** Jüri hazır hesapla girer, hazır Android+iOS örneğiyle (veya uyumlu kendi build'iyle) mod seçip test başlatır, iki platformun canlı ilerlemesini ve screenshot'larını izler, kanıtlı/tekrar oranlı birleşik raporu görür. Belgelerdeki tasarım ilkeleri (dürüst durum etiketleri, `n/m`, `Unsupported`, coverage yüzdesi yok, ground truth'un agent'tan ayrılması) V1'de de geçerlidir; kesinti derinlikte yapılır, dürüstlükte yapılmaz.

## 2. Zaman gerçeği ve planlama ilkeleri

6–30 Ekim arası **24 takvim günü** var; belgelerdeki kapsam bu süre için geniştir. Bu yüzden:

1. **Önce uçtan uca iskelet.** En büyük risk agent zekâsı değil, altyapı zinciridir (GitHub Actions runner → emulator/simulator → Appium → Supabase (DB + Storage) → web). İlk hafta bu zincir iki platformda tek eylemle çalışmalı.
2. **Sözleşmeler önce, paralel üretim sonra.** Olay, eylem, gözlem, bulgu ve API sözleşmeleri `packages/shared` içinde Zod ile 2. günde sabitlenir; web, backend, runner ve agent işleri buna karşı paralel geliştirilir.
3. **Gate'ler ve hazır fallback'ler.** Her yüksek riskli entegrasyonun bir tarihi ve önceden seçilmiş B planı vardır (§7).
4. **Derinlik kesintisi, mod kesintisi değil.** Beş mod V1'de görünür; her biri küçük ama gerçek bir kontrol paketiyle çalışır. Desteklenmeyen şeyler `Unsupported` / `Not tested` olarak raporlanır.
5. **Feature freeze 24 Ekim.** Son 5 gün sertleştirme, gerçek örnek koşu, video ve teslim içindir.

Öncelik etiketleri: **P0** teslim için zorunlu, **P1** güçlü demo için gerekli, **P2** zaman kalırsa.

## 3. V1 kapsamı

### 3.1. Kapsam içi

| Alan | V1 içeriği | Öncelik |
|---|---|---|
| Giriş | Supabase Auth e-posta/şifre, public signup kapalı, admin ile oluşturulan jüri hesapları | P0 |
| Build | Hazır örnek build seçimi; Supabase Storage'a imzalı doğrudan yükleme (APK, Simulator `.app` ZIP); runner'da kabul doğrulaması | P0 hazır örnek / P1 kullanıcı yüklemesi |
| Koşu | Platform + mod seçimi, atomik run/session/outbox, `workflow_dispatch`, iptal | P0 |
| Runner | Android (Ubuntu x64 + KVM + emulator + UiAutomator2), iOS (macOS ARM64 + Simulator + XCUITest), Linux rapor job'u | P0 Android, P0 iOS (gate'li, §7) |
| Agent | Observe → Plan → Act → Evaluate; state graph; Nemotron planner; validator; bütçe; durma sebepleri | P0 |
| Modlar | Beşi de, §5'teki V1 kontrol paketiyle | P0 Functional, P1 diğerleri |
| Doğrulama | Temiz önkoşuldan replay, gerçek `n/m`, engelli girişimlerin ayrı sayımı | P1 |
| Canlı izleme | Supabase Realtime + DB geçmişi; platform sekmeleri, faz, eylem, screenshot, sayaçlar | P0 |
| Rapor | Birleşik rapor; platform/mod filtreleri, bulgu kartı, kanıt, replay adımları; Partial/Cancelled | P0 deterministik çekirdek / P1 Nemotron özeti |
| Güvenlik | OIDC ile runner bootstrap, kapsamlı kısa ömürlü token, model relay, RLS, log maskeleme | P0 |
| Güvenilirlik | Outbox, Cron reconcile, heartbeat, lease/attempt kontrolü, yalnız rapor retry | P0 temel / P1 tam |
| Örnek uygulama | İki platformda aynı akışlar, kasıtlı hatalı + düzeltilmiş varyant, ayrı ground-truth manifest | P0 |
| Teslim | İngilizce README, LICENSE, video, Devpost formu, örnek rapor | P0 |

### 3.2. V1 dışında (açıkça)

- Tam video yayını ve video segmentleri (P2; V1 screenshot tabanlı). Animasyon/performans ölçümü yok.
- iOS ağ bozma, `sendMemoryWarning`, gerçek cihaz koşulları → `Unsupported`.
- Android ağ bozma → P2; probe geçmezse `Unsupported`.
- Test edilen uygulama için şifreli credential/OTP yönetimi → P2. V1 örneği giriş gerektirmez; kullanıcı build'i giriş gerektiriyorsa akış "erişim engeli" olarak raporlanır.
- Hybrid/WebView ve canvas ekranlar için özel destek, görsel koordinatla tap → P2 (öncelik hierarchy locator'ı).
- Geniş cihaz matrisi, self-hosted runner, repo-to-build, ödeme/kayıt, çoklu takım.
- Supabase Pro Storage alternatifi; ikinci Supabase projesi.

## 4. Repo ve modül yapısı

Tek public monorepo, pnpm workspace, TypeScript.

```text
apps/
  web/                 Next.js App Router + Tailwind + shadcn/ui (UI + Route Handlers)
  sample-app/          Örnek mobil uygulama (öneri: Expo/React Native, §11)
packages/
  shared/              Zod sözleşmeleri: event, observation, action, finding, report, API DTO
  agent/               Runner içindeki agent döngüsü ve modüller
  adapters/            Appium/WebdriverIO: android-uiautomator2, ios-xcuitest, capability probe
  checks/              Mod kontrol paketleri + store rule pack (sürümlü JSON)
  report/              Deterministik rapor birleştirme + model özet doğrulayıcı
  runner-cli/          Workflow'dan çağrılan giriş noktası (bootstrap, run, upload)
supabase/
  migrations/          Şema, RLS, RPC, realtime publication, cron
.github/workflows/
  qa-run.yml           Android / iOS / rapor job'ları (workflow_dispatch)
  build-sample.yml     Örnek APK ve iOS Simulator .app üretimi (macOS runner'da)
quality/
  ground-truth/        Seed bug manifest'i — runtime paketlerinden import edilemez
```

Kural: `quality/` hiçbir runtime paketinden import edilemez (lint kuralıyla korunur). Kullanıcı Windows üzerinde çalıştığı için iOS örnek build'i yerelde değil `build-sample.yml` ile GitHub-hosted macOS runner'ında üretilir.

## 5. Mod başına V1 kontrol paketi

`03` §6'daki ilk paketlerin V1'de uygulanacak alt kümesi:

| Mod | V1 kontrolleri | Doğrulama/dayanak | V1'de Unsupported / Not tested |
|---|---|---|---|
| **Functional** (P0) | Keşfedilen akışlarda beklenen UI geçişi; form geri bildirimi; kaydet → uygulamayı yeniden aç → değer korunuyor mu (persistence); geri dönüş yolları | `observed_invariant`, `ui_semantics`; replay | Backend etkisi iddiası |
| **Bug / Stress** (P1) | Tek değişkenli: boş giriş, sınırlı uzun metin, emoji/Unicode, background/foreground, klavye açıkken işlem, sınırlı rapid-tap; crash tespiti (process kaybı + log) | `runtime_signal`; temiz dal + replay | Ağ (iOS her zaman, Android probe'a bağlı), izin ret senaryosu P2, low-memory |
| **UI / UX** (P1) | Klavye/overlay altında kalan eylem (etkileşimle denenir), metin clipping/overflow adayı, element overlap, safe-area/bounds | Geometri (hierarchy bounds) + VLM adayı; ölçüm/AI yorumu ayrı etiket | Tasarım dosyası karşılaştırması |
| **Accessibility** (P1) | Etkileşimli öğede label/role eksikliği, touch target adayı (48dp / 44pt bağlamıyla), büyük font ölçeğinde clipping, iOS 17+ ise `performAccessibilityAudit` | Hierarchy + platform audit çıktısı | Tam TalkBack/VoiceOver keşfi, WCAG uygunluk iddiası |
| **Store Readiness** (P1) | Rule pack v1: hesap oluşturma varsa uygulama içi hesap silme girişi (Apple 5.1.1, Google), privacy policy bağlantısı bulunabilir/açılabilir, izin açıklaması gözlemi, eksik runtime-dışı bilgi listesi | `platform_rule` + tarihli kaynak URL | Metadata/gizlilik beyanı doğruluğu, onay garantisi |

`Full Autonomous Test` ön ayarı beşini seçer. Modlar platform bütçesini paylaşır (`03` §9 değerleri V1 default'udur).

## 6. Fazlar ve takvim

### F0 — Hazırlık ve sözleşmeler (6–7 Ekim)

| İş | Çıktı | Öncelik |
|---|---|---|
| Hesaplar | Nebius Token Factory API key ve kredi; Vercel Pro; Supabase Pro (EU, Storage dahil); GitHub repo (public) — satın alma/kurulum proje sahibince | P0 |
| Model keşfi | Token Factory'de Nemotron adayları ve görsel model adaylarına gerçek `curl` çağrısı; structured output (`json_schema`) denemesi; latency/usage kaydı. NVIDIA'nın görsel modeli katalogda varsa öncelikli aday olarak denenir | P0 |
| Monorepo iskeleti | §4 yapısı, lint/format/tsconfig, CI'da typecheck | P0 |
| Sözleşmeler | `packages/shared`: `RunEvent`, `Observation`, `PlannerOutput`, `DeviceAction`, `Finding`, `Report`, API DTO'ları; `schemaVersion` | P0 |
| DB şeması v1 | `02` §6 tabloları migration olarak; RLS; `create_run` ve `claim_outbox` RPC'leri | P0 |
| Örnek uygulama v0 | 3 ekranlı minimal uygulama (giriş ekranı, form, profil) — pipeline pilotu için | P0 |

### F1 — Uçtan uca iskelet ve altyapı pilotu (8–13 Ekim)

Hedef: `03` §10 "İki platform temel zinciri" — henüz akıllı agent yok, sabit tek eylem.

1. `build-sample.yml`: x86_64 içeren APK ve ARM64 Simulator `.app.zip` üretimi; SHA-256 kaydı; Supabase Storage `builds` bucket'ına yükleme.
2. `qa-run.yml` Android job: nested virtualization etiketi, KVM izni, emulator boot, Appium + UiAutomator2, APK kurulum/açılış, tek tap, screenshot.
3. Runner bootstrap: GitHub OIDC → `/api/runner/bootstrap` → session token + lease; presigned artifact upload; olay gönderimi; heartbeat.
4. Web: giriş, örnek build seçimi, Start Test, run sayfasında Realtime olay + screenshot.
5. Model relay: `/api/relay/plan` üzerinden tek gerçek Nemotron çağrısı (eylem seçimi), usage kaydı.
6. iOS job: macOS ARM64, Simulator boot, XCUITest, `.app` kurulum/açılış, tek tap, screenshot.
7. Linux rapor job'u iskeleti: iki platform sonucunu okuyup deterministik JSON rapor yazma.

**Gate G1 (11 Ekim):** Android zinciri web'de canlı screenshot ile çalışıyor.  
**Gate G2 (13 Ekim):** iOS zinciri aynı şekilde çalışıyor.

### F2 — Agent çekirdeği ve canlı izleme (13–19 Ekim)

| İş | Ayrıntı | Öncelik |
|---|---|---|
| Observer + normalizer | Screenshot + hierarchy, kararlılık bekleme, element normalizasyonu, secret maskeleme, koordinat dönüşümü | P0 |
| State graph | Fingerprint (`03` §3.2), `ScreenState`/`Transition` kaydı, ziyaret/deneme hafızası, döngü tespiti | P0 |
| Planner | Nemotron prompt v1, kısa bağlam (ilgili öğeler + geçmiş özeti + frontier), JSON şema, 1 repair, 2 backoff retry | P0 |
| Validator/scheduler | Lease, observation, capability, locator çözümü (ID → semantik → koordinat P2), bütçe; timeout sonrası tekrar yok | P0 |
| Adapters | Ortak arayüz: `tap/type/scroll/back/launch/background/screenshot`; capability probe sonucu kaydı | P0 |
| Bütçe ve durma | `03` §9 değerleri, soft stop 17. dk, stop reason'lar, `Not tested` / `Inconclusive` | P0 |
| Functional modu | Akış hedefleri, persistence kontrolü, beklenen-sonuç dayanağı | P0 |
| Canlı UI | Platform sekmeleri, faz göstergesi, olay timeline'ı, screenshot görüntüleyici, sayaçlar (ekran/geçiş/eylem/kontrol), iptal, reconnect + sequence ile tekilleştirme | P0 |
| Örnek uygulama v1 | Tam akışlar ve kasıtlı hatalar (§8) | P0 |

**Gate G3 (16 Ekim):** Nemotron planner örnek uygulamada en az 3 farklı ekranı keşfeden, geçersiz eylem uygulamayan bir koşu tamamlıyor.

### F3 — Modlar, doğrulama ve rapor (19–24 Ekim)

| İş | Öncelik |
|---|---|
| Stress dalları: temiz başlangıç, tek değişkenli perturbation, reset kaydı (`03` §7'deki dört parça) | P1 |
| VLM entegrasyonu: `/api/relay/vision`, yalnız yeni state/aday üzerinde; region → screenshot koordinatı | P1 |
| UI/UX ve Accessibility kontrol paketleri; iOS audit probe | P1 |
| Store rule pack v1 (JSON, `ruleId`, kaynak URL, kontrol tarihi) + kontrolü | P1 |
| Candidate → Observed → Replay → `Reproduced n/m`; en çok 3 geçerli / 4 toplam deneme | P1 |
| Rapor job'u: `ReportAttempt` lease, deterministik birleştirme, Nemotron özet + referans doğrulayıcı, model başarısızsa özetsiz rapor | P0 / P1 |
| Rapor UI: özet, platform/mod filtreleri, bulgu kartı (beklenen/gözlenen, dayanak, `n/m`, severity gerekçesi, kanıt, replay adımları), kontrol durum tablosu | P0 |
| Kullanıcı build yükleme UI'ı + runner kabul doğrulaması (ABI, Simulator hedefi, ZIP güvenliği) | P1 |

**Feature freeze: 24 Ekim 23:59.** Bu tarihten sonra yalnız hata düzeltme, metin ve görsel cila.

### F4 — Sertleştirme, kalite pilotu, jüri verisi (25–28 Ekim)

1. `04` §5 kabul kontrol listesinin V1 alt kümesi (§9).
2. Kalite pilotu (`03` §10): hatalı build, düzeltilmiş kontrol build'i, değiştirilmiş akış varyantı; ground truth ile koşu sonrası karşılaştırma; sonuçların kaydı.
3. Gerçek **"Previously completed sample run"** raporunun üretilmesi ve sabitlenmesi.
4. Jüri hesapları, `APP_BASE_URL`, Deployment Protection kontrolü, gizli pencereden giriş testi.
5. Ölçüm: kuyruk dahil gerçek süre aralığı, çift koşu maliyeti → `02` ve `04` §11 kaydına yazılır.
6. Görsel cila: boş/hata/bekleme durumları, mobil genişlik, ilk izlenim (landing → Start Test < 3 tık).

### F5 — Teslim (28–29 Ekim, tampon 30 Ekim)

| İş | Not |
|---|---|
| İngilizce README | Amaç, mimari diyagram, Nemotron/Token Factory kullanımı, kurulum, `.env.example`, desteklenen build'ler, sınırlamalar, demo linki |
| LICENSE | Apache-2.0 veya MIT (§11) |
| Demo video (< 3 dk) | Giriş → örnek seçimi → iki platform canlı ilerleme → kanıtlı bulgu + `n/m` → birleşik rapor. Kesilen bekleme açıkça belirtilir; sır görünmez |
| Devpost formu | Açıklama, track, testing instructions (`04` §7 şablonu), araç geri bildirimi, video ve repo linki |
| Release | Tag, workflow ref, sample hash'leri, model/config sürümü kaydı; değerlendirme deployment'ına otomatik yayın kapatılır |
| Submit | **29 Ekim 20:00'a kadar** "Submitted" durumu doğrulanır |

## 7. Gate'ler, riskler ve B planları

| Gate / risk | Tarih | Başarı ölçütü | B planı |
|---|---|---|---|
| G1 Android zinciri | 11 Ekim | KVM'li emulator boot + tap + canlı screenshot | GitHub-hosted runner'da KVM/emulator sorunu çözülemezse runner etiketini WarpBuild (GitHub organization) veya larger runner'a çevirmek; altyapı adaptörü runner sağlayıcısından bağımsız tutulur |
| G2 iOS zinciri | 13 Ekim | Simulator `.app` kurulum + tap + canlı screenshot | 16 Ekim'e kadar uzatma; olmazsa iOS "Experimental" etiketiyle sadece temel keşif ve rapor, demo Android ağırlıklı (kapsam değişikliği olduğu için proje sahibi onayı gerekir, §11) |
| G3 Planner kalitesi | 16 Ekim | ≥3 ekran keşfi, geçersiz eylem uygulanmıyor | Daha büyük Nemotron varyantı (maliyet `02`'de güncellenir); deterministik keşif sezgileri (görünmeyen buton önceliği) ile model çağrısını azaltmak |
| Görsel model | 20 Ekim | UI elemanı seviyesinde anlamlı aday | VLM'siz geometri tabanlı UI/A11y kontrolleri; VLM bulguları "AI yorumu" olarak sınırlı |
| macOS kuyruk/concurrency | F1'de ölçülür | Demo sırasında makul bekleme | Eşzamanlı koşu sınırı + görünür kuyruk; jüriye hazır rapor her zaman erişilebilir |
| Süre aşımı | Sürekli | Fazlar takvimde | P2'ler ilk kesilir, sonra P1 sırası: Store → A11y audit → Stress dalları → kullanıcı yüklemesi |
| Maliyet | Haftalık | `02` bütçesi içinde | Geliştirmede tek platform koşuları, kısa timeout'lu smoke koşuları |
| Determinizm | F4 | Örnek rapor gerçek koşu | Başarısız koşular saklanır; demo seçimi kalite ölçümünden ayrı tutulur (`03` §10) |

## 8. Örnek uygulama planı

Tek kaynaktan iki platform; backend yok (yerel depolama) — böylece reset uygulama verisini temizlemekle sınırlı ve doğrulanabilir olur, iki jüri aynı veriyi paylaşmaz.

| Ekran / akış | Amaç |
|---|---|
| Onboarding → Kayıt formu (ad, e-posta, "Continue") | Form, klavye, input stres |
| Profil görüntüle / düzenle / kaydet | Persistence kontrolü |
| Not listesi → detay → ekle/sil | Keşif derinliği, liste temsilci seçimi |
| Ayarlar: privacy policy linki, hesap silme girişi (varyanta göre) | Store readiness |
| İkon butonlar | Accessibility label kontrolü |

Kasıtlı hata adayları (build-time flag; liste yalnız `quality/ground-truth/` içinde):

- Klavye açıkken "Continue" butonunun klavye altında kalması.
- Profil değişikliğinin uygulama yeniden açılınca kaybolması.
- Label'sız ikon buton.
- Uzun metinde clipping.
- Belirli bir girişte crash (emoji/uzun metin) — iki platformda gerçekten üretilebilirse.

Varyantlar: `seeded` (demo), `fixed` (kontrol), `changed-flow` (label/sıra/layout değişmiş). Her biri iki platformda hash ve source commit ile kayıtlı.

## 9. V1 kabul kriterleri

`04` §5'ten V1 için zorunlu (P0) olanlar:

- [ ] Jüri hesabıyla gizli pencereden giriş; signup kapalı; başka kullanıcının run/artifact'ine erişim reddediliyor.
- [ ] Hazır örnekle Android+iOS koşusu; iki platformda gerçek eylem ve koşu sürerken canlı screenshot/olay.
- [ ] Nemotron gerçek Token Factory çağrısı yapıyor; usage kaydı var; kalıcı sağlayıcı anahtarı runner/browser'da yok.
- [ ] En az bir seed hata keşfediliyor ve tekrar deneniyor; `n/m` gerçek denemelerden; ground truth agent girdisinde yok.
- [ ] Desteklenmeyen kontroller `Unsupported`, bütçe sonunda yapılmayan `Not tested`, belirsiz `Inconclusive`.
- [ ] Tarayıcı kapatma/yeniden bağlanmada olay geçmişi DB'den geliyor, tekrar eden olay tekilleşiyor.
- [ ] Tek platform hatası `Partial` rapor üretiyor; iptal yeni ücretli job açmıyor ve kısmi kanıt erişilebilir.
- [ ] Callback'siz kapanan runner Cron/provider kontrolüyle açıklamalı terminal duruma geçiyor.
- [ ] Süresi dolmuş kanıt URL'si yenileniyor; hazır örnek rapor açılıyor; uyumsuz binary app bug'ı sayılmıyor.

P1 (teslimden önce hedeflenen): belirsiz/tekrar dispatch korumasının denenmesi, yalnız rapor retry'ı, düzeltilmiş build'de yanlış kesin bulgu analizi, değiştirilmiş akış keşfi, capability probe kayıtları, ortam değişikliklerinin geri alınması.

## 10. Paralel AI geliştirme düzeni

Sözleşmeler (F0) sabitlendikten sonra şu iş akışları ayrı branch/worktree'lerde paralel yürür:

| Akış | Kapsam | Bağımlılık |
|---|---|---|
| A — Web | Auth, build seçimi/yükleme, run oluşturma, canlı timeline, rapor UI | `shared` DTO + DB şeması |
| B — Backend | Route Handlers, RPC, outbox, Cron reconcile, OIDC bootstrap, relay, presign | DB şeması |
| C — Runner altyapısı | `qa-run.yml`, `build-sample.yml`, emulator/simulator/Appium kurulumları | Örnek uygulama v0 |
| D — Agent | Observer, graph, planner, validator, adapters, modlar, replay | `shared` + C'nin çalışan cihazı |
| E — Örnek uygulama | Akışlar, varyantlar, ground-truth manifest | — |
| F — Rapor | Deterministik birleştirme, özet doğrulayıcı, rapor job'u | `shared` Finding/Report |

Kurallar: her PR typecheck + birim testten geçer; sözleşme değişikliği yalnız `shared` üzerinden ve `schemaVersion` artırımıyla; agent modülleri cihaz olmadan kayıtlı observation fixture'larıyla test edilir (her pilot koşusunun hierarchy/screenshot'ları fixture olarak saklanır). Günlük bir entegrasyon koşusu (tek platform, kısa bütçe) maliyeti sınırlı tutar.

## 11. Proje sahibinin vermesi gereken kararlar

| Karar | Öneri | Neden |
|---|---|---|
| Track | **Coding and Agentic Engineering**'i yeniden değerlendirmek | Tanımı test eden agent'larla birebir örtüşüyor; `04`'teki tercih Best Apps and Agents |
| G2 başarısız olursa iOS | 16 Ekim'e kadar uzatma, sonra "Experimental" | Kullanıcı kapsamında iOS zorunlu; kesinti onay gerektirir |
| Örnek uygulama teknolojisi | Expo/React Native | `testID`/`accessibilityLabel` native hierarchy'ye doğrudan düşer; tek kaynaktan APK ve Simulator build |
| Lisans | Apache-2.0 | Kurallarda kabul edilenler arasında; patent maddesi |
| GitHub dispatch yetkisi | Pilotta fine-grained PAT, teslimden önce GitHub App | `04` §4.3 ile uyumlu; F1'i hızlandırır |
| Tavily bonus ödülü | V1'de kullanılmaması | Store rule pack kontrollü/tarihli olmalı; zorlama entegrasyon "superficial" görünebilir |
| Eşzamanlı koşu sınırı | Aynı anda en çok 2 run, fazlası görünür kuyruk | macOS maliyeti ve kapasite |
| Upload sınırları | APK ≤ 300 MB, ZIP ≤ 300 MB / açılmış ≤ 1 GB, presigned URL 15 dk | `04` §11'de pilot sonrası kesinleşir |
| Domain | Sabit `vercel.app` adresi yeterli | Ek maliyet ve DNS riski yok |

## 12. F0 durumu (6 Ekim 2026)

Tamamlanan (yerelde doğrulandı):

- [x] Monorepo iskeleti: pnpm workspace (`nodeLinker: hoisted`, Expo uyumu için), TypeScript, Biome, Apache-2.0 `LICENSE`, `.env.example`, İngilizce README taslağı, CI workflow'u (`.github/workflows/ci.yml`).
- [x] `packages/shared` sözleşmeleri v1: gözlem, eylem/planner çıktısı, olay, bulgu/`n/m`, rapor, bütçe, API DTO'ları, planner JSON Schema üretimi; 9 birim testi.
- [x] Supabase migration'ları: 16 tablo, yalnız SELECT RLS politikaları, Realtime yayını; atomik RPC'ler (`create_test_run`, outbox claim/complete, session/report lease, idempotent olay ekleme, iptal, model bütçe rezervasyonu). `supabase db lint` temiz; `scripts/db-smoke.sh` RPC + RLS senaryolarını geçiyor.
- [x] Örnek uygulama v0 (Expo SDK 57, Expo Router): karşılama → kayıt formu → profil → profil düzenleme; yerel depolama; `testID`'ler; varyant altyapısı (`EXPO_PUBLIC_APP_VARIANT`). Android ve iOS JS bundle'ı üretiliyor; native build F1'de CI'da.
- [x] `scripts/probe-models.mjs`: planner adayları için `json_schema`/`json_object` geçerlilik, grounding, latency ve usage; görsel model için gerçek görüntü çağrısı.

Araştırmada netleşen:

- Nemotron planner adayları: `nvidia/Nemotron-3_5-Lightning` ve `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (`eu-north1`, $0.06/$0.24). B planı `nvidia/nemotron-3-super-120b-a12b` (`us-central1`, $0.30/$0.90).
- **Görsel model: V1'de public `openbmb/MiniCPM-V-4_5`.** Token Factory konsolunda `Nemotron-Nano-V2-12b` (Vision, BF16, 128K) ve `Nemotron-3-Nano-Omni` yalnız **Dedicated** olarak sunuluyor; public (token başı ücretli) endpoint'leri yok. Dedicated endpoint teknik olarak kullanılabilir ve yarışma kuralını (Token Factory runtime çağrısı) karşılar. Ancak:
  - Ücret token değil **GPU-saat** (dakika granülerliğinde); en az bir replica çalıştığı sürece işler. Token Factory dedicated GPU fiyatları public değil. Referans olarak Nebius AI Cloud on-demand: L40S ≈ $1.55+/saat, H100 $3.85/saat (1 Ekim sonrası $4.50).
  - Jüri dönemi (1–15 Aralık, ~340 saat) boyunca açık tutmak tek GPU'da kabaca **$500–1.500** demek; public görsel modelin çift koşu maliyeti ≈ $0.12.
  - Replica sıfıra indirilirse ücret durur, ancak endpoint erişilemez olur. Yeniden başlatmada kapasite garanti değildir ve cold-start süresi belgelenmemiştir. Jürinin istediği an test başlatabilmesi gereksinimiyle uyuşmaz.

  NVIDIA gereksinimi, her koşudaki gerçek planner çağrılarıyla (public Nemotron) karşılanır. Nemotron VL, **P2 deney** olarak kalır: kısa süreli dedicated endpoint ile kalite karşılaştırması yapılabilir. Ancak demo videosu ve jüri koşuları aynı (public) yapılandırmayı kullanır; videoda canlı demoda olmayan bir model gösterilmez. Kaynak: [dedicated billing](https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/billing-policy.md), [capacity](https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/capacity-and-scaling.md), [Nebius fiyatları](https://nebius.com/prices).
- API OpenAI uyumlu, `https://api.tokenfactory.nebius.com/v1/`; `response_format` ile `json_schema` ve `json_object` destekleniyor, model desteği probe ile ölçülecek.

Hesap zamanlaması (6 Ekim kararı): Pro planlar F1'in ön koşulu değildir.

**Dosya deposu kararı (8 Ekim):** Cloudflare R2 yerine Supabase Storage kullanılır. Gerekçe ve maliyet etkisi `02` §1 ve §9.5'tedir. Ayrı Cloudflare hesabı açılmaz. Proje sahibi Supabase Pro'yu şimdi alır.

| Servis | Şimdi | En geç | Not |
|---|---|---|---|
| GitHub public repo | **Hemen** | F1 başı | Workflow'lar buna bağlı. Açıldı: `OzzyD07/TapScout` |
| Cihaz runner'ları | Gerekmiyor | — | 8 Ekim kararı: WarpBuild kişisel GitHub hesaplarını desteklemiyor. V1 public repoda ücretsiz GitHub-hosted runner'ları kullanır (`ubuntu-24.04`, `macos-26`). iOS süresi G2'de yetersizse GitHub organization + WarpBuild'e geçilir |
| Supabase Pro (DB + Auth + Realtime + Storage) | **Şimdi** (8 Ekim kararı) | 10 Ekim | Proje `OzzyD07` org'unda açıldı (proje sahibinin tercihi). Org Pro olunca diğer aktif projeler de compute ücretine girer. Bölge: AB (Frankfurt). Pro, Storage'da 50 MB dosya sınırını kaldırır |
| Vercel | Hobby | Pro: 24 Ekim | Hobby ticari olmayan kullanım içindir; jüri demosu öncesi Pro |
| Token Factory | Promosyon kodu bekleniyor | 13 Ekim | G3 (16 Ekim) planner gate'i için gerekli. F1 pilotu ilk eylemi deterministik yapabilir |

**Supabase projesi (8 Ekim):** `TapScout`, ref `gumxrcxweozrjblkthyb`, `eu-central-1` (Frankfurt), `OzzyD07` org'u. Proje sahibinin izniyle açıldı. Üç migration uygulandı ve yerel dosya sürümleri uzak geçmişle eşitlendi. Security advisor'da yalnız bilinçli INFO kaldı (server-only tablolarda politika yok). Storage bucket'ları, org Pro'ya geçince (proje geneli 50 MB dosya sınırı kalkınca) migration ile açılacak. **Public signup panelden kapatılmalı:** `supabase/config.toml` yalnız yerel ortamı etkiler.

Proje sahibinde bekleyen (F0'ı kapatmak için):

- [ ] Hesaplar: GitHub token ve Supabase Pro öncelikli; diğerleri tablodaki tarihlerle.
- [ ] `pnpm probe:models` sonucunun incelenmesi ve planner modelinin seçimi.
- [ ] §11 kararlarının onayı (track, iOS fallback).

Sonraki: F1. `build-sample.yml` ile APK ve Simulator `.app` üretimi, ardından Android pilotu (G1).
