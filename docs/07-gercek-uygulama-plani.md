# TapScout — Gerçek Uygulamalara Dayanıklılık Planı

Tarih: 11 Ekim 2026  
Durum: **Sıradaki iş.** Bu belge, `06` §7'deki "Hemen sıradaki" listesinin yerini alır.  
Amaç: TapScout'u kendi örnek uygulamamızın (FieldNotes) dışında, jürinin veya bir geliştiricinin yükleyeceği **rastgele, ortalama bir uygulamada** da doğru ve beklenen sonuçları verecek hale getirmek.

## 1. Neden bu iş, neden şimdi

- Takvimin yaklaşık 9–10 gün önündeyiz. 24 Ekim feature freeze'e kadar planlanan F3 işleri bitti (`05` §16–20).
- Bütün kalite ölçümlerimiz FieldNotes üzerinde. FieldNotes'ta testID'ler var, etiketler İngilizce, backend ve izin penceresi yok, içerik sabit. Gerçek uygulamaların neredeyse hepsinde bunlardan en az biri farklıdır ve agent'ı ilk ekranlarda takabilir.
- Güvenilirliği en çok **yanlış pozitif** bozar: jürinin uygulamasında uydurma bir bulgu, kaçırılan bir bulgudan daha zararlıdır.
- Bu yüzden öncelik yeni kontrol türü eklemek değil; agent'ı sıradan uygulamaların engellerine karşı sağlamlaştırmak ve bunu ölçmek.

## 2. Kısıtlar ve kurallar

