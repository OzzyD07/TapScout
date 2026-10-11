# TapScout — Gerçek Uygulamalara Dayanıklılık Planı

Tarih: 11 Ekim 2026  
Durum: **Devam ediyor.** 11 Ekim akşamı A5 ilk tur, A1, A9 ve A4'ün ilk kısmı yapıldı (§7). Bu belge, `06` §7'deki "Hemen sıradaki" listesinin yerini alır.  
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

## 7. İlerleme (11 Ekim 2026, akşam)

Ayrıntı ve tablolar `05` §21'de.

- **A5 ilk tur yapıldı (Android).** 7 uygulamalık set (`scripts/benchmark/apps.json`, `quality/benchmark/`), `build-benchmark.yml`, `publish-benchmark.mjs`, `dev-run --app`. `evaluate-run`'a benchmark modu eklendi: ana ekranlar hierarchy işaretleriyle sayılır; erişim sonucu, durma yeri, kesinti ve yükleme sıklığı ve bölge eşlemeli elle hükümler raporlanır. **iOS:** Habo (Flutter debug, 65 MB) ve Ice Cubes (80 MB) küçültmeye rağmen Free plandaki 50 MB nesne sınırını aşıyor; iOS ölçümü Supabase Pro'yu bekliyor.
- **Ölçümün gösterdiği sıra:**
  1. En sık ve en ağır engel kesintiler ve açılış: 5 uygulamanın 3'ünde oturum ya hiç açılmadı ya da ilk adımlar boşa gitti.
  2. Sonra yanlış pozitifler: AntennaPod %73, Jitsi %29.
  3. Sonra durma ve erişim raporunun doğruluğu.

  Yükleme göstergesi (A2) yalnız Tusky'de, 52 gözlemin 3'ünde görüldü; durum sayıları (A3) makul (11–25). Bu yüzden A2 ve A3 sona kaldı.
- **A1 yapıldı:**
  - Android ve iOS izin diyalogları "Allow" ile geçilir.
  - Açılıştan sonraki 10 adımda uygulama içi diyalog, tanıtım ve onay ekranları planner'sız cevaplanır (`interruptions.ts`).
  - Appium uygulamayı kendisi başlatmaz ve activity beklemez (`autoLaunch: false`).
  - Android'de arkada çalışan uygulamanın ekranı da okunur; paylaşım sayfasından önce Geri ile çıkılır.
- **A4'ün ilk kısmı yapıldı:**
  - Etiketsiz kontrol içindeki metinle adlandırılır.
  - Kırpılmış ya da ekran kenarında kesilmiş kontroller ölçülmez.
  - Alt gezinme klavye örtmesi sayılmaz.
  - Bulgular ekran ve kontrol türü başına gruplanır.
  - Kırpılma doğrulamasında tam cümle kuralı var.
  - Oturum başına en çok 50 bulgu raporlanır.

  Kayıtlı kanıtla çevrimdışı tekrar: AntennaPod 44 → 1, Jitsi 35 → 4 bulgu; kalanlar doğru.
- **Agent sağlamlığı** (planda yoktu, ölçümden çıktı):
  - Dil seçeneklerine dokunulmaz (prompt v3).
  - Ulaşılamayan bir ekrana tur yapılmaz.
  - Hesap yokken şifre duvarını yalnız misafir yolu aşar.
  - Yalnız uygulamanın girişindeki duvar oturumu `access_blocked` yapar.
  - Flutter ekran başlıkları `content-desc`'ten alınır.
- **A9 yapıldı (ARM ölçümü hariç).** `.aab`, split APK ve `.ipa` için yüklemede açıklamalı ret (istemci + API) ve "How do I get these files?" bölümü. Arayüz tarayıcıda görsel olarak kontrol edilmedi. ARM çevirisini ölçmek için arm64-only Jitsi APK'sı sete eklendi.
- **FieldNotes gerilemesi:** seeded `4d53f5f4` iki platformda **6/6**, yanlış pozitif 0. iOS'taki ek kalıcılık bulgusu aynı tohumun ikinci alanı; değerlendirici bunu artık ayrı sayıyor.

**Sonraki oturumda yapılanlar (11 Ekim, gece):**
- **A5 ikinci ve üçüncü tur** koşuldu (`05` §21). Üçüncü turda 21 bulgudan 1'i yanlış pozitif (%4,8, düzeltildi): **kabul ölçütü (<%10) karşılandı.** Hiçbir oturum ilk ekranlarda takılmadı; Tusky "Sign-in required" doğru, iOS login geçiyor.
- **A2 yapıldı:** dönen yükleme göstergesi veya "Loading…" metni varken gözlem 1 sn aralıkla en çok 5 kez yenilenir; geçmezse not düşülür ve o durumda bir daha beklenmez. FieldNotes süre etkisi henüz ölçülmedi.
- **A3 ölçüldü, ertelendi:** kayıtlı oturumlarda durumların çoğu gerçekten farklı görünümler (profil sekmeleri vb.); şablon anahtarı AntennaPod'da 36 → 32, Jerboa'da 19 → 18 durum kazandırıyor.
- **B7 yapıldı:** ana gezinme girişleri (sekme, alt çubuk, app-bar ikon satırı) kapsam önceliğinin başında; her biri oturumda bir kez planner'sız açılır (en çok 8); planner adlarını görür.
- **B10 yapıldı:** Android çökme bulgusu (keşif ve stres) logcat crash tamponunu `log` kanıtı olarak taşır (test hesabı ve e-postalar maskeli); rapor "crash log" bağlantısı gösterir.
- **Diğer:** Flutter alanlarına odaktaki öğe üzerinden yazılır (Habo 2/8 → 6/8); kapsam turu ulaşılamayan ekranlarda pes etmez; test kullanıcı adının tam yazıldığı okunup gerekirse bir kez yeniden yazılır; emülatör oturum başında "offline" olursa bir kez yeniden bağlanılır.

**Kalan işler (sırayla):**
1. Dördüncü tur (B7 taraması + B10 ile; Jerboa, Habo, AntennaPod, Jitsi, FieldNotes seeded + fixed) değerlendirmesi ve `05` §21'e satır.
2. FieldNotes'ta A2 süre etkisinin ölçülmesi (<%10 hedef).
3. iOS benchmark (Supabase Pro sonrası).
4. B6 (alan türüne göre veri), B8 (dilden bağımsız anlam).

**Açık gözlemler:**
- Jerboa ana ekranlar 2/6: planner içerikte kalıyor (B7 taraması bunun için).
- FieldNotes seeded kapsama göre 5/6–6/6 arasında dalgalanıyor (Settings'e ya da profil düzenlemeye ulaşılmayan koşular dürüstçe `inconclusive`/kapsam dışı raporlanıyor).
- "Emin değilim" hükümleri (byline linkleri, Flutter semantik sınırları) jüri öncesi bir kez daha gözden geçirilmeli.
