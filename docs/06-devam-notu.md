# TapScout — Devam Notu (yeni oturum için)

Tarih: 11 Ekim 2026 (gece, G3 sonrası)  
Amaç: Yeni bir çalışma oturumunun, önceki konuşmayı okumadan kaldığı yerden devam edebilmesi. Ayrıntılı tasarım `01`–`04`, plan ve ölçümler `05`'tedir, sıradaki işin planı `07`'dedir. Bu not durum özeti ve çalışma kurallarıdır.

## 1. Proje ve takvim

- **TapScout:** Android APK ve iOS Simulator build'lerini test senaryosu yazmadan test eden otonom mobil QA agent'ı. Planlayıcı NVIDIA Nemotron, Nebius Token Factory üzerinden çağrılıyor.
- **Yarışma:** Nebius x NVIDIA Global AI Hackathon (Devpost). Track: **Coding and Agentic Engineering**.
- **Takvim (Türkiye saati):**

  | Kilometre taşı | Tarih |
  |---|---|
  | G3: planner kalite kontrol noktası | 16 Ekim |
  | Feature freeze | 24 Ekim |
  | İç teslim hedefi | 29 Ekim 20:00 |
  | **Son teslim** | **30 Ekim 20:00** |
  | Jüri dönemi | 1–15 Aralık |

- **Şu an (11 Ekim, gece):** F2 ve F3 bitti; `07`'nin (gerçek uygulamalara dayanıklılık) A grubu ile B7 ve B10 da bitti. 7 açık kaynak uygulamalık ölçüm setinde (Android) beş tur koşuldu: son turlarda yanlış pozitif %0, hiçbir oturum ilk ekranlarda takılmıyor, bir uygulamada (Jerboa) gerçek bir çökme bulundu. FieldNotes gerilemesiz: seeded iki platformda 6/6, fixed 0 yanlış pozitif, login hesaplı/hesapsız doğru. Ayrıntı `07` §7, `05` §21. **G3 karşılandı** (`05` §22): son runner'la seeded `9a50d038` iki platformda 6/6, fixed `a60921bc` 0 YP, login hesaplı `bf758efb` iki platformda giriş geçti, hesapsız `5b0eb187` "Sign-in required". Yol boyunca üç gerçek hata bulundu ve düzeltildi (iOS giriş alanlarını bozan maskeleme, iOS kayıp tuş vuruşları, kalıcılıkta yanlış negatif). A2 süreyi artırmadı. $25 kredi çalışıyor. Takvimin ~10 gün önündeyiz.

## 2. Altyapı ve kimlikler (sır içermez)