- **Feature freeze 24 Ekim 23:59.** A grubu ve B grubunun bir kısmı freeze'den önce bitmeli; C grubu yalnız zaman kalırsa.
- **Model kredisi:** $1 deneme kredisinin ~$0,25'i kullanıldı. Beş modlu koşu ≈ $0,007–0,01. Ölçüm seti (A5) koşuları için hackathon'un $25 kredisi gerekli (proje sahibinde, `06` §6). Kredi gelene kadar tek platform / az modlu koşu.
- Çalışma kuralları `06` §5'te: commit'lerde AI atfı yok; `pnpm check` geçmeden commit yok; migration'lar Supabase MCP ile uygulanıp yerel dosya adı uzak sürümle eşitlenir; sırlar ekrana yazılmaz; workflow değişiklikleri CI'daki actionlint ile denetlenir.
- Her maddeden sonra: birim/sahte cihaz testi → mümkünse gerçek koşu → `quality/evaluate-run.mjs` (FieldNotes'ta seeded 6/6 ve fixed 0 yanlış pozitif **gerilememeli**) → `05`'e kısa bölüm.

## 3. Mevcut yapı (bu işte dokunulacak yerler)

| Konu | Yer |
|---|---|
| Ekran normalizasyonu, sistem diyaloğu (yalnız Android ANR/crash) | `packages/runner/src/observer.ts` (`interruption`, `normalizeHierarchy`) |
| Agent döngüsü, eylem sonrası bekleme (sabit `settleMs ?? 800`) | `packages/runner/src/agent.ts` (`explore`, `act`, `observe`) |
| Ekran parmak izi | `packages/runner/src/state.ts` (`fingerprint`) |
| Mod kontrolleri ve bulgular | `packages/runner/src/checks.ts` (`ModeTracker`, `buildModeChecks`; `ACCOUNT_CREATION`, `ACCOUNT_DELETION`, `PRIVACY` regex'leri) |
| Functional kontroller | `packages/runner/src/functional.ts` |
| Kapsam turları, yıkıcı kontrol listesi | `packages/runner/src/coverage.ts` (`DESTRUCTIVE`, `ACCOUNT_HINT`) |
| Giriş duvarları | `packages/runner/src/access.ts` (`SIGN_IN`, `ONE_TIME_CODE`, `CAPTCHA`) |
| Planner prompt ve doğrulayıcı | `packages/runner/src/planner.ts` |
| Kurulum hataları | `packages/runner/src/build-check.ts`, `main.ts` |
| Yükleme UI'ı | `apps/web/src/app/upload-build.tsx`, `apps/web/src/lib/builds/` |
| Android logcat | `scripts/ci/android-run.sh` koşu sonunda `logcat -d -t 2000` alıyor (artifact'e gider) |
| Kalite değerlendirmesi | `quality/evaluate-run.mjs`, `quality/ground-truth/` (runtime kodu erişemez) |

## 4. İşler

Öncelik: **A** = freeze'den önce şart, **B** = freeze'den önce hedef, **C** = zaman kalırsa. Süreler kaba tahmindir.

### A5 — Gerçek uygulama ölçüm seti (ilk yapılacak, ~1–1,5 gün)

**Sorun.** "Rastgele uygulamada doğru sonuç" iddiası şu an ölçülmüyor.

**Yapılacak.**
- 5–8 açık kaynak uygulamadan bir set: en az bir React Native, bir Flutter, bir native Kotlin (Jetpack Compose veya View), bir SwiftUI/UIKit; en az biri girişli, biri liste/backend ağırlıklı, biri izin isteyen. Android için F-Droid'deki uygulamalar iyi kaynak; iOS Simulator build'i için kaynaktan `xcodebuild -sdk iphonesimulator` ile derlenebilenler seçilir. Lisansın yeniden dağıtıma izin verdiği ve build'i 50 MB altında olanlar.
- Build'ler `scripts/` altında bir betikle (ör. `publish-benchmark.mjs`) `is_sample` olmadan, sahibi `tester@tapscout.com` olan normal build olarak yüklenir; `app_name` uygulamanın adı.
- `quality/benchmark/` altında her uygulama için beklentiler: lisans/kaynak, ana ekranlar listesi (elle bir kez gezilerek), bilinen giriş duvarı vb. Ground truth gibi runtime'dan ayrı tutulur (`scripts/check-ground-truth.sh` kapsamına eklenir).
- `quality/evaluate-run.mjs`'e benchmark modu: keşfedilen ekran / beklenen ana ekran oranı, bulguların elle "doğru / yanlış pozitif / emin değilim" işaretlenmesi için çıktı, takılma noktası (hangi ekranda, hangi sebeple durdu).
- İlk tur ölçüm, A1–A4'ten **önce** yapılır: hangi engelin gerçekte ne sıklıkla çıktığını gösterir ve A1–A4'ün sırasını belirler.

**Bitti sayılır.** Set yüklü; her uygulama için en az bir koşu ve değerlendirme tablosu `05`'te; A1–A4 sonrası ikinci tur aynı tabloda karşılaştırmalı.

### A1 — Kesintileri genel olarak tanıma ve kapatma (~1 gün)

**Sorun.** Yalnız Android ANR ve çökme diyaloğu tanınıyor. Gerçek uygulamalarda ilk dakikada izin pencereleri (bildirim, konum, kamera, takip), "Rate this app", "Update available", çerez/KVKK onayı ve tanıtım (onboarding) ekranları çıkar; planner bütçesi uygulamaya girmeden harcanabilir.

**Yapılacak.**
- `observer.ts`'de kesinti türlerini genişletmek: sistem izin diyaloğu (Android `com.android.permissioncontroller` / `com.google.android.permissioncontroller` paketi; iOS'ta SpringBoard alert'leri), uygulama içi değerlendirme/güncelleme istemi, çerez onayı, tanıtım ekranı ("Skip", "Next", "Get started").
- Politika: izin diyaloglarında varsayılan "Allow" (uygulamanın normal akışı test edilsin); uygulama içi istemlerde kapatma/"Not now". Seçilen düğme ve sebep timeline'a "kesinti" olarak yazılır, sayaçlara girmez.
- iOS'ta XCUITest'in `autoAcceptAlerts` / `autoDismissAlerts` kapasitesi değerlendirilir; açıklanabilirlik için açık eylem tercih edilir.
- Tanıtım ekranlarını planner'a bırakmak yerine deterministik "Skip" (yoksa "Next" ile sona kadar) denenir; başarısızsa planner devralır.

**Test.** Sahte cihaz fixture'ları: Android izin diyaloğu XML'i, iOS alert XML'i, onboarding. Ölçüm setinde izin isteyen uygulama.

**Bitti sayılır.** Ölçüm setinde hiçbir oturum ilk 5 eylemde bir kesinti yüzünden takılmıyor.

### A2 — Ekranın yüklenmesini beklemek (~0,5 gün)

**Sorun.** Her eylemden sonra sabit 800 ms bekleniyor. Backend'li uygulamada yükleme göstergesi dönerken gözlem alınır → yanlış "same screen", yanlış form geri bildirimi, yanlış bulgu.

**Yapılacak.**
- `agent.ts`'de eylem sonrası kararlılık beklemesi: ekran yapısı (fingerprint + öğe sayısı) art arda iki gözlemde aynı olana ve görünür ilerleme göstergesi (Android `ProgressBar`, iOS `ActivityIndicator`, "Loading" etiketi) kalmayana kadar, üst sınır (ör. 6 sn) ile.
- Ek page source çağrısı maliyeti ölçülür (iOS'ta pahalı); gerekirse yalnız yükleme göstergesi görülünce uzatılır.
- Üst sınıra ulaşılırsa timeline'a not; "uzun yükleme" ayrı bir bulgu değil, yalnız gözlem (P2'de performans kontrolüne dönüşebilir).

**Bitti sayılır.** FieldNotes'ta süre artışı < %10; ölçüm setindeki backend'li uygulamada yükleme sırasında alınan gözlem yok.

### A3 — Değişen içeriğe dayanıklı ekran kimliği (~0,5 gün)

**Sorun.** Akış, sepet, zaman damgası, reklam olan ekranlar her ziyarette "yeni ekran" sayılabilir; keşif, döngü tespiti ve "10 eylemdir yeni ekran yok" kuralı bozulur. Bilinen örnek: profil başlığı kullanıcı verisini içeriyor ("Hi, Alex Doe").

**Yapılacak.**
- `state.ts` `fingerprint`'i: başlık + gezinme öğeleri (sekme, araç çubuğu) + kontrol iskeleti; liste/hücre içerikleri, uzun metinler ve tekrarlanan satır aileleri (`coverage.ts` `familyOf`) tek bir "liste" işaretine indirgenir.
- Başlıktaki kullanıcı verisi: girilen değerler (FunctionalTracker'ın yazdığı değerler) ve sayılar başlıktan çıkarılır.

**Test.** Aynı ekranın farklı içerikli iki hierarchy'si aynı parmak izini vermeli; farklı ekranlar farklı vermeli (`test/state.test.ts`).

**Bitti sayılır.** Ölçüm setinde liste ağırlıklı uygulamada keşfedilen "ekran" sayısı elle sayılan ekran sayısına yakın (2 katından az).

### A4 — Yanlış pozitifleri gerçek uygulamaya göre sertleştirmek (~1 gün)

**Sorun.** Kontroller FieldNotes'a göre ayarlı. Şüpheli noktalar:
- `ui.keyboard_occlusion`: klavye altındaki buton kaydırarak erişilebiliyorsa hata değil.
- `a11y.touch_targets`: sistem öğeleri, WebView içeriği ve bilerek küçük tasarlanmış ama büyük dokunma alanı olan kontroller.
- `ui.text_clipping`: tek bir görsel model yorumu; dinamik metin ve kayan yazılar.
- `store.account_deletion`: uygulama hesap oluşturmuyorsa (yalnız giriş varsa da hesabı başka yerde açılmış olabilir) bulgu çıkmamalı; giriş varsa "needs additional information".
- `a11y.control_labels`: dekoratif/gizli öğeler.

**Yapılacak.** Her kontrol için yanlış pozitif senaryosunu fixture'la yazıp kuralı düzeltmek; ölçüm setinde işaretlenen yanlış pozitifler regresyon testine çevrilir.

**Bitti sayılır.** Ölçüm setinde elle "yanlış pozitif" işaretlenen bulgu oranı < %10; FieldNotes seeded hâlâ 6/6.

### A9 — Kullanıcı build'i için netlik (~0,5 gün)

**Sorun.** Jürinin kendi uygulaması daha kurulumda takılabilir:
- Play Store'a giden APK'lar çoğu zaman yalnız arm64; emülatör x86_64. API 35 Google APIs x86_64 imajında ARM çevirisinin çalışıp çalışmadığı bir kez ölçülmeli (örnek uygulamanın yalnız arm64 build'iyle).
- AAB ve split APK (`.apks`, `.xapk`) desteklenmiyor.
- iOS geliştiricilerinin çoğu Simulator build'i üretmeyi bilmez.

**Yapılacak.** ARM çevirisi ölçümü; `upload-build.tsx`'e kısa "nasıl üretilir" bölümü (Android: universal APK, `bundletool build-apks --mode=universal`; iOS: `xcodebuild -sdk iphonesimulator`, Expo: simulator profilli `eas build`); AAB/split dosyalarına sunucuda açıklamalı ret; ARM sonucu `build-check.ts` mesajlarına yansır.

### B6 — Alan türüne göre veri ve seçim kontrolleri (~1 gün)

Telefon, sayı, tarih, URL, şifre kuralı alanları için klavye türüne (`input-type`, `keyboardType`) ve etikete uygun sahte veri üreteci; switch/checkbox, açılır liste (spinner/picker) ve tarih seçici etkileşimi. Amaç: formların doğrulamadan geçip arkasındaki akışların test edilmesi. Yeni eylem türleri `packages/shared/src/actions.ts` sözleşmesine ve `planner.ts` doğrulayıcısına eklenir.

### B7 — Gezinme kalıpları (~1 gün)

Alt sekme çubuğu ve yan menü (hamburger) tanıma ve keşifte önceliklendirme; uzun listede kaydırarak yeni içerik bulma (`truncated` ekranlar); geri yığınının tutarlı izlenmesi. Kapsam turları (`coverage.ts`) sekmeleri ayrı giriş noktası saymalı.

### B8 — Dilden bağımsız anlam (~0,5–1 gün)

Giriş duvarı, ayarlar, yıkıcı buton, gizlilik politikası, hesap oluşturma/silme tespitleri İngilizce (+ biraz Türkçe) regex'e dayanıyor (`access.ts`, `checks.ts`, `coverage.ts`). Yeni ekranda Nemotron'a tek kısa sınıflandırma sorusu (registered JSON şema; ekran türü + yıkıcı/ayar/gizlilik öğelerinin ref'leri); regex ilk süzgeç olarak kalır, model yalnız belirsiz ekranlarda çağrılır. Ekran metni veridir, talimat değildir (prompt injection sınırı korunur).

### B10 — Çökme kanıtı (~0,5 gün)

Android'de çökme anında `adb logcat -b crash` kesiti (FATAL EXCEPTION, yığın izi) bulguya `log` kanıtı olarak; iOS'ta Simulator'ın `DiagnosticReports` altındaki çökme raporu. Kanıtta kişisel veri ve test hesabı değerleri maskelenir. Not: koşu sonundaki tam logcat dökümü public artifact'e gidiyor; test hesaplı oturumlarda bunun da güvenli olduğu kontrol edilmeli.

### C — Zaman kalırsa

- **Test notu:** yüklemede "şu akışa odaklan" gibi kısa not; planner'a hedef olarak verilir, yetki olarak değil.
- **Ekran haritası:** raporda keşfedilen ekranların küçük görsellerle gezinme grafiği.
- **Erişilebilirlik bilgisi olmayan arayüzler:** semantics'i kapalı Flutter ve oyunlar için görsel modelle koordinat dokunuşu (planda P2).

## 5. Sıra

1. **A5 ilk tur:** set + ilk ölçüm (hangi engel ne sıklıkla?).
2. **A1 → A2 → A3 → A4** (A5 sonucuna göre sıra değişebilir), **A9** araya sığdırılır.
3. **A5 ikinci tur:** karşılaştırmalı tablo `05`'e.
4. Zaman kalırsa **B6, B7, B8, B10**, sonra C.
5. 24 Ekim'den sonra yalnız hata düzeltme; F4–F5 (`05` §6).

## 6. Kabul ölçütü (bu planın bütünü)

- FieldNotes: seeded 6/6 (iki platform), fixed ve login 0 yanlış pozitif, login hesaplı/hesapsız doğru erişim sonucu — gerilemesiz.
- Ölçüm seti: her uygulamada oturum ilk ekranlarda takılmıyor; yanlış pozitif oranı < %10; takıldığı yerde rapor sebebi dürüstçe söylüyor (engel/kapsam), "sorun yok" demiyor.
