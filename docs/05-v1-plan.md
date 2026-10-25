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
| Track | **Karar (9 Ekim): Coding and Agentic Engineering** | Tanımı (kod yazan, çalıştıran ve test eden agent'lar) TapScout ile birebir örtüşüyor; `04`'teki ilk tercih Best Apps and Agents'tı |
| G2 başarısız olursa iOS | **Karar (9 Ekim):** iOS uçtan uca koşu 16 Ekim'e kadar yetişmezse iOS "Experimental" etiketiyle kalır; demo ve video Android ağırlıklı olur | Proje sahibi onayladı. WarpBuild'e geçiş ve iOS'a tam öncelik seçenekleri reddedildi |
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

- [x] GitHub fine-grained token (`.env`, bitiş 7 Ocak 2027), Supabase secret key, public signup kapalı (9 Ekim'de doğrulandı).
- [ ] Supabase Pro (proje sahibi 10 Ekim'de geçecek) ve Vercel projesi.
- [x] Model ölçümü (9 Ekim, $1 deneme kredisiyle; toplam harcama < $0,01):

  | Aday | `json_schema` geçerli + ekrandaki öğeye bağlı | Medyan gecikme | Çıktı token |
  |---|---|---|---|
  | `nvidia/Nemotron-3_5-Lightning` | **3/3** | 2,9 sn | 729–800 (reasoning açık) |
  | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 1/3 | 9,7 sn | 625–800, 800'de kesilip JSON üretemedi |
  | Lightning + `chat_template_kwargs.enable_thinking=false` | **2/2** | **0,7–1,8 sn** | **133** |
  | Lightning + `/no_think` veya `reasoning_effort=low` | 4/4 | 1,9–2,4 sn | 450–595 (reasoning kapanmadı) |
  | `openbmb/MiniCPM-V-4_5` (görsel) | HTTP 200 | 2,2 sn | 200 (<think> ile başlıyor; ayrıca kapatılmalı) |

  **Karar:** Planner `nvidia/Nemotron-3_5-Lightning`, `response_format: json_schema` ve `enable_thinking=false`. Reasoning açıkken çağrı başına çıktı `03` §9'daki planner bütçesini (30 çağrıda 13.000 token) aşıyordu; kapalıyken yaklaşık 4.000 token'a iner. Karmaşık/takılmış durumlarda yeniden planlama için reasoning seçici açılabilir; bu G3'te (16 Ekim) gerçek ekranlarla ölçülür. MiniCPM'in düşünme çıktısı relay'de kapatılacak veya ayıklanacak.
- [x] §11 kararlarının onayı: track ve iOS fallback (9 Ekim).

## 13. F1 durumu (8 Ekim 2026)

Cihaz zinciri (G1/G2'nin altyapı kısmı) GitHub-hosted runner'larda çalıştı; backend ve canlı izleme parçası henüz bağlanmadı.

| Ölçüm | Android | iOS |
|---|---|---|
| Örnek build (`build-sample.yml`) | 11,8 dk, APK 23,2 MB (x86_64) | 12,6–14,9 dk (Xcode derlemesi ~11,5 dk), `.app.zip` 11,0 MB |
| Cihaz smoke (`device-smoke.yml`): kurulum → "Get started" tap → kayıt ekranı doğrulaması | **Geçti**, job 2,8 dk (emulator boot + smoke 127 sn) | **Geçti**, job 15,8 dk (simulator boot 177 sn, smoke adımı 667 sn) |
| Ortam | `ubuntu-24.04`, API 35 x86_64 emulator, KVM | `macos-26`, Xcode 26.6, iOS 26.x Simulator |

- iOS smoke süresinin büyük kısmı ilk oturumda WebDriverAgent derlemesiydi. Önceden derlenmiş simulator WDA'sı indirildikten sonra (`6df5bf0`) smoke adımı 667 sn'den **394 sn**'ye, iOS job'u 15,8 dk'dan **11,7 dk**'ya indi (simulator boot 113 sn). Log'lar giriş gerektirdiği için WDA indirme adımının ayrıntısı yerelden doğrulanmadı; adım `continue-on-error` ile build'e geri düşebilir. Kalan süre (uygulama kurulumu, WDA başlatma) F2'de ölçülecek.
- macOS runner'ları için GitHub "kapasite nedeniyle kuyruk uzayabilir" uyarısı veriyor; jüri dönemindeki kuyruk süresi F4'te ölçülür.
- Build boyutları Supabase ücretsiz planın 50 MB dosya sınırının altında.

Tamamlanan F1 kodu:

- [x] `build-sample.yml`, `device-smoke.yml`, `packages/adapters` (WebdriverIO oturumu, öncelikli locator adayları, smoke CLI).
- [x] `apps/web`: Next.js 16, Supabase Auth girişi, `proxy.ts` ile `getClaims()` tabanlı oturum yenileme, panel iskeleti.
- [x] Runner kimliği: GitHub OIDC doğrulaması ve oturum/rapor kapsamlı runner token'ları.
- [x] Runner API: `/api/runner/bootstrap`, `heartbeat`, `events`, `finish` (birim testli; gerçek Supabase ile henüz denenmedi).

**İlk uçtan uca koşu (10 Ekim):** run `dae8c768`, workflow `38046720574`. Koşu `create_test_run` ile oluşturuldu, outbox claim edildi, `qa-run.yml` GitHub API ile tetiklendi ve workflow kimliği kaydedildi (`scripts/dev-run.mjs`). Her iki job GitHub OIDC ile lease aldı, build'i Supabase Storage'dan imzalı URL ile indirip hash'ledi, uygulamayı kurdu, "Get started"a dokundu ve kayıt ekranını doğruladı. Platform başına 8 olay sıralı yazıldı, 8 kanıt (screenshot + hierarchy) `ready` durumuna geçti ve iki oturum `completed / goals_exhausted` ile kapandı. Süreler: Android job 2,6 dk, iOS job 7,7 dk. Run durumu `running` kaldı; sonuç rapor job'u (F1'in kalan işi) eklenince `completed/partial` olacak.

**Rapor job'lu ikinci koşu (10 Ekim):** run `2f3b8028`, workflow `38048071240`. Android 3,3 dk, iOS 12,1 dk, rapor job'u 0,1 dk. İki oturum `completed`, 16 olay, 8 kanıt hazır, deterministik rapor kaydedildi ve run `completed` durumuna geçti.

Web tarafı (10 Ekim): `POST /api/runs` (Start Test, koşu başına claim + tek dispatch, kullanıcı başına en çok 2 aktif koşu), iptal, RLS kontrollü kanıt görüntüleme, Realtime + geçmiş backfill ile canlı run sayfası, panelde test başlatma formu, `/api/report` + qa-run rapor job'u.

Kalan F1 işleri: web'den başlatılan koşunun proje sahibi tarafından tarayıcıda denenmesi, model relay ve ilk Nemotron çağrısı (F2 başı). Bunların bir kısmı proje sahibinden `SUPABASE_SECRET_KEY`, `GITHUB_DISPATCH_TOKEN`, Supabase Pro ve Token Factory anahtarını bekler.

## 14. F2 durumu (10 Ekim 2026)

Tamamlanan:

- [x] **Model relay** (`/api/relay/plan`, `/api/relay/vision`): runner token ve geçerli lease, bütçe rezervi/kesinleştirme, `usage_records`. Planner `json_schema` + `enable_thinking=false`; MiniCPM görsel isteği de düşünme kapalı çalışıyor (ölçüm: ANR ekran görüntüsü, 646 girdi / 28 çıktı token'ı, 1,2 sn; diyaloğu doğru tarif etti).
- [x] **Observer:** Android ve iOS hierarchy'si aynı öğe sözlüğüne normalize ediliyor; secret maskeleme; Android ANR/crash diyaloğu tanınıp "Wait" ile kapatılıyor.
- [x] **State graph ve agent döngüsü:** sabit "Get started" adımının yerini aldı.

**İlk Nemotron agent koşusu:** run `202c4d49`, workflow `38053683214`, `functional` modu, `fixed` varyant.

| Ölçüm | Android | iOS |
|---|---|---|
| Oturum süresi | 4,0 dk | 7,1 dk |
| Planner çağrısı / cihaz eylemi | 30 / 30 | 30 / 30 |
| Keşfedilen durum (klavye halleri dahil) | 7 | 8 |
| Reddedilen öneri / başarısız eylem | 0 / 0 | 0 / 0 |
| Deterministik müdahale (döngü) | 1 | 4 |
| Planner token (girdi / çıktı) | 28.099 / 4.480 | 29.559 / 4.262 |
| Tahmini model maliyeti | $0,0028 | $0,0028 |

Örnek uygulamanın v0'daki bütün ekranları iki platformda da keşfedildi. Keşif bittikten sonra planner edit → save döngüsünde bütçe harcadı; bunun için "10 eylemdir yeni durum yok ve ekrandaki her kontrol denendi" kuralıyla `goals_exhausted` eklendi. iOS'ta etkisiz kalan "Go back" fallback'i, geri gitmenin aynı ekranda bıraktığı durumda artık tekrarlanmıyor. Çağrı başına ortalama ~950 girdi token'ı, `03` §9'daki planner payının (3.000) altında.

## 15. F2 Functional modu ve örnek uygulama v1 (10–11 Ekim 2026)

Tamamlanan:

- [x] **Örnek uygulama v1:** not listesi (ekle/aç/sil), ayarlar (privacy policy linki, hesap silme), profil ikon butonu; web'de herkese açık `/privacy`. `seeded` 6 kasıtlı hata içerir (liste yalnız `quality/ground-truth/fieldnotes-seeded-v1.json`); `changed_flow` etiket ve sıra değiştirir.
- [x] **Functional modu:** `flow_transitions`, `form_feedback`, `return_paths`, `persistence`. Kalıcılık kontrolü kayıttan hemen sonra yapılır (yeniden başlat → gözlenen yolla ekrana dön → değeri ara); kayıpta yeni değerlerle 2 replay ve `n/m`. Kontrol ve bulgular `finish_session` ile aynı transaction'da yazılır; rapor ve run sayfası gösterir.
- [x] **Cihaz sağlamlığı:** Android emülatörde launcher kapatılır (ANR diyaloğu her eylemden sonra uygulamayı örtüyordu); sistem diyaloğunun böldüğü eylem `uncertain` sayılır. iOS'ta klavye altındaki kontroller işaretlenir ve klavye dönüş tuşuyla kapatılabilir.

| Run | Varyant | Android | iOS |
|---|---|---|---|
| `3a257421` | fixed | 7 ekran, kalıcılık **geçti** (Name, Title, Note), bulgu yok, 5,0 dk, $0,0028 | 7 ekran, kalıcılık **geçti** (Name, Title), bulgu yok, 10,3 dk, $0,0029 |
| `33277262` | seeded | 6 ekran, kalıcılık **kaldı**: About you kayboldu, **Reproduced 2/2**, 6,4 dk, $0,0029 | Klavye Continue'yu örttü, kayıt geçilemedi (sonraki düzeltmelerle çözüldü) |
| `026837ac` | seeded | — | 8 ekran, kalıcılık **kaldı**: About you, **Reproduced 2/2**, 12,2 dk |

`fixed` build'de yanlış pozitif bulgu çıkmadı; `seeded` kalıcılık hatası iki platformda da tekrar üretildi. G3 (en az 3 ekran, geçersiz eylem uygulanmaması) v1 üzerinde de karşılandı: reddedilen planner önerileri uygulanmadı, yerine repair veya deterministik fallback çalıştı. Diğer seeded hatalar (label'sız ikon, hesap silme eksikliği, klavye altında Continue, clipping, crash) ilgili modların kontrolleri yazılınca ölçülecek.

## 16. Diğer mod kontrolleri ve ground-truth değerlendirmesi (11 Ekim 2026)

Tamamlanan (`packages/runner/src/checks.ts`, `agent.ts`):

| Mod | Kontrol | Yöntem |
|---|---|---|
| Accessibility | `a11y.control_labels`, `a11y.touch_targets` | Hierarchy; dp/pt ölçümü (Android yoğunluğu sürücüden). 48dp/44pt altı `inconclusive` liste, 32dp/28pt altı bulgu |
| UI/UX | `ui.keyboard_occlusion` | iOS: klavye bandındaki ve XCUITest'in `visible=false` dediği kontroller; Android: klavye kapalıyken görülüp açılınca hierarchy'den kaybolan kontroller |
| UI/UX | `ui.text_clipping` | MiniCPM (ekran adı başına bir kez, en çok 6); `...` ile bitenler atılır, kalan hierarchy'deki daha uzun bir metnin parçası olmalı (`groundClipping`) |
| Store Readiness | `store.account_deletion`, `store.privacy_policy` | Hesap oluşturma görülürse silme girişi aranır; ayar/hesap ekranına ulaşılmadıysa bulgu değil `needs_additional_information`. Tarihli kural referansları |
| Stress | `stress.long_text`, `stress.crash` | Daha önce gönderilmiş forma sınırlı uzun metin + gönder; süreç kaybı (app state 1 veya crash diyaloğu) `runtime_signal`, 2 replay |

Değerlendirme: `node --env-file=.env quality/evaluate-run.mjs --run <id>` bulguları `quality/ground-truth/fieldnotes-seeded-v1.json` ile eşler (fixed için her bulgu yanlış pozitif).

| Run | Varyant | Android | iOS |
|---|---|---|---|
| `113d648a`, `fd156d79`, `4cc0a298`, `1bbb0329` | fixed | 0 yanlış pozitif (4/4 koşu) | 0 yanlış pozitif (son 3 koşu) |
| `4a2c863d` | seeded | 5/6 | 3/6 |
| `cce22f6d`, `5c7560f0`, `105335e8` | seeded | **6/6** (3 koşu üst üste) | — |
| `105335e8` | seeded | — | **4/6**: kalıcılık 2/2, label'sız ikon, klavye örtmesi, kırpılma; Settings'e ve tekrar forma ulaşılamadan zaman bitti (stres `not_tested`, hesap silme `needs_additional_information`) |

Yol boyunca bulunan ve düzeltilen agent/cihaz sorunları: iOS çöken uygulamada `source` hatası (artık gözlem), arka plandaki uygulamanın `source`'u WDA'yı kilitliyordu (önce app state), Android IME kontrolleri hierarchy'den siler, çok satırlı alanda dönüş tuşu klavyeyi kapatmaz, seeded klavye hatası Android'de de var (ground-truth güncellendi). Örnek uygulamaya kayıtta uzun başlıklı başlangıç notu eklendi (liste düzeni gerçekten sınanıyor).

## 17. iOS hızı ve koşu sağlamlığı (11 Ekim 2026)

Ölçüm (runner'daki adım zamanlaması timeline'a not olarak yazılır; Appium log'u `run-ios` artifact'inde):

| | Önce (`105335e8`, `78ff4a21`) | Sonra (`15dae39a`, `bcd6a32e`) |
|---|---|---|
| iOS Appium oturumunun açılması | 222 sn | 90–160 sn |
| iOS dokunma | ~5 sn (öğe sorgusu) | ~1 sn (gözlenen bounds) |
| Klavye kapatma | 8,8 sn | 0,6–1,6 sn |
| iOS oturum başına eylem (30 planner çağrısıyla) | 34 | 41–54 |

Değişiklikler: `appium:isHeadless` (sürücü açık simülatörü pencereli yeniden başlatıyordu, ~107 sn); Xcode sorguları simülatör açılırken ısıtılır (soğuk runner'da ~84 sn); kanıt dosyaları arka planda yüklenir (ön imza beklenir, aktarım değil); iOS'ta dokunma gözlenen bounds'un merkezine, yazmada ekstra click yok ve boş alan temizlenmez; iOS'ta genel klavye kapatma denenmez (dönüş tuşu / metne dokunma); otomatik düzeltme ve öneri kapalı. `mobile: tap` denendi, W3C'den yavaş çıktı ve geri alındı.

Sağlamlık: uygulama arka plandayken page source istenmez (Safari açıkken WDA kilitleniyordu) ve iOS'ta kökteki başka bundle "uygulama dışında" sayılır; erken cihaz hatasında (ilk 5 eylem) Appium oturumu bir kez yeniden açılır; Stress, bir form ilk kez gönderilince sıraya alınır ve gözlenen yoldan hemen sınanır.

Son seeded koşu `bcd6a32e`: iki platformda 5/6, yanlış pozitif yok; uzun metin crash'i iki platformda yakalandı (iOS 2/2, Android 1/2). Koşudan koşuya kaçan bulgular kapsamdan (o koşuda Settings'e girilmemesi, About you'nun düzenlenmemesi) ve dürüstçe `not_tested` / `needs_additional_information` olarak raporlanıyor.


## 18. Rapor özeti, rapor UI'ı, kapsam turları ve build yükleme (11 Ekim 2026)

**Rapor özeti (Nemotron).** `/api/report`, deterministik raporu kurduktan sonra rapor lease'i altında `relayReportSummary` ile özet ister (rapor bütçesi, `usage_records`, `json_schema`, düşünme kapalı). Model bulguları sorunlara gruplanmış ve `F1…Fn` etiketli görür; geçen kontroller girdiye konmaz (verildiğinde tek platformdaki geçişi "iki platformda geçti" diye yazıyordu). Metin şu kontrollerden geçmeden kaydedilmez, geçmezse sebebiyle en çok 3 istek: etiketler gerçek bulgu; birlikte yazılan etiketler tek sorun; etiket bir kez; etiketin önündeki platform ve sayı ("two …") etiketlerle uyumlu; severity kelimesi kendisinden sonraki etiketlerin severity'si; `n/m` oranları bulgulardan; id/URL, "passed" ve "bug-free" yok. Başarısızsa `summary: null`, rapor yine tam.

| Ölçüm | Sonuç |
|---|---|
| Kayıtlı 5 rapor (`3a257421`, `105335e8`, `bcd6a32e`, `cce22f6d`, `4a2c863d`), son kurallarla 2 tur | 10/10 doğrulandı; 1–1,6 sn, ~2,1 bin girdi token'ı |
| Canlı koşu `75c696bc` | Özet kaydedildi, 1,2 sn, 1.457 / 259 token, $0,00015. Yakalanmayan bir sayı hatası ("two … incidents [F3]") sonraki kuralı getirdi |

Kalan risk anlamsal: küçük model crash'i "data-loss" diye adlandırabiliyor. Sayfa özeti "kartlar esas" notuyla gösterir.

**Rapor UI'ı.** `runs/[id]/report-section.tsx`: özet bloğu (etiketler kartlara bağlı, tıklayınca filtreler sıfırlanır), platform/mod filtreleri (bulgu ve kontrollere uygulanır), F etiketli kartlarda kanıt türü/güven, severity gerekçesi ve açılır "Steps to reproduce" (başlangıç, adımlar, girdi, kontrol). Kontroller moda göre gruplanır ve kapsamlarını gösterir. Yerelde gerçek `bcd6a32e` verisiyle masaüstü ve 375 px genişlikte kontrol edildi.

**Kapsam turları** (`packages/runner/src/coverage.ts`). Bir kontrol defteri her adlandırılmış ekranın dokunulabilir kontrollerini tutar. Ekran tükendiğinde (eskiden `goals_exhausted`), ilerleme durduğunda ve planner bütçesi bittiğinde (eskiden oturum biterdi) agent gözlenen yollarla en iyi denenmemiş kontrole gider ve planner'sız dokunur: Store/Accessibility seçiliyse ayar/hesap girişleri, sonra yalnız-ikon butonlar, sonra en yakın. Yıkıcı kontroller (delete, sign out, reset) ve geri butonları planner'sız denenmez; kimliği yalnız sondaki indeksle değişen kontroller (`note-row-0`, `note-row-1`) tek aile sayılır. Planner prompt'u `[untried]` işaretini ve diğer ekranlardaki denenmemiş kontrolleri görür.

| Run | Varyant, modlar | Android | iOS |
|---|---|---|---|
| `75c696bc` | seeded, beş mod | **5/6**, 0 yanlış pozitif; 20 ekran, 62 eylem, 30 planner çağrısı; 7,5 dk job. Turlar not satırlarına gitti (aile kuralı bu koşudan sonra eklendi); About you düzenlenmediği için kalıcılık kaçtı | **6/6**, 0 yanlış pozitif; 16 ekran, 65 eylem |

**Build yükleme.** `POST /api/builds` kaydı açar ve `staging/{id}/app.{apk,zip}` için imzalı yükleme URL'si verir; tarayıcı dosyayı ilerleme çubuğuyla doğrudan private `builds` bucket'ına PUT eder (Vercel'den geçmez). `POST /api/builds/{id}/complete` nesnenin varlığını, beyan edilen boyutu ve ZIP imzasını (`PK\x03\x04`) kontrol eder, `final/` yoluna taşır ve build'i `uploaded` yapar. Kullanıcı başına en çok 3 yarım yükleme; sınır bucket'ı izler (Free'de 50 MB, sonra `STORAGE_BUILDS_MAX_BYTES`). Storage mekaniği gerçek bucket'ta deneme dosyasıyla doğrulandı (imzalı PUT 200, liste boyutu, Range 206, taşıma, silme). Runner, `.ipa` veya yalnız cihaz için derlenmiş `.app`'i (Info.plist) kurulumdan önce, Android `INSTALL_FAILED_*` kodlarını kurulum hatasında `blocked / unsupported` ve açıklamayla raporlar. Web'den gerçek bir kullanıcı build'iyle uçtan uca deneme proje sahibinin tarayıcısında yapılacak (giriş gerekli).

## 19. Giriş duvarları ve test hesabı (11 Ekim 2026)

**Giriş duvarı** (`packages/runner/src/access.ts`). Üç tür tanınır: şifre alanı + giriş kelimeleri olan ekran (şifre değiştirme formu hariç), tek kullanımlık kod ekranı (SMS/e-posta/authenticator) ve CAPTCHA. Duvar, ondan ileriye ve duvar olmayan bir ekrana götüren eylemle "aşılmış" sayılır; "Forgot password", "Sign up", geri ve iptal sayılmaz. Bir giriş ekranı aşıldıysa kardeş şifreli ekranlar (kayıt gibi) engel sayılmaz; giriş sonrası çıkan kod ekranı ayrıca engeldir. Aşılmayan her duvar oturuma engel olarak yazılır:

- Hesap yok: `Sign-in required: "Log in" asks for a password and no test account was provided, so the screens behind sign-in were not tested.`
- Hesap var ama geçilemedi: `Sign-in failed: …` (hesap yazıldıysa) veya `Sign-in not completed: …` (hiç kullanılmadıysa).
- Kod/CAPTCHA: `Access blocked: … cannot receive / does not solve …`.

`goals_exhausted` ile biten ve duvarı aşamayan oturum `access_blocked` olur (faz `completed` kalır; ulaşılan ekranlardaki kontroller geçerlidir). Rapor engelleri en üstte "What limited this run" kutusunda ve sınırlamalarda gösterir; özet modeli de görür.

**Test hesabı.** Yükleme formunda isteğe bağlı kullanıcı adı + şifre. API bunları AES-256-GCM ile (anahtar `APP_CREDENTIALS_ENCRYPTION_KEY`, build id ek doğrulanmış veri) şifreler ve `build_test_accounts` tablosuna yazar (migration `20261010223426`; RLS açık, politika yok, istemci rolleri okuyamaz; `app_builds.has_test_account` yalnız bayrak). Bootstrap, değeri yalnız o oturumun lease'ini tutan cihaz runner'ına çözerek verir. Planner yalnız hesabın var olduğunu bilir ve `{"kind":"credential_ref","key":"username"|"password"}` yazar; şifre yalnız maskeli alana, maskeli alana başka hiçbir şey girmez. Runner değeri çözer ve iki değeri her hierarchy, prompt ve olaydan `[test account]` ile değiştirir (testte prompt, kanıt ve olaylarda değer geçmediği doğrulanıyor). Appium logu yazılan metni farklı biçimlerde tuttuğu için, hesaplı oturumda runner işaret dosyası bırakır ve workflow logu public artifact yüklemesinden önce siler. Giriş formları stres probuna girmez.

Doğrulama: birim ve sahte cihaz testleri (hesapsız → `access_blocked` + "Sign-in required", hesapla → giriş geçildi, değerler hiçbir çıktıda yok); gerçek veritabanında şifreli yazma/çözme, istemci rolüyle okumanın `42501` ile reddi ve build silinince sırrın silinmesi. Gerçek cihazda giriş isteyen bir uygulamayla koşu henüz yapılmadı (örnek uygulamada giriş yok).

## 20. Örnek uygulama `login` varyantı ve giriş doğrulaması (11 Ekim 2026)

`EXPO_PUBLIC_APP_VARIANT=login`: sağlıklı FieldNotes, önünde "Sign in" ekranı (e-posta + maskeli şifre, yanlış hesapta hata, yalnız yardım gösteren "Forgot password?"). Oturum AsyncStorage'da tutulur (yeniden başlatmada kalır); Sign out ve Delete account oturumu kapatır. Alanlar autofill'i kapatır, şifre yöneticisi diyaloğu uygulamanın üstüne çıkmaz. Public demo hesabı `apps/sample-app/src/lib/demo-account.json`'da (gerçek sır değil). Bilerek konmuş hata yok; değerlendirmede `fixed` gibi sayılır.

`publish-sample` login build'ini iki kez kaydeder: demo hesabı şifreli test hesabı olarak (`has_test_account`) ve hesapsız. `dev-run --variant login [--no-account]` birini seçer; `quality/evaluate-run.mjs` giriş sonucunu da denetler (hesaplıda "signed in", hesapsızda "Sign-in required"). Migration `20261011080251` varyantı kabul eder.

| Run | Build | Android | iOS |
|---|---|---|---|
| `7ccf0723` | login, test hesaplı, beş mod | Giriş geçildi ("with the test account"), 17 ekran, 0 bulgu | Giriş geçildi, 20 ekran, 0 bulgu |
| `6af17ed2` | login, hesapsız, beş mod | `access_blocked`, "Sign-in required", 2 ekran, 0 bulgu | `access_blocked`, "Sign-in required", 4 ekran, 0 bulgu |

Sızıntı denetimi: demo e-posta ve şifresi olaylarda, oturum kayıtlarında, raporda ve indirilen `run-android` artifact'inde yok; artifact'te Appium logu yerine `appium.log.removed` var. Hesapsız koşunun özeti "notCovered" alan adını metne taşıdı; özet doğrulayıcısı artık veri alan adlarını ve ham check id'lerini reddediyor.

## 21. Gerçek uygulama ölçüm seti, ilk tur (A5) ve ilk sağlamlaştırmalar (11 Ekim 2026)

**Set** (`scripts/benchmark/apps.json`, beklentiler `quality/benchmark/`). F-Droid'den sabit sürüm ve hash'le (F-Droid index-v2'ye karşı doğrulandı) beş APK; kaynaktan iki uygulama. Build'ler `build-benchmark.yml` ile üretilir, `scripts/publish-benchmark.mjs` ile `tester@tapscout.com`'un normal build'leri olarak yüklenir; koşu `dev-run.mjs --app "<ad>"`.

| Uygulama | Yığın | Platform | Özellik |
|---|---|---|---|
| Jitsi Meet 26.0.0 | React Native | Android (x86_64) | kamera/mikrofon/bildirim izinleri, backend, sekmeler |
| AntennaPod 3.12.2 | Java/Kotlin, Views | Android | podcast arama/backend listeleri, bildirim izni |
| Read You 0.16.2 | Kotlin, Compose | Android | açılışta bildirim izni, şartlar ekranı |
| Jerboa 0.0.88 | Kotlin, Compose | Android | değişen akış (lemmy.ml), isteğe bağlı giriş, açılış diyalogları |
| Tusky 33.0 | Kotlin, Views | Android | parolasız giriş duvarı (instance → OAuth), hesap yok |
| Habo 4.0.0-foss | Flutter | Android + iOS | tanıtım ekranları, bildirim izni, yerel form/veri |
| Ice Cubes 2.1.3 | SwiftUI | iOS | backend zaman akışı, hesapsız gezinme |

Ana ekran listeleri her uygulamanın kaynak metinlerinden, koşulara bakılmadan önce yazıldı. Bir ekran, saklanan hierarchy'lerden birinde işaretleri eşleşince "ulaşıldı" sayılır (`quality/benchmark.mjs`). Değerlendirici ayrıca erişim sonucunu, durma yeri/sebebini, kesinti ve yükleme göstergesi sıklığını ve her bulgunun elle verilmiş hükmünü (bölge eşlemeli) raporlar. İşaretler yalnız koşu belirsiz olduklarını gösterince düzeltildi (Jitsi Settings, Jerboa akışı); düzeltmeler dosyada `markerNote` ile kayıtlı.

**İlk tur bulguları ve düzeltmeler** (koşu → engel → düzeltme):

| Koşu | Engel | Düzeltme |
|---|---|---|
| AntennaPod `6f037472` | Oturum açılmadı: `SplashActivity` hemen kapanıyor, Appium onu bekliyor | Appium uygulamanın activity'sini beklemez (`appWaitForLaunch: false`); ilk ekranı runner bekler |
| Read You `14966324`, `9e9419b2` | Açılışta bildirim izni: önce Appium, sonra (izin activity'si öndeyken uygulama "arka planda" sayıldığı için) agent ekranı hiç okumadı | Android/iOS izin diyalogları kesinti olarak tanınır ve "Allow" ile geçilir (timeline'a `Interruption:` notu); Android'de arkada çalışan uygulamada da ekran okunur |
| Jerboa `0b8ca5e6` | Sonuç kayboldu: 50'den fazla bulgu → `finish` 400. Açılışta iki diyalogda 9 eylem; metin linklerine basıp uygulamadan çıktı | Oturum başına en çok 50 bulgu (önce doğrulama, sonra severity). Açılıştan sonraki 10 adımda uygulama içi diyalog/tanıtım/onay ekranları planner'sız cevaplanır (OK/Done/Skip…, çerezde önce "Reject"); tarayıcıya çıkan düğmelere basılmaz |
| Jerboa `5a5a1b40` | "Share" sayfası uygulamanın görevinde kaldı; yeniden başlatma onu tekrar öne getirdi → `access_blocked` | Android'de önce bir kez Geri, sonra yeniden başlatma |
| Jitsi `f86858fd` | Planner dili Afrikaanca'ya çevirdi; tur artık bulunamayan "Language" ekranına ~65 eylem harcadı | Dil seçeneklerine (kendi dilinde dil adları) planner ve kapsam turu dokunmaz (prompt `planner-2026-10-11.v3`); gözlenen yolla ulaşılamayan ekran yeniden hedeflenmez |

**Yanlış pozitifler (A4).** İlk tur bulgularının elle hükmü: AntennaPod 44 bulgu, %73 yanlış pozitif; Jitsi 35 bulgu, %29. Kaynaklar: etiketi alt metninden gelen tıklanabilir satır/kartlar, etiketli satırın içindeki tıklanamaz checkbox, bottom sheet arka planı, klavyenin arkasına giren alt sekme çubuğu, kaydırma kenarında kırpılmış kontrolün ölçüsü, ve aynı sorunun kontrol başına (ve dil değişince ekran adı başına) tekrar sayılması. Düzeltmeler (`checks.ts`, `observer.ts`): etiketsiz kontrol içindeki metinlerle adlandırılır (planner da görür); kırpılmış ya da ekran kenarında kesilmiş kontrol ölçülmez; alt gezinme klavye örtmesi sayılmaz; bulgular ekran ve kontrol türü başına gruplanır, aynı kontrol başka ekranda tek sayılır. Kayıtlı hierarchy'lerin yeni kurallarla çevrimdışı tekrarı: AntennaPod 44 → 1, Jitsi 35 → 4, Jerboa (sonucu kaybolan koşu) → 4 bulgu; kalanlar elle doğrulanmış gerçek sorunlar (açıklamasız kapak/küçük resimler, etiketsiz switch'ler ve geri butonu, 46×27 dp switch'ler). Rapor özeti doğrulayıcısı gruplanmış bulgunun kendi sayısını ("6 switches") kabul eder.

**iOS build'leri.** Habo (Flutter Simulator'da yalnız debug) ve Ice Cubes (Xcode 26.6'da `main` derlenmiyor, 2.1.3 Release'te derleyici çöküyor → Debug) Free plandaki 50 MB nesne sınırını aştı (68,6 MB ve 115 MB zip). Zip öncesi sembol soyma + Ice Cubes uzantılarının kaldırılması + ad-hoc yeniden imza eklendi; sınır hâlâ aşılırsa iOS ölçümü Supabase Pro'yu bekler.
Sembol soyma, uzantıları kaldırma ve Ice Cubes'ta Release `-Onone` denendi: Habo 65 MB, Ice Cubes 80 MB; sınır aşıldığı için iOS ölçümü Supabase Pro'yu bekliyor.

**İkinci ve üçüncü tur (Android).** Her tur, bir öncekinin düzeltmelerinden sonra koşuldu. Yanlış pozitif oranı = elle "yanlış pozitif" işaretlenen bulgu / bütün bulgular ("emin değilim" payda içinde).

| Uygulama | 1. tur | 2. tur | 3. tur |
|---|---|---|---|
| AntennaPod | `e24b2ce6` 6/10 ekran, 44 bulgu, %73 YP | `47fcde0b` 6/10, 5 bulgu, %20 | `3efcc886` **8/10**, 2 bulgu, **%0** |
| Jitsi Meet | `f86858fd` 3/5, 35 bulgu, %29 (dil Afrikaanca'ya çevrildi) | `c522e6d1` 4/5, 12 bulgu, %67 (klavye örtmesi, join kalıcılığı) | `15fc88db` **5/5**, 6 bulgu, **%0** |
| Read You | açılmadı (`14966324`, `9e9419b2`), sonra `f5596ba1` 5/7, 4 bulgu, %0 | `ca26b0b3` 4/7, 43 bulgu, %95 ("Back" başlıklı ekranlar) | `5a867a1d` 3/7, 3 bulgu, **%0** |
| Jerboa | `0b8ca5e6` sonuç kayboldu (>50 bulgu), `5a5a1b40` 2/6, 4 bulgu | `4e83d7ad` 2/6, 3 bulgu, %0 | `23a8e69a` 2/6, 7 bulgu, %14 (kenarda kesilen satır, düzeltildi) |
| Tusky | `5cf50571` 3/3, 2 bulgu, %50; erişim YANLIŞ | `f142b47c` 2/3, 1 bulgu, %0; erişim YANLIŞ (şifresiz giriş) | `6d9d756b` 2/3, 1 bulgu, %0; **"Sign-in required" doğru** |
| Habo (Flutter) | `5f2a097d` 3/8, 3 bulgu, %0; `access_blocked` yanlış | `614e2419` 3/8, 2 bulgu, %0 | `aa5045dc` 2/8, 2 bulgu, %0 (Flutter alanlarına yazılamıyordu) |
| Jitsi (arm64) | — | `98fdd338` 4/5, kuruldu ve çalıştı (ARM çevirisi) | — |

Üçüncü tur toplamı: 21 bulgu, 1 yanlış pozitif (%4,8; o da düzeltildi), 5 "emin değilim". İlk ekranlarda takılan oturum yok; erişim sonuçları doğru. FieldNotes gerilemesi: seeded `4d53f5f4` ve `77fbdf49` iki platformda **6/6**, yanlış pozitif 0; fixed `c212fd12` iki platformda 0; login Android geçti, iOS'ta önce planner uydurma e-posta yazdı (`648ec2ae`), sonra kullanıcı adının ilk tuşları kayboldu ve planner aynı alana tekrar yazdı (`43c5c77c`). İkisi için de düzeltme var (kullanıcı adı alanı `credential_ref` ister, yazım okunup bir kez yeniden yazılır, dolu alana tekrar yazılmaz, kısmi değerler de temizlenir).

**İkinci/üçüncü turdan çıkan düzeltmeler:** Android klavye örtmesi yalnız formun eylemleri (kısa adlı, alanların altında, ekranın alt yarısında, liste satırı değil); WebView içindeki satır içi linkler ölçülmez; join/search/go gibi eylem gönderimleri kalıcılık adayı değil; gezinme ikonları ("Back", "Close") başlık sayılmaz; ekran kenarında kesilen kontrol etiketsiz sayılmaz; şifresiz giriş ekranı (e-posta/sunucu + "Log in") duvardır; hesap yokken giriş formuna yazılmaz; Flutter alanlarına odaktaki öğe üzerinden yazılır; kapsam turu ulaşılamayan ekranlarda pes etmez; dönen yükleme göstergesi varken (en çok 5 sn) beklenir (A2); gezinme girişleri (sekmeler, alt çubuk, app-bar ikonları) önce açılır (B7). A3 (şablon kimliği) kayıtlı oturumlarda ölçüldü: durumların çoğu gerçekten farklı görünümler (ör. profil sekmeleri), kazanç küçük (AntennaPod 36 → 32); ertelendi.

**Dördüncü ve beşinci tur (11 Ekim gecesi).** Değişiklikler: A2 yükleme beklemesi, B7 gezinme taraması (ana bölümler planner'sız bir kez açılır), B10 çökme logu, Flutter alanlarına odak üzerinden yazım, "Geri uygulamadan çıkardıysa tekrar Geri yok", planner bütçesi varken bir kez "başka yere git" uyarısı.

| Uygulama | 4. tur | 5. tur |
|---|---|---|
| AntennaPod | `f9ba4aeb` 7/10, `access_blocked` (ana ekranda Geri → uygulama dışı → yeniden başlatma döngüsü; düzeltildi) | `9df9a0d4` **8/10**, 2 bulgu, %0 |
| Jitsi Meet | `80900a96` 3/5, 37 eylemde erken `goals_exhausted` (düzeltildi), %0 | `01a3cd46` **5/5**, 6 bulgu, %0 |
| Habo | `59785198` / `009092b5` **6/8** (önceki 2/8), %0 | — |
| Jerboa | `52ad4070` 2/6, %0 (tarama içerik satırlarını gezinme sandı; düzeltildi) | `64bd5873` 1/6: **gerçek çökme** — `HttpRequestTimeoutException` (lemmy.ml geç cevap verince uygulama düşüyor), yığın izi crash-log kanıtında; aynı çökme 4 bulgu olmuştu → artık imzaya göre tek bulgu |
| Read You | `2df2d294` 5/7, 4 bulgu, %0 | — |
| FieldNotes | seeded `907861d5` iki platform **6/6**; fixed `6218f5dc` iki platform 0 YP; login hesaplı `20f5b4b6` iOS geçti; hesapsız `1b23f910` iki platform "Sign-in required" | seeded `2943c592` iki platform **6/6** |

Seeded arada 5/6'ya düşebiliyor (`52c6ac59`: Android'de Settings'e, iOS'ta profil düzenlemeye ulaşılmadı); rapor bunu `inconclusive`/kapsam olarak söylüyor, yanlış "geçti" demiyor.

## 22. G3 koşuları, A2 süre etkisi ve bulunan üç hata (11 Ekim 2026, gece)

**G3 ölçütü:** planner en az 3 ekran keşfetmeli ve geçersiz eylem uygulamamalı. Ölçüm, son runner'la FieldNotes'un dört build'inde, iki platformda ve beş modda yapıldı. Koşular $25 Token Factory kredisiyle çalıştı: relay 402/401 vermedi, bütün çağrılarda usage geldi. Bir koşunun maliyeti iki platform için ≈ $0,011–0,013.

| Run | Build | Android | iOS |
|---|---|---|---|
| `9a50d038` | seeded | **6/6**, 0 YP; 15 ekran, 65 eylem, 5,8 dk | **6/6**, 0 YP; 15 ekran, 60 eylem, 12,0 dk |
| `a60921bc` | fixed | 0 YP; 20 ekran, 4,3 dk | 0 YP; 16 ekran, 9,6 dk |
| `bf758efb` | login, test hesaplı | giriş geçildi, 18 durum, 0 bulgu | giriş geçildi, 17 durum, 0 bulgu |
| `5b0eb187` | login, hesapsız | "Sign-in required", 0 bulgu | "Sign-in required", 0 bulgu |

Bu koşuların hiçbirinde reddedilen bir öneri uygulanmadı; reddedilenler repair ya da deterministik eylemle değişti (oturum başına 0–4). Başarısız eylem yok; yalnız `uncertain` sonuçlar var. Ekran durumu sayısı 14–20, eşik 3. **G3 karşılandı.**

**Yol boyunca bulunan ve düzeltilen hatalar** (koşu → sebep → düzeltme):

| Koşu | Ne oldu | Düzeltme |
|---|---|---|
| `4021bb0b` Android seeded | Boot'tan ~45 sn sonra adb emülatörü kaybetti (`dumpsys` 255). UiAutomator2 instrumentation'ı da düştü. Erken hata tekrarı 13 sn sonra yeni oturum açtı, ilk screenshot'ta düştü: `infrastructure_failed` | Erken hata tekrarından önce de emülatör adb'ye geri getirilir: `reconnect offline` → `wait-for-device` → `sys.boot_completed=1`. Daha önce bu yalnız oturum başında vardı (`0eda082`) |
| `cdb25f9c` iOS login hesaplı | Kısmi değer maskeleme (`054b9b7`), demo şifrenin "Field" parçasını XML'in her yerinde değiştirdi. `XCUIElementTypeTextField`, `XCUIElementTypeText[test account]` oldu. Giriş alanları "not a text field" diye reddedildi, oturum giriş ekranından çıkamadı. Duvar da tanınmadığı için engel yazılmadı | Parçalar yalnız bütün öznitelik değeri olarak (`="…"`) maskelenir, tam değer her yerde. Değerlendirici "signed in" demek için runner'ın "Got past the sign-in" notunu ister; yoksa "never signed in" der (`107f31d`) |
| `b13c27ba` iOS seeded (1/6) | Simülatör tuş vuruşlarını kaybetti ya da karıştırdı ("ADoe", "ax.doe@…"). Bir alan boş okundu, oysa doluydu; yeni değer sonuna eklendi ("…comalex.doe@…"). Form geçilemedi, planner tekrar yazmakla bütçeyi bitirdi | 100 karaktere kadar her yazılan değer okunur; tutmazsa bir kez temizlenip yeniden yazılır. Önceden bu yalnız test kullanıcı adı içindi. Maskeli alanlar ve uzun stres metni hariç (`b8487b7`) |
| `f138ef62` Android seeded (5/6) | Planner "About you" alanına kayıt adını ("Alex Doe") yazdı. Yeniden başlatmadan sonra bio kayboldu ("No bio yet."), ama başlıktaki "Hi, Alex Doe" aynı metni içerdiği için kalıcılık "kept" sayıldı: yanlış negatif | Kayıttan hemen sonra bir öğenin tam metni olarak görülen değer, yeniden başlatmadan sonra da tam metin olarak aranır. Liste satırı gibi birleşik metinlerde gevşek eşleşme kalır (`6049766`) |

**A2 süre etkisi.** Eylem başına oturum süresi, A2 öncesindeki 5 FieldNotes koşusuyla (`bcd6a32e`, `75c696bc`, `4d53f5f4`, `c212fd12`, `77fbdf49`) sonrasındaki 5 koşu (`907861d5`, `6218f5dc`, `2943c592`, `4021bb0b`, `a1ff94ce`; tamamlanan oturumlar) karşılaştırıldı:

| | Önce | Sonra |
|---|---|---|
| Android | 6,27 dk ort., 6,19 sn/eylem | 5,04 dk ort., 5,47 sn/eylem (−%12) |
| iOS | 12,02 dk ort., 14,14 sn/eylem | 10,31 dk ort., 12,17 sn/eylem (−%14) |

Arada başka değişiklikler de girdi (B7, kapsam turları), bu yüzden fark tek başına A2'ye ait değil. Ama süre artmadı; **hedef (<%10 artış) karşılandı.** A2 sonrası FieldNotes koşularının hiçbirinde "Still loading" notu yok, beklemenin üst sınırı hiç dolmadı. Okuma doğrulaması (`b8487b7`) da süreyi uzatmadı: `9a50d038` Android 5,35, iOS 12,0 sn/eylem.

## 23. Ölçüm setinde altıncı tur (12 Ekim 2026, gece)

G3 sonrası runner'la (okuma doğrulaması, kalıcılıkta tam metin kuralı) altı Android uygulaması koşuldu. Tur iki agent hatası, iki altyapı açığı ve bir yanlış pozitif kaynağı çıkardı; hepsi düzeltildi ve etkilenen uygulamalar yeniden koşuldu.

| Uygulama | Koşu | Ana ekran | Bulgu | YP | Not |
|---|---|---|---|---|---|
| Tusky | `55038e69` | 2/3 | 1 (1 doğru) | %0 | "Sign-in required" doğru |
| Read You | `595019b1` | 4/7 | 3 (2 doğru, 1 emin değilim) | %0 | |
| AntennaPod | `71fe346e` | 7/10 | 0 | — | Settings'e bu sefer ulaşılmadı (önceki 8/10) |
| Jerboa | `a306bbdb` | 3/6 | 4 (2 doğru, 2 emin değilim) | %0 | **Dil Norveççeye çevrildi** → düzeltildi |
| Jerboa | `398fa898` | **4/6** | 7 (3 doğru, 2 emin değilim) | %29 | 2 YP klavye kontrolünden → düzeltildi; giriş "kod duvarı" sanıldı → düzeltildi |
| Jerboa | `259e74f4` | 2/6 | 3 (3 doğru) | %0 | Dil İngilizce kaldı; agent kullanıcı profili içeriğinde kalıp erken `goals_exhausted` |
| Habo | `1840d27f` | — | — | — | 12. eylemde adb koptu → düzeltildi |
| Habo | `b2751fec` | 6/8 | 6 (4 doğru, 2 emin değilim) | %0 | |
| Jitsi Meet | `723816ca` | — | — | — | Açılışta adb koptu, yeniden deneme atlandı → düzeltildi |
| Jitsi Meet | `5578cd7f` | 3/5 | 4 (4 doğru) | %0 | Ön katılım ve toplantı ekranına bu sefer girilmedi (önceki 5/5) |

Turun toplamı (tamamlanan koşular): 28 bulgu, 2 yanlış pozitif (%7,1; ikisi de düzeltilen klavye hatasından), 7 "emin değilim". Son koşularda yanlış pozitif %0. **Kabul ölçütü (<%10) korunuyor.** Okuma doğrulaması ve kalıcılıktaki tam metin kuralı gerçek uygulamalarda yanlış sonuç üretmedi. FieldNotes gerilemesi: seeded Android `e88b141a` **6/6**.

**Düzeltmeler** (koşu → sebep → düzeltme):

| Koşu | Ne oldu | Düzeltme |
|---|---|---|
| Jerboa `a306bbdb` | Planner "Language English" satırına, sonra listede olmayan "norsk nynorsk" ve "davvisámegiella"ya dokundu. Kapsam turu Norveççe "Språk" satırına dönmeye devam etti; oturumun kalanı okunamayan ayarlarda geçti | Dil ayarı satırı ("language/språk/sprache/dil…" kelimesi) hiç dokunulmaz. 3+ dil adı görünen ekranda listede olmayanlar dahil her seçenek dokunulmaz. Planner doğrulayıcısı ve kapsam turu ekranla birlikte karar verir (`f2cc784`) |
| Habo `1840d27f` | Boot'tan ~2 dk sonra adb koptu (iki `adb shell` aynı anda 255), instrumentation düştü. Yeni oturumla tekrar yalnız ilk 5 eylemde vardı | Tekrar, 25 eyleme kadar ve planner bütçesinin en çok üçte biri harcandıysa (`52dc6ec`) |
| Jitsi `723816ca` | Açılış beklemesindeki `app_state` adb hatası, agent'ın cihaz hatası dönüşümünün dışındaydı; hata tekrar mantığını atlayıp oturumu bitirdi | Açılış beklemesi de cihaz hatasını altyapı sonu olarak döndürür, tekrar devreye girer (`e66a72d`) |
| Jerboa `398fa898` | Klavye açılınca form yukarı kaydı; şifre alanının etiketsiz göz ikonu konum kimliğiyle "kayboldu" sanıldı (2 YP). Giriş ekranındaki isteğe bağlı 2FA alanı yüzünden ekran "tek kullanımlık kod" duvarı sayıldı | Android klavye kontrolü yalnız kimliği (id, etiket, metin) olan kontrolleri karşılaştırır. Şifreli giriş formu, 2FA alanı da olsa giriş duvarıdır (`625f532`) |

**Açık gözlemler:**
- Jerboa ana ekran kapsamı 2/6–4/6 arasında dalgalanıyor. Agent içerik (gönderi, kullanıcı profili) ağırlıklı ekranlarda kalıp "10 eylemdir yeni ekran yok" ile duruyor.
- Tusky'de giriş ekranının adı "Screen 1" çıkıyor. Aynı giriş duvarı "Invalid domain entered" ekranı yüzünden ikinci kez engel yazılıyor.
- adb kopmaları GitHub emülatöründen geliyor (bu turda 2/12 oturum). Kök sebep çözülmedi; runner artık bunlardan toparlanıyor.

## 24. B11 bulgu triyajı: Nemotron bulguları gözden geçiriyor (13 Ekim 2026)

**Ne yapıyor.** Oturum sonunda, sezgisel bir kuraldan çıkan bulgular (`a11y.control_labels`, `a11y.touch_targets`, `ui.keyboard_occlusion`, `ui.text_clipping`) tek bir model çağrısıyla gözden geçirilir. Bir çağrıda en çok 12 bulgu gider (`packages/runner/src/triage.ts`). Model her bulgu için gerekçe ve ardından `likely_true / likely_false / needs_review` döndürür (`finding_triage_v1` şeması; gerekçe önce yazılır).

**Sınırlar** (model önerir, sistem karar verir):
- Model bulgu silemez.
- `likely_false` yalnız bulguyu `manual_review_required` + düşük güvene indirir; gerekçe bulguya yazılır.
- Tekrar üretilmiş (`reproduced`) bulgulara dokunulmaz.
- Çağrı başarısızsa hiçbir şey değişmez.
- Rapor indirilen bulguyu "needs manual check" rozetiyle listenin sonunda gösterir; her kartta modelin hükmü ve gerekçesi görünür.
- Özet modeli indirilen bulguyu doğrulanmış sorun gibi yazmaz.

**Altyapı.**
- Relay'de yeni `finding_triage` amacı (yalnız cihaz token'ı).
- Oturum başına ayrı `triage` bütçesi: 24k girdi / 6k çıktı / 2 istek (migration `20261013152702`). Planner bütçesi bitmiş olsa da triyaj çalışır, planner'dan çağrı almaz.
- Model `TRIAGE_MODEL_ID` ile seçilir; varsayılan `nvidia/Nemotron-3-Ultra-550b-a55b`, düşünme kapalı.

**Girdi.** Modele ekranın ham listesi değil, kuralın tartamadığı olgular verilir:
- Ölçülen öğe (rol, ad, boyut dp).
- Çevresinde tıklanabilir bir kap var mı ve öğenin kendisi tıklanabilir mi. Kendisi tıklanabilen öğeyi kap adlandırmaz; ekran okuyucu ona ayrı odaklanır.
- İçinde metin var mı.
- Yakındaki ayrı metinler. "Ekran okuyucu bunları ayrı okur, öğeyi adlandırmaz" diye etiketli.
- Klavye bulgusunda öğenin hierarchy'de olmaması belirtinin kendisidir; Android klavyenin örttüğünü hierarchy'den siler.

**Çevrimdışı ölçüm** (`quality/triage-eval.mjs`): elle hüküm verilmiş benchmark bulguları ve FieldNotes seeded'ın bilinen doğru bulguları. Toplam 210 örnek: 100 doğru, 94 yanlış pozitif, 16 emin değilim. Bulgular kayıtlı hierarchy'den runner'la aynı fonksiyonla kurulup modele gönderildi.

| Model, prompt | Yanlış pozitif indirildi | Doğru bulgu indirildi (düşük olmalı) |
|---|---|---|
| Lightning, ilk prompt (yakındaki metin bağlam olarak) | 64/94 | **69/100** |
| Lightning, olgularla | 51/94 | 47/100 (22 cevapsız) |
| Lightning, gerekçe önce | 40/94 | 16/100 |
| Super 120B, aynı prompt | 53/94 | 7/100 |
| Super 120B, **düşünme açık** | 35/94 | 21/100 (5× çıktı token'ı, çok yavaş) |
| Ultra 550B, aynı prompt | 66/94 | 9/100 |
| Super, v2 (kendisi tıklanabilen öğeyi kap adlandırmaz) | 75/94 | 5/100 |
| Ultra, v2 | 64/94 | **1/100** |
| Super, v3 (klavye olgusu) | 46/94 | 3/100 |
| **Ultra, v3** (iki koşu) | 59–61/94 (%63–65) | **1/100** |

Ultra seçildi: koşudan koşuya tutarlı ve doğru bulguları neredeyse hiç indirmiyor. Super daha çok yanlış pozitif yakalayabiliyor ama koşudan koşuya %49–80 arasında oynuyor ve FieldNotes'un bilerek konmuş klavye hatasını indirebiliyor. Düşünmeyi açmak bu işte kötüleştirdi. Tek indirilen "doğru" bulgu tartışmalı: Jitsi'de içinde "AD Alex Doe" metni olan avatar butonu. Ultra ölçümde çağrı başına 2,2 sn.

**Dürüstlük notu.** Prompt aynı etiketli set üzerinde ayarlandı (ayrı test seti yok); kurallar uygulamaya özgü değil, ekran okuyucu davranışına dayanıyor. Yanlış pozitiflerin çoğu eski kural sürümlerinden: güncel kurallar bunları zaten üretmiyor (son turda 28 bulguda 2). Triyajın asıl değeri artık kalan sınır durumlarını işaretlemek ve doğru bulguları "modelce de doğrulandı" diye desteklemek.

**Canlı doğrulama:**

| Run | Build | Sonuç |
|---|---|---|
| `8e77605c` | FieldNotes seeded, iki platform | İki platformda **6/6**. Triyaja giren her seed (etiketsiz ikon, klavye altında Continue, kırpılma) `likely_true`; hiçbiri indirilmedi. Çağrı: 971–1039 girdi / 138–145 çıktı token'ı, 1,3–1,4 sn, ≈ $0,0014 |
| `613d10af` | Jerboa | 3 bulgu, üçü de `likely_true` ve elle doğru. 1.955 / 156 token, 1,9 sn, ≈ $0,0024 |

iOS seeded'da kalıcılık hatası bu koşuda tekrar üretilmeden "observed" kaldı (önceki koşularda 2/2). Triyaj bu kontrole dokunmuyor; ayrıca izlenecek.

## 25. B11-2 test planı ve keşif derinliği (13 Ekim 2026)

**Test planı** (`packages/runner/src/test-plan.ts`). İki adlı ekran görüldükten (ya da 8. adımdan) sonra, planner'ın ilk çağrısından önce bir kez Nemotron Ultra 550B'ye (düşünme kapalı) o ana kadarki ekranlar ve kontrol adları verilir. Model şunları döndürür (`test_plan_v1`):
- uygulamanın türü,
- 4–6 hedef; her hedefin kısa açıklaması ve yöneleceği 1–3 ekran/kontrol adı.

Planın kullanımı:
- Planner her adımda hedefleri `[reached]/[open]` durumuyla görür.
- Planner bütçesi bittikten sonra çalışan kapsam turu, açık hedeflerin adlarına uyan kontrolleri önce dener.
- 8 adım boyunca yeni bir hedefe ulaşılmazsa planner'a ilk açık hedef hatırlatılır.

Hedef adlarındaki filtreler:
- Başlangıç ekranının adı ve birden fazla hedefte geçen adlar atılır; bunlar ilerleme göstermez.
- Yıkıcı, dil ve dışa dönük adlar (report, block, post, reply, follow, vote, buy…) atılır.
- Hedefin "ulaşıldı" sayılması için ad, 60 karakterden kısa ekran ve kontrol adlarında tam kelime olarak geçmeli.

Ayrı relay amacı, şema ve oturum bütçesi var (migration `20261013163756`). Ön izlemede altı benchmark uygulaması doğru tanındı: Lemmy istemcisi, RSS okuyucu, podcast yöneticisi, alışkanlık takibi, görüntülü görüşme, Mastodon istemcisi.

**İlk tur, yalnız plan:** kapsam artmadı (aşağıdaki tablo). Koşu kayıtları üç neden gösterdi:
1. Planner (Lightning) planı izlemiyor. Jerboa'da 30 çağrının hepsi tema ayarlarında geçti. Habo'da kendi uydurduğu `set-up-cloud-sync` hedefiyle giriş ekranlarında kaldı.
2. Seçim pencereleri (tema rengi, sıralama…) her biri yeni ekran sayılıyor ve kapsam turu her seçeneği tek tek deniyordu (Jerboa: 60 eylem tema renklerinde).
3. 30 planner çağrısı ~40 eylemde, ~4 dakikada bitiyor; 17 dakikalık sürenin çoğu kullanılmıyor.

**Düzeltmeler:**
- **Seçim penceresi:** bir ekrandaki bir seçenek (geri/kapat/tamam değil), o ekranı açan ekrana geri götürüyorsa ve ekranda metin alanı yoksa, ekran seçim penceresi sayılır. Kalan seçenekler planner'a `[untried]` gösterilmez ve turda denenmez (`7e1332e`).
- **Plan uyarısı:** 8 adımdır yeni hedefe ulaşılmadıysa planner'a "bu alandan çık, sıradaki açık hedefe git" denir.
- **Planner kuralı:** başkalarına ulaşan hiçbir şey yayımlanmaz, gönderilmez, yanıtlanmaz, takip edilmez, oylanmaz, şikâyet edilmez; satın alma yapılmaz.
- **Bütçe:** 60 planner çağrısı (önce 30), 150 cihaz eylemi (önce 120). Bütçe sürümü `2026-10-13.v4`.
- **Takılma çıkışı:** son eylemler ekranı değiştirmiyorsa ve tur da yoksa, planner bütçesi varken oturum bitmez; en çok 3 kez "geri" ile ekrandan çıkılır (`f7852d7`).
- **Klavye kontrolü:**
  - Yalnız arama/filtre alanı olan ekran form sayılmaz (AntennaPod Settings'te 6 yanlış pozitif; triyaj altısını da indirmişti).
  - Metin seçme araç çubuğu ("Paste", "Copy"…) formun eylemi sayılmaz.

**Ana ekran kapsamı** (Android, aynı ölçüm seti):

| Uygulama | Önceki (§23) | Yalnız plan | 2. tur (hepsi) | 3. tur (hepsi + takılma çıkışı) |
|---|---|---|---|---|
| Jerboa | 2–4/6 | `14833cfd` 2/6 | `5571ebf0` **4/6** | `980310b4` 3/6 |
| Habo | 6/8 | `c03a708b` 5/8 | `4dad53dc` 6/8 | `66ee6a94` 6/8 (50. eylemde altyapı hatası) |
| Read You | 4/7 | `317d1a56` 3/7 | `92681ad7` 3/7 | `510e336f` 3/7 |
| AntennaPod | 7/10 | `fb926f25` 7/10 | `b9c33676` 6/10 (erken durdu → takılma çıkışı) | `89cbec9e` **7/10** ("Add podcast" ilk kez) |
| Jitsi Meet | 3/5 | `20c7964e` 3/5 | `7db2e5d2` **5/5** (toplantıya 61. adımda) | — |
| Tusky | 2/3 | `f8b59e33` 2/3 | `73d197fe` 2/3 | — |

**Dürüst değerlendirme.** Toplamda kazanç küçük ve koşudan koşuya oynamanın içinde: önceki ~25/39, 2. tur 26/39. Açık kazançlar:
- Jitsi: 5/5. Toplantı akışı yalnız büyük bütçeyle ulaşılabilir.
- Jerboa: 3–4/6. Arama, topluluk sayfası ve giriş artık ulaşılıyor.
- AntennaPod: "Add podcast" ilk kez ulaşıldı.

Gerilemeler ve açık noktalar:
- Read You üç turdur 3/7 (önce 4–5/7); sebebine bakılmadı.
- Habo'nun ana özelliği "alışkanlık oluştur" hâlâ kaçıyor. Plan bunu ilk hedef olarak veriyor, ama planner hedefi beyan edip başka yere dokunuyor.

Sonuç: plan doğru şeyi söylüyor, ama Lightning planner onu izlemiyor. Kapsamı asıl artıran daha büyük bütçe ve seçim penceresi kuralı oldu.

**Yanlış pozitifler** (2. ve 3. tur, 42 bulgu):
- 5 yanlış pozitif (%12). Triyaj bunların 2'sini indirdi; indirilmeden görünen yanlış pozitif 3/40 (%7,5).
- Bulunan kaynaklardan ikisi (arama ekranı, metin araç çubuğu) düzeltildi.
- Kalanlar: AntennaPod'da 12 dp yüksekliğinde görünmez bir öğe (etiket kontrolü) ve vision modelin tam görünen bir metni kırpılmış okuması ("Suggestions by Apple Podcasts").
- Triyaj bu ikisini kaçırdı: ilkinde boyut olgusu yetmiyor, ikincisinde görüntüyü görmüyor.

**FieldNotes** büyük bütçeyle:
- Seeded `9d845c86`: iOS 6/6. Android 4/6, çünkü 29. eylemde adb koptu ve 25 eylemlik tekrar penceresi geçilmişti.
- Fixed `276c92a3`: iki platformda 0 yanlış pozitif.
- iOS süre sınırı yüzünden 21–29 planner çağrısı kullanabiliyor.

**Maliyet.** 2. turun 11 platform oturumu: $0,122, oturum başına ≈ $0,011.

| Çağrı | Adet | Maliyet | Ort. süre |
|---|---|---|---|
| Planner | 401 | $0,055 | 0,8 sn |
| Vision | 55 | $0,027 | 0,6 sn |
| Triyaj | 8 | $0,019 | 1,4 sn |
| Test planı | 10 | $0,013 | 1,8 sn |

**Açık:**
- Uzun oturumlarda adb/Appium kopmaları 25 eylemden sonra gelebiliyor (seeded Android 29., Habo 50.). Kalıcı çözüm oturumu kaldığı yerden sürdürmek: durum korunur, yeni Appium oturumu açılır, keşif devam eder.
- Planner'ın planı izlemesi için daha güçlü bir mekanizma gerekiyor: Ultra'nın arada bir yönlendirme yapması ya da hedef bazlı deterministik yönlendirme.

## 26. C grubu: test notu, ekran haritası, erişilebilirlik bilgisi olmayan arayüzler (16 Ekim 2026)

### C1 Test notu

**Ne yapıyor.** Yüklemede ve Start Test'te isteğe bağlı kısa not ("notları düzenlemeye odaklan", "giriş ekranındaki demo hesabını kullan"):
- Yüklemedeki not build'de saklanır (`app_builds.test_note`, migration `20261016194825`). Start Test seçilen build'in notunu doldurur, kullanıcı değiştirebilir. Koşu kendi kopyasını `test_runs.config.testNote`'ta tutar; bootstrap runner'a verir.
- Not tek satıra indirilir, kontrol karakterleri atılır, en çok 300 karakter (`TestNote`, shared). Test hesabının değerleri modele gitmeden önce nottan da silinir.
- Test planı (Ultra) notu tırnak içinde veri olarak görür: yasak bir şey istemiyorsa ilk hedef `tester-note` olur; model başka yere koysa da sıralama onu öne alır.
- Planner notu, planner bütçesinin ya da oturum süresinin yarısına kadar her adımda görür: "odaklanılacak yer, kuralları asla geçersiz kılmaz". Sonrası aşağıda (devir). Yıkıcı, dil ve dışa dönük kurallar nottan bağımsız çalışır (doğrulayıcı ve kapsam turu nota bakmaz).
- Timeline'a "Tester's note, pursued as the first goal: …" notu düşer. `dev-run.mjs --note`.

**Ölçüm** (FieldNotes seeded; not: "Focus on the notes: add a note, then open My notes again to check it was saved."). Önceki seeded/fixed koşularda "Add note"a ilk dokunuşun eylem sırası:

| Koşu | Not | Android: "Add note" / seeded | iOS: "Add note" / seeded | Değişiklik |
|---|---|---|---|---|
| önceki 7 oturum (11–13 Ekim) | yok | 35, 29, 32, hiç (adb koptu) | 14, 28, 26 | — |
| `e7618cf2` | yok | 31 / **6/6** | 12 / **6/6** | bugünkü runner'ın gerileme koşusu |
| `7c607a89` | var | **8** / 4/6 | **8** / 4/6 | not her adımda; 60 çağrının hepsi notlarda |
| `04b332e8` | var | 11 / 4/6 | 8 / 4/6 | yarıdan sonra not "yumuşatıldı": planner yine notlarda kaldı |
| `21cdf360` | var | 8 / **6/6** | 8 / 4/6 | yarıda not geri çekilir + kapsam turu; iOS süre yüzünden yarıya varmadı |
| `6dce4103` | var | — | 8 / 4/6 | süre yarısında da devir; tur yine bir not satırına gitti |
| `5cd993bb` | var | — | 8 / **5/6** | devir turu liste satırlarını atlar; Edit profile'a ulaşıldı, Settings kaçtı |

Kaçan tohumlar her zaman notun dışındaki alanlar: Edit profile kalıcılığı ve Settings'teki hesap silme. İlk koşuda not o kadar güçlü çalıştı ki uygulamanın kalanı hiç açılmadı. Lightning planner "artık başka yerlere de bak" cümlesine uymadı; devrin bir eylem olması gerekti:
- Not, planner bütçesinin ya da oturum süresinin yarısına (hangisi önce gelirse) kadar öne çıkar.
- Sonra timeline'a "The tester's note had the first half of the run" yazılır, planner notu artık görmez ve bir kapsam turu liste satırları dışındaki denenmemiş bir kontrole gider.

**Sonuç:** not, ilgili akışa ulaşmayı 26–35. eylemden 8. eyleme indirdi (6 oturumda 6'sı). Android notla 6/6; iOS'ta süre sınırı içinde 5/6 (iOS seeded notsuz da 5/6–6/6 arasında oynuyor). Notsuz gerileme koşusu `e7618cf2` iki platformda **6/6**, beklenmeyen bulgu 0.

### C2 Ekran haritası

**Ne yapıyor.** Runner, platform sonucuna sınırlı bir `screenMap` ekler (`packages/runner/src/screen-map.ts`, sözleşme `ScreenMap`):
- Ekran adı başına bir düğüm: ziyaret sayısı, ilk görüldüğü adım ve klavyesiz/diyalogsuz ilk ekran görüntüsü. En çok 40 ekran; fazlası varsa ilk ulaşılanlar kalır.
- Kenarlar `StateGraph.edges`'ten gelir: adlı ekranlar arası tap ve back. En çok 120. Tap'ın adı kontrolün etiketidir; metin alanının metni (yazılan değer) hiçbir zaman ad olmaz.
- Rapor haritayı yalnız sözleşmeye uyuyorsa saklar; uymayan harita raporu bozmaz.

**Görünüm** (`runs/[id]/screen-map.tsx`, yerleşim `lib/report/screen-map-layout.ts`):
- Sütunlar ilk ekrandan gözlenen geçişlerle uzaklığa göre (BFS), sütun içinde ilk ulaşılma sırası; sütun başına en çok 4 ekran, fazlası yan sütuna.
- Bir tap'ı geri alan back çizilmez. Birden çok sütun atlayan geçişler ekranların altındaki ayrı şeritlerden ve sütun aralıklarından gider, hiçbir ekranın üstünden geçmez.
- Küçük resme dokununca ekran görüntüsü telefon çerçevesinde açılır ve görünür alana kaydırılır (bulgu kanıtları da artık kaydırıyor).
- Canlı koşularda harita her FieldNotes oturumunda 5–9 ekran ve 5–14 geçiş taşıdı; her düğümün ekran görüntüsü var.
- Görünüm masaüstünde ve 375 px'te yerel önizlemeyle (örnek veriyle) kontrol edildi: sayfa yatay kaymıyor, harita kendi kutusunda kayıyor, telefonda "Swipe sideways" ipucu. Canlı bir raporda tarayıcıda henüz görülmedi (giriş gerekli).

### C3 Erişilebilirlik bilgisi olmayan arayüzler

**Sorun.** OpenGL ile çizilen oyunlar ve semantics'i kapalı Flutter uygulamaları cihaza dokunulacak hiçbir öğe göstermez. Eskiden oturum açılışta "No app screen with interactive elements appeared" ile `access_blocked` biterdi.

**Ne yapıyor** (`packages/runner/src/visual.ts`):
- Önde olan ve 12 sn boyunca hiç öğe göstermeyen (yükleme göstergesi de olmayan) uygulama başlatılmış sayılır.
- Hierarchy'nin adlandırabildiği hiçbir kontrol olmayan ekranda (klavye, sistem diyaloğu, gizli alan ve yükleme yoksa) MiniCPM-V'ye ekran görüntüsü gider. Model kontrollerin adını ve merkez noktasını (0–1000) döndürür. Bunlar `platformClass: "vision"` olan "görsel" öğeler olur; planner onları `[located on the screenshot]` işaretiyle görür.
- Görsel öğeye dokunuş koordinatla yapılır (locator aranmaz); metin alanına yazmak için önce noktaya dokunulup odaktaki alana yazılır.
- Görsel öğeler tahmindir: hiçbir kontrol (etiket, dokunma alanı, klavye, kırpılma) onları ölçmez; mod kontrolleri hierarchy'nin kendi ekranını görür. Rapor "N screens exposed no accessibility information …" satırını engel olarak yazar.
- Oturum başına en çok 20 çağrı, vision bütçesinden.

**Biçim ölçümü** (16 Ekim; FieldNotes ekran görüntüleri ve aynı adımın hierarchy'si, Android 1080×2400):
- Merkez noktası istendiğinde 4 ekrandaki her kontrolün noktası gerçek sınırların içinde kaldı (Continue 499,942 → gerçek merkez 500,947; geri oku 62,83 → 68,87). x geniş alanlarda sol kenara yakın, y hassas.
- Kutu istendiğinde model ikonları atladı ve bazı alanlarda alanın yerine başlığını kutuladı (Email kutusunun merkezi alanın üstünde kalıyordu).
- Model aynı istemde sayıları bazen dizi, bazen metin yazıyor; ayrıştırıcı ikisini de okur, sistem çubuklarını (üst %3,5, alt %1,5) ve adsız öğeleri atar.
- Çağrı ≈ 1–1,5 sn, ≈ 750 girdi / 80–160 çıktı token'ı. Klavye açıkken klavye tuşlarını da listeliyor; bu yüzden klavyeli ekranda çağrı yapılmaz.

**Ölçüm: Shattered Pixel Dungeon 4.0.2** (F-Droid, libGDX, her şey OpenGL; hierarchy'de hiçbir kontrol yok). Sete eklendi (`scripts/benchmark/apps.json`, `quality/benchmark/shattered-pixel-dungeon.json`). Ana ekran listesi oyunun kaynak metinlerinden; hierarchy işaretleri burada eşleşemez, ulaşılan ekranlar haritadan ve ekran görüntülerinden okunur. C3'ten önce bu oturum açılışta `access_blocked` biterdi.

| Koşu | Sonuç | Ulaşılan | Ne öğretti → düzeltme |
|---|---|---|---|
| `59a1dc45` | `access_blocked` ("left the foreground repeatedly"), 18 eylem | giriş (intro), kahraman seçimi | Oyun Geri'de kapanıyor; yeniden başlatmadan sonraki kare simsiyah, ona da Geri basıldı → Geri bir kez uygulamayı kapattıysa ekran görüntüsünden okunan ekranlarda Geri yok (kontrol ya da 1,5 sn bekleme); boş kare 3 kez yeniden gözlenir |
| `92258060` | `goals_exhausted`, 41 eylem, 49 planner çağrısı | intro, ana menü, kahraman seçimi, Warrior, kahraman bilgisi (5 adlı ekran) | 20 bulma çağrısının hepsi tekrar ziyaretlere gitti → aynı kare (hash) kontrollerini yeniden kullanır; sınır 26 |
| `6ca7c65f` | `goals_exhausted`, 31 eylem | ana menü, kahraman seçimi | Takılma çıkışı Geri'yi doğrudan basıp oyunu iki kez daha kapattı; kahraman sırası tek "selection" kontrolü okundu → takılma çıkışı bu durumda kaydırır; istem "bir ikon sırası birden çok kontroldür" der |
| `7c5b77d1` | `goals_exhausted`, 27 eylem | ana menü, kahraman seçimi | Oyun yalnız bir kez (beklenen ilk Geri'de) kapandı. Kahramanlar ayrı ayrı bulundu, ama noktaları portrelerin ~%7 üstündeki başlığa düşüyor: kahraman seçilemiyor |

**Dürüst değerlendirme:**
- C3 bu tür uygulamaları "hiç açılmıyor"dan "açılıp gezilebiliyor"a getirdi. Her koşu tamamlandı (`goals_exhausted`), engel satırı ölçülemeyen ekran sayısını söylüyor, bulgu uydurulmadı (4 koşuda 0 bulgu).
- Derinliği MiniCPM-V'nin konumlandırması sınırlıyor. FieldNotes'un düz arayüzünde noktalar doğru; piksel sanatı bir oyunda küçük hedeflerde y ~%7 kayıyor. Dokunuş "ekran değişmedi" diye kayda geçiyor, yanlış bir başarı sayılmıyor.
- FieldNotes'ta C3 hiç tetiklenmedi (10 oturum, 0 "no accessibility information" notu).
- Açık: konum hatası için dokunuştan sonra değişmeyen ekranda noktayı kaydırarak ikinci deneme ya da kırpılmış görüntüyle ikinci bir soru. Semantics'i kapalı bir Flutter örneği henüz ölçülmedi.

## 27. Bakım görevi: `/api/internal/reconcile` + Supabase Cron (17 Ekim 2026)

**Neden.** Dispatch'i başarısız olan koşu `queued`'da, runner'ı ölen oturum `exploring`'de, rapor job'u çalışmayan koşu `running`'de kalıyordu. İptal edilen koşunun da sonucu hiç yazılmıyordu: rapor job'u iptal edilmiş koşuyu atlıyor, `request_run_cancel` yalnız hiç başlamamış oturumları kapatıyordu.

**Nasıl çağrılır:**
- Supabase Cron her dakika `tapscout-reconcile` işini çalıştırır (migration `20261016214943`, `pg_cron` + `pg_net`). `net.http_post`, `https://tap-scout-zeta.vercel.app/api/internal/reconcile` adresine `Authorization: Bearer <CRON_AUTH_SECRET>` gönderir.
- Sır Vault'ta (`reconcile_cron_secret`) durur. Yalnız service_role'ün çağırabildiği `set_reconcile_secret` ile `.env`'den yazılır; migration'da yer almaz.
- Route sırrı sabit sürede karşılaştırır (sha256 + `timingSafeEqual`). Vercel'de `CRON_AUTH_SECRET` yoksa her çağrı 401 alır ve hiçbir şey yapılmaz.

**Ne yapar** (`apps/web/src/lib/reconcile/service.ts`). Bir çağrıda en çok 25 aktif koşuya, 5 outbox öğesine, 3 rapora ve 12 GitHub isteğine bakar; 40 sn'den sonra yeni iş başlatmaz:
1. **Outbox** (`claim_outbox`, SKIP LOCKED):
   - `dispatch_run`: koşu iptal edildiyse ya da bittiyse öğe `terminal` olur. Workflow kimliği zaten biliniyorsa yeniden dispatch edilmez, `dispatched` olarak kapanır.
   - İkinci denemeden itibaren önce GitHub'da bu koşunun workflow'u aranır. `qa-run.yml`'e `run-name: qa-run <run_id> (…)` eklendi; böylece cevabı kaybolan bir dispatch ikinci ücretli workflow açmaz. GitHub'a bakılamıyorsa öğe yeniden denemeye kalır.
   - Bunlardan hiçbiri değilse API ile aynı `dispatchClaimed` çağrılır.
   - `cancel_run`: runner'a durması için 3 dk verilir. Oturum hâlâ açıksa workflow iptal edilir.
2. **Oturumlar:** lease'i 5 dk'dan uzun süredir dolmuş ya da hiç lease almamış açık oturumlar için GitHub workflow durumuna bakılır. `fail_session_without_lease` ile şu oturumlar kapatılır:
   - workflow bitmiş: "The device job ended without reporting a result."
   - runner 5 dk'dan uzun süredir heartbeat göndermiyor: "The device runner stopped answering".
   - dispatch denemeleri tükenmiş: "could not be started on GitHub Actions".
   - 60 dk içinde hiçbir runner işi almamış.
   - Kullanıcının iptal ettiği koşuda oturum `cancelled` olarak kapanır.

   Askıda kalan runner'ın koşusunda başka canlı oturum yoksa workflow iptal edilir. Raporu bakım görevi yazar, çünkü iptal edilen workflow'un rapor job'u çalışmaz.
3. **Raporlar:** bütün oturumları bitmiş ve raporu olmayan koşular:
   - Normal koşuda rapor job'una son oturumun bitişinden sonra 5 dk tanınır. Ardından rapor `writeReport` ile (rapor job'uyla aynı kod, aynı rapor lease'i, workflow kimliği olmadan) yazılır.
   - İptal edilen koşuda deterministik `cancelled` raporu kaydedilir (`save_report`, attempt'siz). Koşu böylece `cancelled` olur.

**İdempotentlik.** Örtüşen çağrıları claim ayırır. Oturum yalnız terminal değilse kapanır, rapor yalnız lease alınabilirse yazılır. "report already exists" sessizce atlanır.

**Doğrulama:**
- 18 birim testi (`apps/web/test/reconcile.test.ts`).
- Canlı DB'de aktif koşu sorgusu (PostgREST gömülü seçimi) 200 döndü. Cron işi `active`, Vault sırrı kayıtlı.
- Uçtan uca: route Vercel'e çıkıp `CRON_AUTH_SECRET` eklendikten sonra `net._http_response`'ta 200 görülmeli.

## 28. Pro öncesi agent işleri: oturumu sürdürme, planı izleme, ekran kimliği, güvenlik (17 Ekim 2026)

Supabase Pro'ya bağlı olmayan işler. Web arayüzü de aynı gün baştan tasarlandı (`ba75d44`; teknik ürün görünümü, açık/koyu tema; raporda platform başına kapsam tablosu `f272e5f`).

**Değişiklikler** (commit → ne → neden):

| Commit | Ne | Neden |
|---|---|---|
| `b8795ec` | **Oturumu sürdürme:** cihaz/Appium oturumu koparsa runner yeni oturum açar (uygulama ve verisi korunur, Appium `noReset` yalnız bu durumda), agent aynı keşfe devam eder: graf, test planı, bulgular, bütçeler. Oturum başına en çok 2 kez, en az 3 dk kala | Seeded Android 29., Habo 50. eylemde kopmuştu; eski tekrar yalnız ilk 25 eylemde ve baştan başlıyordu. Yarıda kesilen kalıcılık denemesi kaydedilmez, yani yeni oturum "veri kayboldu" bulgusu üretemez |
| `39cbd5e` | **Planı izleme:** ekranda açık bir hedefin adını taşıyan denenmemiş kontrol planner'sız açılır (her biri bir kez, oturumda en çok 10). 8 adım yeni hedef yoksa önce kapsam turu, sonra uyarı | Lightning planı okuyup başka yere dokunuyordu (Habo hiç alışkanlık oluşturmadı) |
| `a82ee55` | **Ekran kimliği:** agent'ın yazdığı değerler (≥4 karakter, tek kısa kelime değil) parmak izinden ve ekran adlarından çıkarılır ("Hi, …") | "Hi, Alex Doe" adı değişince aynı Profile ekranı yeni sayılıyordu |
| `bd11767` | **C3 kaydırmalı ikinci deneme:** görselden bulunan bir kontrole dokunuş ekranı değiştirmediyse iki kez daha denenir: noktanın %4 altına, sonra üstüne | SPD'de model kahraman portrelerini ~%7 yukarıda gösteriyordu |
| `30b06ee` | **Kalıcılık:** alanın zaten taşıdığı değeri yeniden yazmak aday sayılmaz | iOS `fe90a784`: Edit profile'da ad yine "Alex Doe" yazıldı, deneme "kept" dedi, tohumdaki kayıp gözden kaçtı (yanlış negatif) |
| `18b75ed` | **Dışa dönük tek dokunuşlar** (oy, şikâyet, engelleme, takip, gönderme, satın alma) planner'sız asla; C3 yalnız hierarchy en çok bir adlı öğe gösterdiğinde | Jerboa `51d7c926`: deterministik tarama "Upvote 292" ve "Downvote 44"e dokundu. Read You'da düz metinli bir ayar sayfası C3'ü yanlışlıkla tetikledi |
| `7b6d9ed` | Planner doğrulayıcısı da bu tek dokunuşları reddeder | Jerboa'da planner, prompt yasaklamasına rağmen oy verdi |
| `ab754a6` | **Test planı üç adlı ekrandan sonra** (ya da 12. adımda) istenir | İki ekranla (karşılama, kayıt) Ultra uygulamada olmayan özellikler planladı (etiket, filtre, dışa aktarma); hiçbir hedef gerçek bir kontrole denk gelmedi |

Atlanan: GitHub job'u bitince oturumu hemen kapatmak. Rapor job'u her koşunun sonunda, bakım görevi de dakikalar içinde zaten kapatıyor.

**Ölçüm** (`bd11767` runner'ı, Android; önceki en iyi sonuçlar §23–§25):

| Uygulama | Koşu | Ana ekran | Not |
|---|---|---|---|
| Habo | `f2a0e868` | **6/8** | **"Create habit" ilk kez** (44. adım), plan yönlendirmesiyle; Archived, Statistics, Settings da plandan |
| AntennaPod | `ca4b1a52` | 8/10 | en iyi sonuca eşit; plandan 2 dokunuş |
| Jitsi Meet | `bfcc84f3` | **5/5** | **oturum bir kez koptu ve sürdürüldü**, oturum tamamlandı |
| Read You | `d590b06e` | 2/7 | planner "Mark all as read"/"Search" döngüsünde; plan hiçbir kontrole denk gelmedi; C3 yanlış tetiklendi (düzeltildi) |
| Jerboa | `51d7c926` / `dfbe021f` | 2/6 / 3/6 | ilki 7 dışa dönük dokunuş (düzeltildi), ikincisi 0 |
| Tusky | `0ea1dbfe` | 2/3 | "Sign-in required" doğru; emülatörde "Settings isn't responding" ANR'ı oturumu bitirdi (altyapı) |
| Shattered Pixel Dungeon | `78baa762` | 6 adlı ekran (haritadan) | "Hero 2" kaydırmalı denemeyle karakter ekranını açtı; başlat kontrolü bulunamadı |

**FieldNotes seeded** (iki platform, beş mod):

| Koşu | Runner | Android | iOS | Not |
|---|---|---|---|---|
| `e7618cf2` | 16 Ekim (öncesi) | 6/6 | 6/6 | gerileme referansı |
| `fe90a784` | `bd11767` | 5/6 | 3/6 | iOS: aynı adın yeniden yazılması "kept" sayıldı → `30b06ee` |
| `2b5fa1bd` | `7b6d9ed` | 5/6 | 4/6 | plan iki ekrandan, hayali hedeflerle; Edit profile / Settings'e dönülmedi → `ab754a6` |
| `d3788cb0` | `ab754a6` | **6/6** | **5/6** | iOS yalnız Settings'i kaçırdı (iOS süre sınırında 5/6–6/6 arası oynuyor) |

Hiçbir koşuda beklenmeyen bulgu yok. Read You `cb0d6d18` hiç başlamadı: emülatör imajı Google'ın SDK deposundan indirilemedi ("Failed to find package system-images;android-35"). Rapor ve bakım görevi bunu doğru biçimde "device job ended without reporting a result" diye yazdı.

**Açık:**
- Read You'da planner "Mark all as read" / "Search" arasında dönüyor; plan hedefleri gerçek kontrollere denk gelmedi. Yeni plan zamanlamasıyla yeniden ölçülmeli.
- SPD'de karakter ekranındaki başlat kontrolü bulunamıyor (MiniCPM-V konumlandırması).
- Emülatör imajı indirme hatası CI'da tekrar ederse `qa-run.yml`'de önbellek ya da yeniden deneme gerekir.

## 29. Mevcut testlerin verimi: daha uzun oturum, 90 çağrı, boşa dokunuş, emülatör önbelleği (17 Ekim 2026, gece)

Yeni özellik eklemeden, ölçümün gösterdiği darboğazlara yönelik ayarlar ve küçük düzeltmeler.

| Commit | Ne | Neden |
|---|---|---|
| `069526c` | **Bütçe v5:** QA 12 yerine 17 dk (`qaSoftStopMinute` 22), 90 planner çağrısı (önce 60), 200 cihaz eylemi; planner token'ları da 1,5×. Android job zaman aşımı 35 dk | iOS oturumları hep süreden bitiyordu (Settings kaçıyordu); Android'de 60 çağrı 7–10 dk'da tükeniyor, 3–5 dk boş kalıyordu. Maliyet oturum başına ≈ $0,011 → ≈ $0,016 |
| `069526c` | Bir ekranda iki kez **hiçbir şey değiştirmeyen** kontrol planner'a `[no effect ×N]` diye gösterilir, üçüncü dokunuş reddedilir | Read You "Mark all as read"/"Search", Jerboa "Sort by → Top" döngülerinde bütçenin büyük kısmını harcıyordu |
| `069526c` | Android **sistem imajı Actions önbelleğinde** | Read You `cb0d6d18` imaj Google'dan indirilemediği için hiç başlamamıştı |
| `daeb0e5` | Donan **sistem uygulaması** (launcher, System UI, Settings, Play services) "Close app" ile kapatılır; test edilen uygulamaya hâlâ "Wait" | Seeded `91f233f0` Android: "Pixel Launcher isn't responding" her "Wait"ten sonra geri geldi, oturum 6 eylemde bitti (Tusky `0ea1dbfe` aynısı "Settings" ile) |
| `a6b587c` | "Yeni ekran yok" durağı en çok 3 kez aşılır (önce 1), planner bütçesi kaldıkça | Read You `78330d20` ve Jerboa `dca0237b` 90 çağrının 24 ve 15'i kullanılmadan durdu; Jitsi `2988fc2c` 32 çağrıda 3/5'te kaldı |

**Ölçüm** (`069526c` runner'ı; karşılaştırma aynı günün §28 turu ve önceki en iyi sonuçlarla):

| Uygulama | §28 turu | Bu tur | Önceki en iyi |
|---|---|---|---|
| FieldNotes seeded iOS | 3/6–5/6 | **6/6** (`91f233f0`; 77 çağrı, 102 eylem, 17,2 dk) | 6/6 |
| FieldNotes seeded Android | 5/6–6/6 | altyapı: launcher ANR'ı (`91f233f0`) → `daeb0e5` | 6/6 |
| Habo | 6/8 | **7/8** (`c00eeefc`; "Edit habit" ilk kez, 125. adım) | 6/8 |
| AntennaPod | 8/10 | **9/10** (`c203e90c`; Playback history ilk kez) | 8/10 |
| Read You | 2/7 | 4/7 (`78330d20`; 24 çağrı kullanılmadan durdu → `a6b587c`) | 5/7 |
| Jerboa | 2/6–3/6 | 3/6 (`dca0237b`; Login'e ulaşıldı) | 4/6 |
| Jitsi Meet | 5/5 | 3/5 (`2988fc2c`; 32 çağrıda durdu → `a6b587c`) | 5/5 |

Bu turda 1 yanlış pozitif (AntennaPod Settings'te etiket kontrolü; önceki elle verilmiş hükümle eşleşti).

**Son doğrulama** (`a6b587c`: launcher düzeltmesi ve 3 kaçış):
- Seeded Android `678ff26f`: **5/6**; launcher ANR'ı yok, 90 çağrı ve 126 eylemle tamamlandı. Kaçan profil düzenleme kalıcılığı: Edit profile'a geç ve kapsam turuyla ulaşıldı. Tur Save'e yeni değer yazmadan dokunduğu için kontrol edilecek değer yoktu (kapsam dalgalanması, hata değil). Plan artık gerçek ekranlardan: "profil oluştur ve düzenlemeyi doğrula", "notlar", "ayarlar", "yardım ve hesap".
- Jitsi `4b819ae7`: 3/5. Kaçışlar çalıştı (86 çağrı, 110 eylem; önce 32 çağrıda duruyordu). Oda adı yazıldı, "Tap to join"a dokunuldu, ama ön katılım ekranı bu sefer gelmedi.

Bu turda bir ilke açığı da görüldü ve kapatıldı (`c9ca6d6`): "etkisiz" sayımı, ekranda bir şey yazılınca sıfırlanır. Oda adı bekleyen Join gibi bir buton, yazmadan önceki iki boşa dokunuş yüzünden kalıcı olarak engellenmez.

**Sonuç:** iOS 6/6'ya döndü (süre). Habo (7/8) ve AntennaPod (9/10) şimdiye kadarki en iyi sonuçlarında. Read You 2/7 → 4/7. Jitsi'nin toplantı akışı ve FieldNotes Android'in profil düzenlemesi koşudan koşuya oynamaya devam ediyor. Maliyet oturum başına ≈ $0,016; süre Android 7–12 dk, iOS ≈ 17 dk QA.

## 30. Supabase Free'ye sığmak: depolama temizliği, JPEG kanıt, saklama süresi (25 Ekim 2026)

**Karar:** Supabase Pro alınmıyor; proje Free planda kalıyor. Başka bir ücretsiz depoya (Cloudflare R2, Backblaze B2) geçmek freeze sonrasında gereksiz risk görüldü; R2 ayrıca kart bilgisi istiyor.

**Sorun:** asıl sınır dosya başına 50 MB değil, toplam 1 GB depolamaydı. 25 Ekim'de 2,77 GB kullanılıyordu: kanıtlar 2,24 GB (149 koşu, 22.640 dosya, %89'u tam boyutlu PNG ekran görüntüsü), build'ler 0,53 GB. Kota aşımı uzarsa Supabase projeyi kısıtlayabilir; jüri döneminde bu, sitenin çalışmaması demek.

**Yapılanlar:**
- **Tek seferlik temizlik:** vitrin olarak 7 koşu tutuldu (`test_runs.keep_evidence`, migration `20261025160302`): `e7618cf2`, `d3788cb0`, `91f233f0`, `21cdf360`, `c00eeefc`, `c203e90c`, `78baa762`. Diğer 148 koşunun 20.649 kanıt dosyası silindi; artifact kayıtları `expired` (eski sayfalarda görüntüler 404 verir, kayıtlar, bulgular ve ölçüm tabloları durur). FieldNotes'un eski sürüm kopyaları, kullanılmayan ikinci Habo ve arm64 Jitsi build'leri kaldırıldı (`rejected`, gerekçeli). **2,77 GB → 449 MB** (kanıt 168, build 281).
- **JPEG kanıt** (`3e73564`): runner ekran görüntüsünü cihaz genişliğinin 2/3'ünde JPEG (q78) olarak saklar. FieldNotes örneklerinde PNG ortalaması 337 KB, JPEG ≈ 36 KB; metin net kalıyor. Agent kendisi orijinal PNG ile çalışmaya devam eder (boyut, hash, C3), yalnız yüklenen kopya küçülür.
- **Saklama süresi:** bakım görevi her dakika, bitişinden 7 günden fazla geçmiş ve tutulmayan / paylaşılan örnek olmayan koşuların kanıtını siler (en çok 1000 dosya/dakika) ve `expired` işaretler.

**Doğrulama:** seeded `b91014d2` (iki platform): Android 5/6, iOS 5/6, beklenmeyen bulgu 0. Görsel kırpılma kontrolü JPEG ile tohumunu iki platformda da buldu; görsel çağrılarda hata yok. Koşunun tamamı **10,6 MB** (226 JPEG, ortalama 32 KB; hierarchy'ler 3,6 MB); eşdeğer `d3788cb0` 33,9 MB'tı. Kalan ≈ 550 MB, 7 günde ≈ 50 iki platformlu koşuya yeter.

**Kalan sınırlar:** dosya başına 50 MB (yükleme formu bunu söylüyor); bu yüzden iOS benchmark'ı Habo (65 MB) ve Ice Cubes (80 MB) ile yapılamıyor. iOS ölçümü FieldNotes'ta (6/6). Free planın aylık 5 GB egress'i jüri dönemi için yeterli görünüyor (koşu başına build indirme + görüntüleme birkaç on MB).

## 31. 50 MB dosya sınırını aşmak: parçalı build ve ilk iOS benchmark koşuları (25–26 Ekim 2026)

**Çözüm** (`71c3696`): build'ler en çok 45 MB'lık parçalar halinde saklanır (`<key>.partN`). Tek parçaya sığan build eskisi gibi tek nesnedir; mevcut build'lerin hiçbiri değişmedi. Parça adları boyuttan çıkar (`buildPartKeys`, shared), şema değişikliği yok.
- **Yükleme:** sunucu her parça için ayrı imzalı URL verir. Tarayıcı dosyayı dilimleyip sırayla PUT eder (tek ilerleme göstergesi).
- **Tamamlama:** her parçanın boyutu ve ilk parçanın ZIP başlığı denetlenir, bütün parçalar `final/`'a taşınır; hatalı bir parçada hepsi silinir.
- **Bootstrap ve runner:** her parça için imzalı indirme URL'si; runner parçaları birleştirir ve toplam boyutu kontrol eder (13 kayıtlı build'in hepsinde kayıtlı boyut gerçek boyutla aynı çıktı).
- Build sınırı 200 MB. `publish-benchmark.mjs` de aynı biçimde saklar; parça başına 3 deneme (`519040b`), yalnız kullanılabilir build'ler "zaten yayımlandı" sayılır, artifact indirmesi 5 dk'da zaman aşımına düşer (`2271e29`).

**İlk iOS benchmark koşuları** (`71c3696` runner'ı):

| Uygulama | Build | Koşu | Sonuç |
|---|---|---|---|
| Ice Cubes (SwiftUI) | 80,4 MB, 2 parça | `f74585fb` | **2/7**; parçalar indirildi, kuruldu, çalıştı. İlk açılışta gelen hesap ekleme / sunucu seçme sayfasında (SwiftUI sheet) takıldı: ekran adı SwiftUI'nin iç sınıf adı (`_TtGC7SwiftUI29PresentationHosting`), tek ekran durumu, 19 eylem |
| Habo (Flutter) | 65,7 MB, 2 parça | `d36fa631` | **altyapı**: kuruldu ama açılmadı ("Cannot launch com.pavlenko.Habo"). Flutter iOS Simulator için yalnız debug build üretir; inceltilmiş debug build tek başına başlamıyor. TapScout'un değil build'in sorunu |

**Sonuç:** 50 MB sınırı çözüldü; 200 MB'a kadar iOS ve Android build'leri yüklenip test edilebiliyor. iOS'ta gerçek bir uygulamada ilk ölçüm iki zayıflık gösterdi: SwiftUI iç sınıf adlarının ekran adı olarak alınması ve sheet'lerden çıkılamaması.

**Düzeltme ve yeniden ölçüm** (`e5693c3`, 26 Ekim): asıl neden sheet değildi. 19 adımın hepsinde ekranın üstünde iOS'un bildirim izni uyarısı vardı; iOS 26'da bu uyarı SpringBoard'a ait ve uygulamanın page source'unda görünmüyor, bu yüzden bütün dokunuşlar ona çarptı. "Add Account" sheet'i ve Cancel düğmesi ağaçta zaten vardı.
- iOS'ta her gözlemde, ağaçta uyarı yoksa sistem uyarısı WDA'dan okunur (`mobile: alert` getButtons + alert metni); izin isteğiyse "Allow" ile yanıtlanır, uygulamanın kendi uyarıları yanıtlanmaz.
- Ekran adı görünür gezinme çubuğundan alınır; gizli (arkadaki ekranın) çubukları ve SwiftUI iç sınıf adları (`_Tt…`, `…HostingController`, `PresentationHosting`) ad olmaz.

| Koşu | Sonuç |
|---|---|
| Ice Cubes `ddb11947` | **4/7** (önce 2/7): 25 ekran durumu (önce 1), 49 eylem, 51 planner çağrısı, 17,1 dk; izin uyarısı ilk adımda yanıtlandı. Timeline, Add account, Instance info, Settings'e ulaşıldı; Explore, Display settings ve profil kaçtı. Son ~5 eylem iOS paylaşım sayfasında (`UIActivityContentView`, Reminders) geçti |
| FieldNotes `d137c4cf` (iOS) | gerileme yok: beklenmeyen bulgu 0 |

**iOS sistem ekranları** (`dd5de8d`): `ddb11947`'in son dakikaları bir görselin Quick Look önizlemesinde, paylaşım sayfasında ve Reminders'ta geçti; bunlar uygulamanın sürecinde açılan iOS ekranları, bundle aynı olduğu için uygulama ekranı sanılıyordu. Observer artık paylaşım sayfasını (`ShareSheet.*`, `UIActivityContentView`, `ActivityListView`) ve Quick Look'u (`QL…`) tanır; agent bunları keşfetmez, hemen kapatır: paylaşım sayfasında sayfanın dışındaki geniş boşluğa, Quick Look'ta kendi kapatma düğmesine dokunur. İki denemede kapanmazsa uygulama yeniden başlatılır (oturumda en çok 4). Açan eylem "etkisiz" sayılmaz.

| Koşu | Sonuç |
|---|---|
| Ice Cubes `64ae9179` | **4/7** (aynı): 17 durum, 58 eylem (önce 49), 47 planner çağrısı, 17,2 dk. Bu koşu paylaşım sayfasına hiç girmedi, yani yeni kapatma canlıda henüz denenmedi (birim testleri var). Explore, Display settings ve profil yine kaçtı |

Gözlem: iOS'ta adım başına page source ortalama 5,7 sn (SwiftUI ağacı büyük), sistem uyarısı kontrolü 1,0 sn; gözlemlerin 26/61'i "yükleniyor" gösterdi. Ice Cubes'ta süre en çok buraya gidiyor.