| Kaynak | Değer |
|---|---|
| GitHub repo | https://github.com/OzzyD07/TapScout (public, `main`) |
| Web (Vercel Hobby) | https://tap-scout-zeta.vercel.app, proje `tap-scout`, root `apps/web`, fonksiyonlar `fra1` |
| Supabase | proje `TapScout`, ref `gumxrcxweozrjblkthyb`, `eu-central-1`, org `OzzyD07` (henüz **free**; Pro'ya geçilecek) |
| Storage | private `builds` ve `evidence` bucket'ları (şimdilik 50 MB; Pro sonrası `builds` 300 MB yapılacak) |
| Cihaz runner'ları | GitHub-hosted, ücretsiz: `ubuntu-24.04` (KVM, Android API 35 x86_64), `macos-26` (Xcode 26.6, iOS 26.x Simulator) |
| Model | Planner `nvidia/Nemotron-3_5-Lightning`, `response_format: json_schema`, `chat_template_kwargs: {enable_thinking: false}`; görsel `openbmb/MiniCPM-V-4_5` (o da düşünme çıktısı veriyor, relay'de kapatılmalı/ayıklanmalı) |
| Kullanıcı | `tester@tapscout.com` (admin rolü; şifreyi yalnız proje sahibi bilir) |
| Örnek build'ler (`fixed`) | Android `21dabfb2-3c1a-44d9-9f8c-7b71afe404b2` (39,5 MB), iOS `6a169527-b725-480b-95b8-f4e45e99fdeb` (11,1 MB) |

Yerel `.env` (git'e girmez) şunları içerir: Supabase URL + publishable + secret key, `GITHUB_DISPATCH_TOKEN` (fine-grained, 7 Ocak 2027'ye kadar), `TOKEN_FACTORY_API_KEY` (geçerli; şu an yalnız **$1 deneme kredisi**), `RUNNER_TOKEN_SIGNING_KEY`, `APP_BASE_URL`. Vercel'e eklenen değişkenler: Supabase anahtarları, runner imzalama anahtarı, OIDC audience, GitHub değişkenleri. 10 Ekim'de `TOKEN_FACTORY_*`, `NEMOTRON_MODEL_ID` ve `VISION_MODEL_ID` de eklendi (relay geçersiz token'a 401 dönüyor; değişken eksikse 500 döner).

## 3. Repo yapısı

```text
apps/web/            Next.js 16 (App Router, Tailwind 4, Cache Components kapalı)
  src/proxy.ts       Oturum yenileme (getClaims), giriş yönlendirmesi
  src/app/           panel + Start Test formu, /login, /runs/[id] (canlı timeline), API route'ları
  src/lib/runner/    OIDC doğrulama, runner token'ları, runner/artifact servisleri
  src/lib/runs/      dispatch (GitHub), koşu servisi, timeline mantığı
  src/lib/report/    deterministik rapor ve rapor servisi
apps/sample-app/     Expo SDK 57 örnek uygulama FieldNotes (karşılama → kayıt → profil → düzenleme)
packages/shared/     Zod sözleşmeleri (gözlem, eylem, olay, bulgu, rapor, API, bütçe)
packages/adapters/   WebdriverIO/Appium oturumu, locator adayları, smoke CLI
packages/runner/     GitHub job'ı içinde çalışan runner (bootstrap, heartbeat, olaylar, kanıt, finish)
supabase/migrations/ şema, RLS, RPC'ler, private helper, bucket'lar, claim_run_dispatch
scripts/             probe-models, publish-sample, dev-run, db-smoke, check-ground-truth, ci/*
.github/workflows/   ci, build-sample, device-smoke, qa-run (android + ios + report job)
quality/ground-truth/ koşu sonrası kalite değerlendirmesi; runtime kodu buraya erişemez
```

## 4. Çalışan ve doğrulanan zincir

1. **Start Test.** `POST /api/runs` → `create_test_run` (run + oturumlar + bütçeler + outbox) → `claim_run_dispatch` → GitHub `workflow_dispatch` (`return_run_details`) → workflow kimliği kaydedilir. Kullanıcı başına en çok 2 aktif koşu.
2. **Runner bootstrap.** `qa-run.yml` cihaz job'u GitHub OIDC token'ıyla `/api/runner/bootstrap`'a gelir ve şunları alır: lease, oturum token'ı, build'in imzalı indirme URL'si.
3. **Cihaz ve kanıt.** Runner build'i indirip hash'ler ve Appium oturumu açar. Ekran görüntüsü ve ekran yapısı `/api/runner/artifacts` (imzalı yükleme) ve `/complete` (boyut doğrulama) ile kaydedilir. Olaylar sıralı ve idempotent gider. Heartbeat 30 sn'de bir çalışır ve token'ı yeniler.
4. **Rapor.** Rapor job'u `/api/report` çağırır: sonuç bildirmeden biten oturumları `infrastructure_failed` yapar, rapor lease alır, deterministik raporu kaydeder ve run'ı `completed/partial/infrastructure_failed` yapar.
5. **Canlı izleme.** `/runs/[id]` Realtime ile olayları izler; her (yeniden) bağlantıda geçmişi tamamlar. Kanıtlar `/api/artifacts/[id]` ile RLS kontrolünden sonra 15 dk'lık imzalı URL'le gösterilir.

**Doğrulanan koşular:**

| Run | Ne kanıtladı | Süreler |
|---|---|---|
| `dae8c768` | İlk uçtan uca koşu; rapor job'u henüz yoktu, durum elle `completed` yapıldı | — |
| `2f3b8028` | Rapor job'u dahil tam zincir: iki oturum `completed`, 16 olay, 8 kanıt, rapor ve run `completed` | Android 3,3 dk, iOS 12,1 dk, rapor 6 sn |
| `cdf5265f` | Web'den Start Test (proje sahibi). iOS `completed`; Android `blocked`: uygulamanın üstünde sistemin "Pixel Launcher isn't responding" ANR diyaloğu vardı, eski sabit adım bunu erişim engeli sandı. Observer artık bu diyaloğu tanıyıp "Wait"e basıyor | — |
| `202c4d49` | **İlk Nemotron agent koşusu.** İki platformda örnek uygulamanın bütün ekranları (Welcome, Create profile, Profile, Edit profile) ve Sign out dönüşü keşfedildi; reddedilen öneri 0, başarısız eylem 0; 30'ar planner çağrısı | Android oturumu 4,0 dk, iOS 7,1 dk; model ≈ $0,0056 (28–30 bin girdi / ~4,4 bin çıktı token'ı, ortalama 0,8 sn/çağrı) |

**Henüz doğrulanmayanlar:**
- Vercel'deki GitHub değişkenleri doğrulanmadı. Eksikse koşu `queued`'da kalır, çünkü bakım/cron görevi yok.

**Testler:** 270 birim testi (shared 9, adapters 6, runner 142, web 113; 13 Ekim) ve veritabanı smoke testi. Runner testleri gerçek Android/iOS hierarchy fixture'larıyla (`packages/runner/test/fixtures`) ve sahte cihazla agent döngüsünü kapsar.

## 5. Çalışma kuralları (önemli)

- **Atıf yok:** Commit ve PR'lara Claude/Anthropic atfı (`Co-Authored-By`, "Generated with Claude Code") **eklenmez**. `CLAUDE.md` dosyaları repoya girmez. Proje sahibinin açık isteği.
- **Commit kontrolü:** Commit'ten önce `pnpm check` (lint + typecheck + test) **geçmeli**. Komut zincirini `set -e` ile kur; hata grep'le yutulmasın. Ayrıca `bash scripts/check-ground-truth.sh` çalıştır. Workflow'ları CI'daki `workflows` job'u actionlint (`rhysd/actionlint:1.7.7` imajı, shellcheck dahil) ile denetler; push sonrası sonucuna bak. Yerelde: Docker açıkken `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:1.7.7`. Yeni runner etiketleri `.github/actionlint.yaml`'a eklenir.
- **Push:** Proje sahibinin onayı var; başka onay gerekmiyorsa push edilebilir.
- **Migration'lar:** Supabase MCP `apply_migration` ile uygulanır. Ardından yerel dosya adı, `list_migrations`'ın verdiği sürümle değiştirilir; yerel ve uzak geçmiş aynı kalmalı.
- **GitHub API:** `.env`'deki `GITHUB_DISPATCH_TOKEN` ile çağrılır. Kimliksiz kota saatte 60 istek ve hemen bitiyor. Makinede `gh` CLI yok.
- **Vercel MCP:** Takım kapsamlı proje ayarlarını ve ortam değişkenlerini **göremiyor**. Deploy durumu `get_deployment("tap-scout-zeta.vercel.app")` ve curl ile izlenir. Ortam değişkenlerini proje sahibi elle ekler.
- **Sırlar:** `.env`'deki değerler hiçbir zaman ekrana veya sohbete yazdırılmaz.
- **Benchmark araçları:** build'ler `build-benchmark.yml` (girdi `apps`: all/fdroid/habo/ice-cubes) → `node --env-file=.env scripts/publish-benchmark.mjs --run-id <id>`; koşu `node --env-file=.env scripts/dev-run.mjs --owner tester@tapscout.com --platforms android --modes functional,stress,ui_ux,accessibility,store_readiness --app "<App adı>"`; değerlendirme `node --env-file=.env quality/evaluate-run.mjs --run <id>` (benchmark build'lerinde hierarchy'leri `quality/results/hierarchies/`'e indirir). Bulgu hükümleri `quality/benchmark/<app>.json` → `verdicts` (check + `titleIncludes`/`region`). Kullanıcı başına en çok 2 aktif koşu var; çok koşu sırayla gönderilmeli.
- **Dosya düzenleme tuzağı:** bu makinede `python - <<'EOF'` ile TS yazarken `"\b"` geri silme karakterine, `"\n"` gerçek satır sonuna dönüşebiliyor. Regex ve kaçışlı metinleri Edit aracıyla ya da node `String.raw` ile yaz; sonrasında `grep -c $'\x08' <dosya>`.
- **Next.js 16:**
  - Kurulu belgeler `node_modules/next/dist/docs` altında.
  - `middleware` yerine `proxy.ts`.
  - Kimlik her zaman `getClaims()` ile doğrulanır.
- **Ortam:** Expo SDK 57 ve `nodeLinker: hoisted` kullanılıyor. Node ≥ 22.19 gerekli (WebdriverIO 10).
- **Yerel ortam:** Windows; iOS build'i yalnız CI'da alınabiliyor. Docker Desktop, yerel Supabase (`npx supabase db start`) için gerekli.

## 6. Proje sahibinde bekleyenler

- [x] **Vercel'e `APP_CREDENTIALS_ENCRYPTION_KEY` eklemek** (11 Ekim; `7ccf0723`'te bootstrap hesabı çözdü): değer yerel `.env`'de (11 Ekim'de üretildi, 32 bayt base64). Eklenmeden test hesabıyla yükleme "Test accounts are not enabled on this server" hatası verir. Anahtar değişirse kayıtlı hesaplar çözülemez.
- [ ] Supabase Pro'ya geçiş (11 Ekim gecesi hâlâ alınamadı). Ardından `builds` bucket sınırı 300 MB'a çıkarılacak; iOS benchmark build'leri (Habo 65 MB, Ice Cubes 80 MB) buna bağlı.
- [x] Siteye girip Start Test'i denemek (10 Ekim, run `cdf5265f`; Realtime ve rapor çalıştı).
- [x] Token Factory kredisi: hackathon'un **$25 kredisi 11 Ekim gecesi tanımlandı** (proje sahibi). O ana kadar $1 deneme kredisinin tahmini ~$0,52'si harcanmıştı (`usage_records`; beş modlu tek platform koşu ≈ $0,005–0,01). G3 koşularında relay 402/401 vermedi; kredi çalışıyor.
- [x] Vercel'e `TOKEN_FACTORY_*`, `NEMOTRON_MODEL_ID`, `VISION_MODEL_ID` (10 Ekim).

