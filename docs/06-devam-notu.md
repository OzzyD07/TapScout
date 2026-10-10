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

- **Şu an:** F1 (8–13 Ekim) büyük ölçüde bitti. Sıradaki faz **F2: agent çekirdeği ve Nemotron**.

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

Yerel `.env` (git'e girmez) şunları içerir: Supabase URL + publishable + secret key, `GITHUB_DISPATCH_TOKEN` (fine-grained, 7 Ocak 2027'ye kadar), `TOKEN_FACTORY_API_KEY` (geçerli; şu an yalnız **$1 deneme kredisi**), `RUNNER_TOKEN_SIGNING_KEY`, `APP_BASE_URL`. Vercel'e eklenen değişkenler: Supabase anahtarları, runner imzalama anahtarı, OIDC audience, GitHub değişkenleri. **Henüz eklenmeyenler:** `TOKEN_FACTORY_*`, `NEMOTRON_MODEL_ID`, `VISION_MODEL_ID` (model relay yazılınca eklenecek).

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

**Henüz doğrulanmayanlar:**
- Web'deki Start Test butonu ve run sayfası gerçek tarayıcıda denenmedi; proje sahibi deneyecek.
- Vercel'deki GitHub değişkenleri doğrulanmadı. Eksikse koşu `queued`'da kalır, çünkü bakım/cron görevi yok.

**Testler:** 60 birim testi (shared 9, adapters 5, runner 5, web 41) ve veritabanı smoke testi. CI son commit'te yeşil.

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
- [ ] Siteye `tester@tapscout.com` ile girip Start Test'i denemek. Sorun veya tasarım yorumlarını iletmek.
- [ ] Token Factory kredisi: şu an $1 deneme kredisi var (yaklaşık 7–10 koşu). Gerçek agent koşuları için hackathon'un $25 kredisi en geç 16 Ekim'e kadar gerekli.
- [ ] Model relay hazır olunca Vercel'e şunları eklemek: `TOKEN_FACTORY_API_KEY`, `TOKEN_FACTORY_BASE_URL`, `NEMOTRON_MODEL_ID`, `VISION_MODEL_ID`.

## 7. Sıradaki işler (F2 ve açık borçlar)

### F2 (13–19 Ekim)

1. **Model relay:** `/api/relay/plan` ve `/api/relay/vision`.
   - Runner token'ıyla çağrılır; çağrıdan önce bütçe ayrılır, sonra gerçek kullanıma göre kesinleşir (`reserve_model_budget` / `settle_model_budget`).
   - `usage_records` tablosuna yazılır.
   - Planner için `enable_thinking=false` + `json_schema`.
   - Görsel istek yalnız yetkili artifact kimliğiyle yapılır, keyfi URL alınmaz.
2. **Observer:** Hierarchy XML'i `Observation`'a normalize etmek (öğe referansı, rol, label, bounds); secret maskeleme.
3. **State graph ve agent döngüsü:** Ekran parmak izi, ziyaret ve döngü tespiti, Observe → Plan (Nemotron) → Validate → Act → Evaluate.
   - Bütçe kuralları `03` §9'da.
   - `packages/runner/src/main.ts`'teki sabit "Get started" adımı bu döngüyle değiştirilecek.
4. **Functional modu:** Akış hedefleri ve kalıcılık kontrolü (kaydet → yeniden aç).
5. **Örnek uygulama v1:**
   - Not listesi; ayarlar (privacy policy linki, hesap silme).
   - `seeded` / `fixed` / `changed_flow` varyantları; kasıtlı hatalar `05` §8'de.
   - Ground-truth manifest'i yalnız `quality/` altında.
6. **G3 (16 Ekim):** Planner'ın en az 3 ekranı keşfetmesi ve geçersiz eylem uygulamaması.

### Açık borçlar

- **Bakım/cron:** `/api/internal/reconcile` + Supabase Cron. Şunları üstlenecek: bekleyen outbox dispatch'leri, heartbeat'i kesilen oturumlar, rapor yeniden denemesi, cevap vermeyen runner için GitHub workflow iptali.
- **iOS cihaz adı:** `deviceName` "unknown" geliyor; `simulator.json`'dan alınabilir.
- **Kullanıcı build yükleme arayüzü (P1):** İmzalı / resumable yükleme ve runner'da kabul doğrulaması.
- **Rapor:** Nemotron özeti (referans doğrulamalı) ve sayfada ayrıntılı bulgu kartları.
- **Kalite pilotu ve teslim (F3–F5):** `05` §6.

## 8. Yeni oturumu başlatma mesajı

> TapScout projesine devam ediyoruz (bu klasör). Önce `docs/06-devam-notu.md` ve `docs/05-v1-plan.md` §12–13'ü oku. `docs/01`–`04`'e yalnız gerektiğinde bak. F1 bitti; F2'ye başla: önce model relay (`/api/relay/plan` ve `/api/relay/vision`), sonra observer ve agent döngüsünü runner'a bağla. Çalışma kuralları notun §5'inde; özellikle commit'lere hiçbir AI atfı ekleme ve `pnpm check` geçmeden commit atma.
