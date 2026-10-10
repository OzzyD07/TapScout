# TapScout — Devam Notu (yeni oturum için)

Tarih: 10 Ekim 2026  
Amaç: Yeni bir çalışma oturumunun, önceki konuşmayı okumadan kaldığı yerden devam edebilmesi. Ayrıntılı tasarım `01`–`04`, plan ve ölçümler `05`'tedir. Bu not durum özeti ve çalışma kurallarıdır.

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

- **Şu an (11 Ekim):** F2 ve beş modun ilk kontrol paketi bitti. Beş modlu koşularda `fixed` build'de yanlış pozitif yok; `seeded` Android 6/6, iOS 4/6 (kalan ikisi iOS'un zaman bütçesinde ulaşılamayan ekranlar). Değerlendirme script'i `quality/evaluate-run.mjs`. Ayrıntı `05` §16.

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

**Testler:** 134 birim testi (shared 9, adapters 5, runner 59, web 61) ve veritabanı smoke testi. Runner testleri gerçek Android/iOS hierarchy fixture'larıyla (`packages/runner/test/fixtures`) ve sahte cihazla agent döngüsünü kapsar.

## 5. Çalışma kuralları (önemli)

- **Atıf yok:** Commit ve PR'lara Claude/Anthropic atfı (`Co-Authored-By`, "Generated with Claude Code") **eklenmez**. `CLAUDE.md` dosyaları repoya girmez. Proje sahibinin açık isteği.
- **Commit kontrolü:** Commit'ten önce `pnpm check` (lint + typecheck + test) **geçmeli**. Komut zincirini `set -e` ile kur; hata grep'le yutulmasın. Ayrıca `bash scripts/check-ground-truth.sh` ve workflow değişikliğinde actionlint çalıştır.
- **Push:** Proje sahibinin onayı var; başka onay gerekmiyorsa push edilebilir.
- **Migration'lar:** Supabase MCP `apply_migration` ile uygulanır. Ardından yerel dosya adı, `list_migrations`'ın verdiği sürümle değiştirilir; yerel ve uzak geçmiş aynı kalmalı.
- **GitHub API:** `.env`'deki `GITHUB_DISPATCH_TOKEN` ile çağrılır. Kimliksiz kota saatte 60 istek ve hemen bitiyor. Makinede `gh` CLI yok.
- **Vercel MCP:** Takım kapsamlı proje ayarlarını ve ortam değişkenlerini **göremiyor**. Deploy durumu `get_deployment("tap-scout-zeta.vercel.app")` ve curl ile izlenir. Ortam değişkenlerini proje sahibi elle ekler.
- **Sırlar:** `.env`'deki değerler hiçbir zaman ekrana veya sohbete yazdırılmaz.
- **Next.js 16:**
  - Kurulu belgeler `node_modules/next/dist/docs` altında.
  - `middleware` yerine `proxy.ts`.
  - Kimlik her zaman `getClaims()` ile doğrulanır.
- **Ortam:** Expo SDK 57 ve `nodeLinker: hoisted` kullanılıyor. Node ≥ 22.19 gerekli (WebdriverIO 10).
- **Yerel ortam:** Windows; iOS build'i yalnız CI'da alınabiliyor. Docker Desktop, yerel Supabase (`npx supabase db start`) için gerekli.

## 6. Proje sahibinde bekleyenler

- [ ] Supabase Pro'ya geçiş. Ardından `builds` bucket sınırı 300 MB'a çıkarılacak.
- [x] Siteye girip Start Test'i denemek (10 Ekim, run `cdf5265f`; Realtime ve rapor çalıştı).
- [ ] Token Factory kredisi: şu an $1 deneme kredisi var (yaklaşık 7–10 koşu). Gerçek agent koşuları için hackathon'un $25 kredisi en geç 16 Ekim'e kadar gerekli.
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

### Hemen sıradaki

- **iOS hızı ve kapsamı:** iOS'ta eylem başına ~21 sn (Android ~5 sn); 12 dk'lık QA penceresinde Settings ve stres testine sıra gelmiyor. Gözlem başına screenshot + source + iki yükleme + settle süreleri ölçülüp kısaltılmalı (ör. yüklemeleri arka plana almak, settle'ı kısaltmak).
- **Keşif önceliği:** Store/Accessibility seçiliyken etiketsiz ikon butonları ve ayar ekranları daha erken denenmeli (planner hint var, garanti yok).
- **Run sayfası:** yeni kontroller/bulgular (Store durumları dahil) gerçek tarayıcıda kontrol edilmedi.
- **Rapor özeti (Nemotron):** relay'de `report_summary` hazır; rapor job'una bağlanmadı.
- actionlint yerelde çalıştırılamadı (Docker kapalı).

### Açık borçlar

- **Bakım/cron:** `/api/internal/reconcile` + Supabase Cron. Şunları üstlenecek: bekleyen outbox dispatch'leri, heartbeat'i kesilen oturumlar, rapor yeniden denemesi, cevap vermeyen runner için GitHub workflow iptali.
- **iOS cihaz adı:** `deviceName` "unknown" geliyor; `simulator.json`'dan alınabilir.
- **Kullanıcı build yükleme arayüzü (P1):** İmzalı / resumable yükleme ve runner'da kabul doğrulaması.
- **Rapor:** Nemotron özeti (referans doğrulamalı) ve sayfada ayrıntılı bulgu kartları.
- **Kalite pilotu ve teslim (F3–F5):** `05` §6.
- **Agent ayrıntıları (`202c4d49`'dan):** Profil başlığı kullanıcı verisini içeriyor ("Hi, Alex Doe") ve parmak izine giriyor; ad değişince yeni durum sayılabilir. Görsel model hiç çağrılmadı (yalnız 3'ten az öğeli yeni ekranda çağrılıyor); UI/UX modunda kullanılacak. Rapor henüz agent sayaçlarını ve geçişleri özetlemiyor.

## 8. Yeni oturumu başlatma mesajı

> TapScout projesine devam ediyoruz (bu klasör). Önce `docs/06-devam-notu.md` ve `docs/05-v1-plan.md` §12–16'yı oku. `docs/01`–`04`'e yalnız gerektiğinde bak. F2 ve beş modun ilk kontrol paketi bitti; değerlendirme `quality/evaluate-run.mjs`. Sırada §7 "Hemen sıradaki": iOS hızı/kapsamı, rapor özeti. Çalışma kuralları notun §5'inde; özellikle commit'lere hiçbir AI atfı ekleme ve `pnpm check` geçmeden commit atma.