## 7. Sıradaki işler (F2 ve açık borçlar)

### F2 (13–19 Ekim)

1. ~~Model relay~~ **bitti** (`apps/web/src/lib/relay`): runner token + lease → `reserve_model_budget` → tek Token Factory çağrısı → `settle_model_budget` → `usage_records`. Planner `json_schema` + `enable_thinking=false`; görsel yalnız aynı oturum denemesinin hazır screenshot'ı, düşünme kapalı. Usage gelmeyen timeout/5xx'te rezerv tam sayılır.
2. ~~Observer~~ **bitti** (`packages/runner/src/observer.ts`): Android/iOS page source → ortak öğe sözlüğü (bounds screenshot pikselinde), secret maskeleme, Android ANR/crash diyaloğu tespiti.
3. ~~State graph ve agent döngüsü~~ **bitti** (`state.ts`, `planner.ts`, `agent.ts`): yapısal parmak izi, döngü tespiti, karar başına 1 repair, deterministik fallback; 10 eylemdir yeni durum yoksa ve ekrandaki her kontrol denendiyse `goals_exhausted`. Prompt sürümü `planner-2026-10-10.v1`.
4. ~~Functional modu~~ **bitti** (`functional.ts`, `agent.ts`): 4 kontrol (`flow_transitions`, `form_feedback`, `return_paths`, `persistence`). Kalıcılık kontrolü kaydın hemen ardından: yeniden başlat → gözlenen yolla ekrana dön → değeri ara; kaybolursa yeni değerle 2 replay (`n/m`). Kontroller/bulgular `finish_session` (migration `20261010132533`) ile aynı transaction'da yazılır; rapor ve run sayfası gösterir.
   - Doğrulama: `fixed` iki platformda kalıcılık geçti, bulgu yok (`3a257421`). `seeded` "Saved About you is lost after the app restarts" **Reproduced 2/2**: Android `33277262`, iOS `026837ac`. Android launcher ANR'ı CI'da launcher kapatılarak çözüldü. iOS'ta klavye altındaki kontroller `[under keyboard]` işaretlenir; klavye `hideKeyboard` → dönüş tuşu → metne dokunma sırasıyla kapatılır.
5. ~~Örnek uygulama v1~~ **bitti** (`8976a48`; build'ler yayımlandı: fixed ve seeded). Hata listesi `quality/ground-truth/fieldnotes-seeded-v1.json`. Eski plan maddeleri:
   - Not listesi; ayarlar (privacy policy linki, hesap silme).
   - `seeded` / `fixed` / `changed_flow` varyantları; kasıtlı hatalar `05` §8'de.
   - Ground-truth manifest'i yalnız `quality/` altında.
6. **G3 (16 Ekim):** Planner'ın en az 3 ekranı keşfetmesi ve geçersiz eylem uygulamaması. v0 örnek uygulamada `202c4d49` ile karşılandı; v1 (daha çok ekran ve kasıtlı hatalar) üzerinde yeniden ölçülecek.

### 11 Ekim oturumunda biten (ayrıntı `05` §18)

- **Rapor özeti (Nemotron):** `/api/report` rapor lease'i altında özet ister (`relayReportSummary`, rapor bütçesi, en çok 3 istek). Metin kayda karşı doğrulanmadan kaydedilmez; başarısızsa `summary: null`, rapor yine tam.
- **Rapor UI:** `runs/[id]/report-section.tsx`: F1… etiketli bulgu kartları, platform/mod filtreleri, "Steps to reproduce", özet etiketleri kartlara bağlı.
- **Kapsam:** `packages/runner/src/coverage.ts`: denenmemiş kontrollere planner'sız "tur"; planner bütçesi bitince de devam; liste satırı ailesinden tek temsilci; yıkıcı kontroller (delete/sign out/reset) planner'sız denenmez.
- **Build yükleme:** `POST /api/builds` + tarayıcıdan doğrudan Storage'a PUT + `POST /api/builds/[id]/complete`; Start Test'te platform başına build seçimi. Runner kurulamayan build'i `blocked/unsupported` ve açıklamayla raporlar.
- **Küçükler:** iOS cihaz adı `simctl`'den; crash bulgusundaki tekrar eden cümle.
- **Örnek uygulama `login` varyantı** (`05` §20): hesaplı koşu girişi geçti (`7ccf0723`), hesapsız koşu iki platformda "Sign-in required" dedi (`6af17ed2`); sır sızıntısı yok.
- **Giriş duvarı ve test hesabı** (`05` §19): aşılamayan giriş/kod/CAPTCHA ekranı rapora açık engel olarak yazılır; yüklemede şifreli test hesabı, planner yalnız `credential_ref` görür, Appium logu hesaplı oturumda yüklenmez.

### 11 Ekim gecesi biten (`07` §7, `05` §21)

- **A5 ölçüm seti:** 7 uygulama (Jitsi Meet RN, AntennaPod Views, Read You Compose, Jerboa Compose, Tusky Views, Habo Flutter, Ice Cubes SwiftUI) + yalnız-arm64 Jitsi. Beklentiler `quality/benchmark/`, kaynaklar `scripts/benchmark/apps.json`. Android'de beş tur; iOS build'leri 50 MB sınırını aşıyor (Pro bekleniyor).
- **A1 kesintiler:** sistem izinleri "Allow"; açılıştaki uygulama içi diyalog/tanıtım/onay planner'sız; Appium uygulamayı başlatmıyor (`autoLaunch: false`); paylaşım sayfasından Geri ile çıkış.
- **A2 yükleme:** spinner/"Loading…" varken en çok 5 sn bekleme.
- **A4 yanlış pozitif:** etiket içerikten; kırpılmış/kenardaki kontroller; alt gezinme ve liste satırları klavye kontrolünde yok; WebView satır içi linkleri ölçülmez; join/search gönderimleri kalıcılık adayı değil; gruplanmış bulgular; en çok 50 bulgu.
- **A9:** `.aab`/split APK/`.ipa` için açıklamalı ret ve "nasıl üretilir"; arm64-only APK emülatörde çalışıyor (ölçüldü).
- **B7:** ana gezinme girişleri oturumda bir kez planner'sız açılır. **B10:** Android çökme bulgusu crash logu taşır (maskeli, imzaya göre gruplanmış).
- **Agent:** dil seçeneğine dokunmaz; hesapsız giriş formuna yazmaz, test hesabının kullanıcı adını doğrular; şifresiz giriş duvarı; isteğe bağlı giriş oturumu bitirmez; Flutter alanlarına odaktan yazar; "Geri uygulamadan çıkardıysa tekrar Geri yok"; emülatör offline olursa bir kez yeniden bağlanır.

### 11 Ekim gecesi, G3 oturumu (`05` §22)

- **G3 bitti:** dört FieldNotes build'i, iki platform, beş mod; ölçüt karşılandı. Maliyet koşu başına ≈ $0,011–0,013.
- **Düzeltmeler:**
  - Erken hata tekrarından önce emülatör adb'ye geri getirilir (`0eda082`).
  - Test hesabı parçaları yalnız bütün öznitelik değeri olarak maskelenir; değerlendirici "signed in" demek için runner'ın geçiş notunu ister (`107f31d`).
  - 100 karaktere kadar yazılan her değer okunur, tutmazsa bir kez yeniden yazılır (`b8487b7`).
  - Kalıcılıkta, tam metin olarak kaydedilen değer tam metin olarak aranır (`6049766`).
- **A2 süre etkisi ölçüldü:** eylem başına süre Android −%12, iOS −%14 (artış yok).

### 12 Ekim gecesi, ölçüm setinde altıncı tur (`05` §23)

- Altı Android uygulaması; turun toplamında 28 bulgu, 2 yanlış pozitif (%7,1; düzeltildi), son koşularda %0. FieldNotes seeded Android `e88b141a` 6/6.
- **Düzeltmeler:**
  - Dil ayarı satırına ve dil listesindeki her seçeneğe dokunulmaz; Jerboa Norveççeye geçmişti (`f2cc784`).
  - Yeni oturumla tekrar 25 eyleme kadar (planner bütçesinin en çok üçte biri harcandıysa) (`52dc6ec`).
  - Açılış sırasındaki cihaz hatası da tekrara düşer (`e66a72d`).
  - Android klavye kontrolü kimliksiz kontrolleri karşılaştırmaz; 2FA alanlı şifre formu giriş duvarıdır (`625f532`).
- **Açık:** Jerboa kapsamı 2/6–4/6 dalgalı (içerikte kalıp erken duruyor); Tusky giriş ekranının adı "Screen 1" ve duvar iki kez yazılıyor.

### 13 Ekim, B11 bulgu triyajı (`05` §24)

- Oturum sonunda Nemotron Ultra 550B (düşünme kapalı) sezgisel bulguları hierarchy olgularıyla gözden geçirir. "Muhtemelen yanlış" olan elle incelemeye iner, silinmez; tekrar üretilmiş bulgulara dokunulmaz. Ayrı relay amacı, şema ve oturum bütçesi var (migration `20261013152702`). Rapor hükmü ve gerekçeyi gösterir.
- Çevrimdışı ölçüm `quality/triage-eval.mjs` (210 elle hükümlü örnek): yanlış pozitiflerin %63–65'i, doğru bulguların %1'i indirildi.
- Canlıda seeded `8e77605c` iki platformda 6/6; Jerboa `613d10af`'teki 3 doğru bulgu `likely_true`. Çağrı ≈ 1,3–1,9 sn, ≈ $0,001–0,002.
- Model kodda varsayılan; Vercel'de `TRIAGE_MODEL_ID` ile değiştirilebilir (eklenmesi gerekmiyor).

### 13 Ekim, B11-2 test planı ve keşif derinliği (`05` §25)

- **Test planı:** iki ekrandan sonra Ultra uygulamanın türünü ve 4–6 hedefi söyler; planner hedefleri durumlarıyla görür, kapsam turu açık hedeflere öncelik verir (migration `20261013163756`).
- **Aynı turda eklenenler:** seçim penceresi kuralı (bir seçenek yeter), 8 adım plan uyarısı, takılma çıkışı (en çok 3 geri) ve "başkalarına ulaşan hiçbir şeyi yayımlama" kuralı. Bütçe 60 planner çağrısı / 150 eylem.
- **Klavye kontrolü:** arama ekranı ve metin araç çubuğu artık sayılmıyor.
- **Sonuç:** kapsam ~25/39 → 26/39; Jitsi 5/5 ve Jerboa 3–4/6 iyileşti, Read You 3/7'de kaldı. Planı planner izlemiyor; kazancı bütçe ve seçim penceresi kuralı getirdi. Oturum maliyeti ≈ $0,011.
- **Açık:** 25 eylemden sonraki adb/Appium kopmaları (oturumu sürdürme yok); Habo'da "alışkanlık oluştur" hâlâ kaçıyor.

### Hemen sıradaki

1. **Gerçek kullanıcı build'iyle uçtan uca deneme:** web'den yükle → Start Test (proje sahibinin tarayıcısında; giriş gerekli). Yükleme formundaki "How do I get these files?" bölümü ve `.aab` reddi tarayıcıda hiç görülmedi. Jüri deneyimi için en önemli kalan iş.
2. **Bakım/cron** (Açık borçlar): `queued`'da takılan koşuyu ve kesilen oturumları toparlayan görev. Jüri denemesinin takılmaması için.
3. **Oturumu sürdürme:** 25 eylemden sonra kopan cihaz oturumunda durumu koruyup yeni Appium oturumuyla devam etmek.
4. **Planner'ın planı izlemesi:** Ultra'nın arada yön vermesi ya da hedef bazlı deterministik yönlendirme (Habo "Add", Read You).
5. **Supabase Pro gelince:** bucket 300 MB, Vercel'e `STORAGE_BUILDS_MAX_BYTES`, iOS benchmark (Habo, Ice Cubes) ilk tur.
6. **Zaman kalırsa (`07` §4):** B6 (alan türüne göre veri), B8/B11-3 (ekran sınıflandırma), C grubu.
7. **24 Ekim sonrası:** F4–F5 (`05` §6: jüri hesapları, sabit örnek rapor, README, demo video, Devpost).

### Açık borçlar

- **Bakım/cron:** `/api/internal/reconcile` + Supabase Cron. Şunları üstlenecek: bekleyen outbox dispatch'leri, heartbeat'i kesilen oturumlar, rapor yeniden denemesi, cevap vermeyen runner için GitHub workflow iptali. Şu an koşu `queued`'da takılırsa elle müdahale gerekir.
- **Build yükleme:** resumable (TUS) yükleme yok; 50 MB Free sınırında tek PUT yeterli. Pro'dan sonra bucket sınırı 300 MB ve Vercel'e `STORAGE_BUILDS_MAX_BYTES`.
- **Agent ayrıntıları:** profil başlığı kullanıcı verisini içeriyor ("Hi, Alex Doe") ve parmak izine giriyor; ad değişince yeni durum sayılabilir. Rapor agent sayaçlarını ve geçişleri özetlemiyor.
- **Kalite pilotu ve teslim (F4–F5):** `05` §6 (jüri hesapları, sabit örnek rapor, README, demo video, Devpost).

## 8. Yeni oturumu başlatma mesajı

> TapScout projesine devam ediyoruz (bu klasör). Önce `docs/06-devam-notu.md`'yi (özellikle §5 çalışma kuralları, §6 bekleyenler ve §7 "Hemen sıradaki"), sonra `docs/07-gercek-uygulama-plani.md` §7'yi ve `docs/05-v1-plan.md` §21–§25'i oku. `docs/01`–`04`'e yalnız gerektiğinde bak. Durum: F2, F3, `07`'nin A grubu, B7 ve B10 bitti; **G3 karşılandı** (FieldNotes seeded iki platformda 6/6, fixed 0 YP, login hesaplı/hesapsız doğru; `05` §22). $25 Token Factory kredisi çalışıyor; Supabase Pro henüz yok (iOS benchmark bekliyor). Ölçüm setinde altıncı tur (`05` §23; son koşularda YP %0), B11 bulgu triyajı (`05` §24; Nemotron Ultra bulguları gözden geçiriyor) ve B11-2 test planı (`05` §25; kapsam kazancı küçük, bütçe 60 çağrı) bitti. Sıradaki iş `06` §7 "Hemen sıradaki": gerçek kullanıcı build'iyle uçtan uca deneme ve bakım/cron. Çalışma kuralları `06` §5'te; commit'lere hiçbir AI atfı ekleme, `pnpm check` geçmeden commit atma.
