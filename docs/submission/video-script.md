# TapScout — demo videosu kurgu planı (çıktı 2:50, sınır < 3:00)

Konuşma ve ekran yazıları İngilizce (teslim dili). Açıklamalar Türkçe.

**Zamanlamanın kaynağı:** kayıt koşusu `0bdbf2e0` (29 Ekim, demo hesabı). Start Test'e basıldığı an
**00:00** kabul edildi; aşağıdaki "kaynak" süreleri bu koşudaki gerçek olay zamanlarıdır (veritabanı
kayıtlarından). Kaydın birkaç saniye kaymış olabilir: her kesmeyi **olayın adıyla** bul (tabloda
yazıyor), saatle değil. İlk plan vitrin koşusu `67f6637c`'nin sürelerine göreydi.

| Kaynak | Olay (zaman çizelgesindeki metin) |
|---|---|
| 00:00 | Start test |
| 02:14 | Android: "Runner started on GitHub-hosted android runner" |
| 02:49 | Android: "Interruption: in-app onboarding … tap "Get started"" |
| 02:53–03:27 | Android: Get started, Name, Email yazılır, Continue |
| 03:43 | Android: "Test plan (nvidia/Nemotron-3-Ultra-550b-a55b) …" notu |
| 03:45–04:03 | Android: Edit profile → About you yazılır → Save → Relaunch app |
| 04:03 | Android: bulgu adayı "Saved About you is lost after the app restarts" |
| 04:03–04:33 | Android: iki tekrar (Replay); 04:33'te "Reproduced 2/2" |
| 06:06–06:21 | Android: Add note → uzun başlık yazılır → Save → "Now on Outside the app" (çökme) |
| 06:38 | Android: "System dialog "FieldNotes keeps stopping" … tapped "Close app"" |
| 05:15 | iOS: runner başlar |
| 07:23 | iOS: onboarding geçilir |
| 08:26 | iOS: test planı notu |
| 08:56 | iOS: bulgu adayı "Saved About you is lost after the app restarts" |
| 10:42 | Android oturumu biter (kontroller ve bulgular yazılır) |
| 21:03 | iOS oturumu biter (planlayıcı bütçesi doldu; kontroller yazılır) |
| 21:51 | Rapor hazır |

**Sonuç:** Android 6/6, iOS 5/6, iki platformda 0 yanlış alarm. iOS ayarlar ekranına ulaşamadı;
"hesap silme yok" kontrolü bu yüzden karar vermedi ve raporda bunu açıkça yazıyor ("no settings or
account screen was reached").

**Karar:** Canlı kısım (Kayıt A) bu koşudan, rapor turu (Kayıt B) paylaşılan vitrin koşusu
`67f6637c`'den (iki platformda 6/6, 0 yanlış alarm). Konuşma ve ekran yazısı 2:12–2:29 o raporu
anlatır. Rapor sayfasının başlığında koşu kimliği `67f6637c` ve "Previously completed sample run"
rozeti görünür: Kayıt B'yi başlıktan aşağı kaydırılmış olarak başlat ya da başlığı kırp.

---

## 1. Kayıt (iki ayrı ekran kaydı)

**Genel ayarlar:**
- OBS Studio, 1920×1080, 30 fps.
- Tarayıcı tam ekran (F11), yakınlaştırma %110; başka sekme yok.
- Jüri hesabıyla önceden giriş yap; **giriş ekranı kaydedilmez**.
- Fareyi yavaş hareket ettir: hızlandırılan yerlerde hızlı fare titrek görünür.

### Kayıt A — form ve canlı koşu (kesintisiz ~26 dk)

| Kaynak zamanı | Ne yapacaksın |
|---|---|
| −0:40 → 00:00 | Kaydı **ana sayfada** başlat. "New test" bölümünde Android ve iOS satırlarındaki seçim kutularına yavaşça imleçle git (seçili gelen "FieldNotes — sample: seeded" kalsın). Beş modun hepsini tek tek işaretle. İmleci 2 sn "Start test" üstünde beklet, bas. |
| 00:00 → 02:20 | Koşu sayfası açılır. Hiçbir şeye dokunma (bu kısım kesilecek). |
| 02:20 | Session sekmesinde **Android** seçili olsun. Zaman çizelgesi filtresi **All**. |
| 02:20 → 07:10 | Android'de kal. Ekran görüntüsü kendiliğinden yenilenir. 04:04'te gelen bulgu satırına **tıklama**; sadece imleçle üstünde dur. |
| ~10:40 → 12:20 | **iOS** sekmesine geç (iOS onboarding ve test planı burada). |
| 12:20 → 24:53 | Android'e dön; dokunmadan bekle (bu kısım kesilecek). |
| 24:53 | Rapor gelince kaydı durdur. |

### Kayıt B — rapor turu (ayrı kayıt, ~1,5 dk, normal hız)

Koşu: paylaşılan vitrin koşusu `67f6637c` (ana sayfada "Sample run"). Rapor bölümünde şu sırayla, her durakta yazan süre kadar bekle:

1. Rapor özeti paragrafı (6 sn).
2. Bulgu filtresinde **"Evidence found"** seç. "Saved About you is lost after the app restarts" kartını aç: **Expected / Observed**, **Symptom screenshot**, "Reproduced 2/2" etiketi ve tekrar adımları (12 sn).
3. "App closes after saving long text in Title" kartı (6 sn).
4. "Text appears cut off on "Notes"" kartı ve altındaki **Nemotron Ultra triage gerekçesi** (8 sn).
5. **Checks** tablosu: geçen/kalan satırlar (6 sn).
6. **"What each platform session covered"** ve **"What limited this run"** / **Limitations** (6 sn).
7. **Screen map** (6 sn).


---

## 2. Kurgu listesi (saniye saniye)

**Yapılan edit (29 Ekim, v2):** `Desktop/video/TapScout-demo-edit-v2.mp4`, 2:50, 1080p 30 fps, sessiz
ses kanalı (konuşma ve altyazı sonra eklenecek). Bölüm sınırları ve konuşma blokları aşağıdaki
tabloyla aynı; uygulamada değişenler:
- Kayıt A, Start'tan yalnız ~10 sn önce başlıyor (dosya zamanı = kaynak + 10 sn). 0:08–0:17 formun
  gerçek görüntüsü, 0:17–0:32 bitmiş forma yavaş yakınlaşma.
- Dondurulan karelerden önceki klip tam o karede biter. Yakınlaşma yumuşak girer, bekler ve kesmeden
  önce geri açılır.
- Sahne değişen her kesmede 0,3–0,6 sn çapraz geçiş var. Geçiş süresi önceki bölümü uzatarak
  karşılanıyor, kesme zamanları kaymıyor. Kartlar artık siyaha inmiyor; yalnız başta ve sonda kararma
  var.
- Kesmeler ve hızlar: önyükleme 2:43 kes; Android ×7; About you ×1,5; tekrarlar ×4,4; çökme +1:44 ve
  ×5; iOS +3:56 ve ×2 (dosya 655 sn'den: sekme geçişinden sonraki ilk temiz kare).
- Raporun ekran haritasındaki "Outside the app" küçük resmi bulanık: Chrome logosu (üçüncü taraf
  markası) görünmesin diye. 2:25–2:29 harita, iOS haritasına geçişi göstermemek için durağan kare.

Hız: **×1** gerçek zaman; **×N** N kat hızlı; **Kes** = kaynak atlanır.

Her hızlandırılmış klipte sağ üstte sabit bir rozet durur: `×6`, `×4`… Kesmelerde kart girer.
Konuşma süreleri ~2,5 kelime/sn ile hesaplandı.

| Çıktı | Süre | Kaynak | Hız | Ekranda | Ekran yazısı |
|---|---|---|---|---|---|
| **0:00–0:08** | 8 sn | A: koşu sayfası (07:10 civarı, iki sekme dolu) | ×1, %30 bulanık + hafif zoom | Arka planda canlı koşu sayfası | Ortada büyük: `TapScout` · altında: `Autonomous QA for Android and iOS apps` |
| **0:08–0:22** | 14 sn | A: −0:40 → −0:26 | ×1 | Ana sayfa, "New test": Android/iOS build seçimleri, imleç gezinir | Alt yazı bandı: `Upload an APK or an iOS Simulator build` |
| **0:22–0:32** | 10 sn | A: −0:26 → −0:06 | ×2 | Beş mod tek tek işaretlenir | `Functional · Stress · UI/UX · Accessibility · Store readiness` · rozet `×2` |
| **0:32–0:44** | 12 sn | Grafik (aşağıda "Mimari kartı") | — | Mimari şeması, okları sırayla belirir | Kartın kendisi |
| **0:44–0:48** | 4 sn | A: −0:06 → 00:00 | ×1,5 | İmleç "Start test"te, tıklama | — |
| **0:48–0:54** | 6 sn | A: 00:00 → 00:06 | ×1 | Koşu sayfası açılır: "Running for", Session sekmeleri | `Run started` |
| **0:54–0:57** | 3 sn | A: 00:06 → 02:49 | **Kes** | Kart | `Two fresh devices boot on GitHub runners — 2:43 skipped` |
| **0:57–1:05** | 8 sn | A: 02:49 → 03:43 | ×7 | Android: onboarding geçilir, Name/Email yazılır, Continue | rozet `×7` |
| **1:05–1:09** | 4 sn | A: 03:43 | Dondur | Test planı notuna yakınlaş (zoom ×1,6) | `Test plan written by Nemotron 3 Ultra` |
| **1:09–1:21** | 12 sn | A: 03:45 → 04:03 | ×1,5 | Edit profile → About you yazılır → Save → Relaunch app; ekran görüntüsünde alan boş | rozet `×1.5` · 1:18'de: `Saved text is gone after restart` |
| **1:21–1:28** | 7 sn | A: 04:03 → 04:33 | ×4 | Bulgu adayı satırı, ardından iki Replay döngüsü | rozet `×4` · `Replaying the steps…` |
| **1:28–1:31** | 3 sn | A: 04:33 | Dondur | "Reproduced 2/2" satırına yakınlaş | `Reproduced 2/2` (büyük, yeşil) |
| **1:31–1:37** | 6 sn | A: 06:06 → 06:38 (04:33 → 06:06 **kes**) | ×5 | Add note → uzun başlık → Save → "Outside the app" → kapanma diyaloğu | rozet `×5` · ilk 1 sn köşede: `+1:33` |
| **1:37–1:40** | 3 sn | A: 06:38 | Dondur | "FieldNotes keeps stopping" notuna yakınlaş | `Crash found` |
| **1:40–1:47** | 7 sn | A: iOS sekmesine geçtiğin an → +14 sn (öncesi **kes**) | ×2 | iOS sekmesi: listede iOS test planı notu (08:26) ve "Saved About you is lost" satırı (08:56) görünür; imleçle ikisini göster | rozet `×2` · ilk 1 sn köşede atlanan süre · `iOS Simulator, in parallel` |
| **1:47–1:50** | 3 sn | A: iOS klibinin sonu → 21:51 | **Kes** | Kart | `Both sessions finish — 22 min in total` |
| **1:50–1:56** | 6 sn | B: durak 1 | ×1 | Rapor özeti | — |
| **1:56–2:08** | 12 sn | B: durak 2 | ×1 | About you bulgusu: Expected/Observed, ekran görüntüsü, Reproduced 2/2, adımlar | — |
| **2:08–2:12** | 4 sn | B: durak 3 | ×1,5 | Çökme bulgusu | — |
| **2:12–2:19** | 7 sn | B: durak 4 | ×1 | Kırpılmış metin bulgusu + Ultra triage gerekçesi | `Reviewed by Nemotron 3 Ultra` |
| **2:19–2:25** | 6 sn | B: durak 5–6 | ×2 | Checks tablosu → "What limited this run" | rozet `×2` |
| **2:25–2:29** | 4 sn | B: durak 7 | ×1,5 | Screen map | `6 of 6 planted bugs · Android & iOS · 0 false alarms` |
| **2:29–2:42** | 13 sn | Grafik ("Sonuçlar kartı") | — | Benchmark tablosu | Kartın kendisi |
| **2:42–2:50** | 8 sn | Grafik ("Kapanış kartı") | — | — | Kartın kendisi |

**Kesilen gerçek süre:** 2:43 (cihaz açılışı) + 1:33 + Android'den iOS'a geçiş + oturumların bitişi
≈ 18 dk (koşu toplam 21:51).
Kalan ~4 dk gerçek süre, hızlandırmayla videonun ~1 dakikasına iner. Kesilen her yer ekranda
yazılı.

---

## 3. Konuşma metni (zamana bağlı)

Her blok, yanındaki aralıkta biter. TTS'te her bloğu **ayrı dosya** üret. Blok sürelerinden
kısa çıkarsa sonuna sessizlik ekle; uzun çıkarsa TTS hızını %5–10 artır.

| Çıktı | Kelime | Narration |
|---|---|---|
| 0:00–0:08 | 19 | Mobile apps ship with bugs anyone finds in five minutes of tapping. Catching them automatically still takes test scripts. |
| 0:08–0:32 | 41 | This is TapScout, an autonomous QA agent for Android and iOS apps. You upload an APK or an iOS Simulator build, pick what to check — user flows, stress, UI, accessibility and store rules — and press Start. No scripts, no recorded flows. |
| 0:32–0:44 | 28 | Behind it, NVIDIA Nemotron models on Nebius Token Factory drive a real Android emulator and an iOS Simulator, in parallel, on GitHub runners. Every finding comes with proof. |
| 0:44–0:57 | 25 | Let's test our sample app. It has six bugs planted in it. Each platform gets a fresh device, so the run starts by booting them. |
| 0:57–1:09 | 28 | The agent gets past onboarding and fills in the profile form. Once it has seen the first screens, Nemotron Ultra writes a test plan for this specific app. |
| 1:09–1:31 | 43 | From then on, Nemotron Lightning picks every next action and writes down why. Here it edits the profile, saves, and restarts the app. The text is gone. TapScout doesn't stop at a guess: it replays the steps twice. Reproduced, two out of two. |
| 1:31–1:40 | 20 | Two minutes later it saves a note with a very long title, and the app crashes. That is replayed too. |
| 1:40–1:50 | 19 | Meanwhile, the same app runs on the iOS Simulator in parallel and finds the same bug on its own. |
| 1:50–2:12 | 40 | When both sessions finish, one report covers both platforms. Every finding shows what was expected, what happened, the screenshot, and the steps that led to it. Nothing is a bare claim: each one points to the screen that proves it. |
| 2:12–2:29 | 35 | Nemotron Ultra reviews each finding and explains its verdict. The report also says what limited the run and what it did not test. Here: all six planted bugs, on both platforms, and no false alarms. |
| 2:29–2:42 | 32 | On six real open-source apps across five UI frameworks, it reaches most main screens in one session, and it found a real crash. A session costs under two cents in model calls. |
| 2:42–2:50 | 10 | TapScout. Hand it a build, get back bugs with proof. |

Toplam 340 kelime (~2,1 kelime/sn; rahat bir anlatım hızı).

---

## 4. Grafik kartlar (editörde hazırlanacak, logo yok)

**Genel stil:** koyu arka plan, uygulamanın arayüz fontu, tek vurgu rengi. Hiçbir şirketin
logosu yok; NVIDIA ve Nebius yalnız metin olarak geçer.

**Mimari kartı (0:32–0:44).** Okların sırayla belirmesi:

```
[ Browser ]  →  [ Next.js on Vercel ]  →  [ Nebius Token Factory ]
                       │                     Nemotron 3.5 Lightning — every step
                       │                     Nemotron 3 Ultra — test plan, review
                       ▼
        [ GitHub Actions runners ]
        Android emulator  ·  iOS Simulator  ·  Appium
```

**Sonuçlar kartı (2:29–2:42).** Satırlar 1'er saniye arayla belirir:

```
Main screens reached in one session
AntennaPod (Android Views)      9/10
Habo (Flutter)                  7/8
Ice Cubes (SwiftUI, iOS)        6/7
Jitsi Meet (React Native)       5/5
Read You (Jetpack Compose)      5/7
Jerboa (Jetpack Compose)        4/6
─────────────────────────────────────
1 real crash found · ~$0.016 per session
```

**Kapanış kartı (2:42–2:50):**

```
TapScout
Try it: tap-scout-zeta.vercel.app
Code: github.com/OzzyD07/TapScout
```

---

## 5. Kurallar ve son kontrol

**Kurallar** (resmî kurallar, 26 Ekim'de okundu):
- 3 dakikadan kısa; YouTube'da **Public**.
- Proje çalışırken gösterilmeli.
- Telifli müzik ve üçüncü taraf markası yok.
- Yüz şart değil.
- Yapay zekâ sesi serbest, ama kullandığın TTS planının lisansı kamuya açık yayına izin vermeli.

**Son kontrol:**
- [ ] Süre 2:50 (en fazla 2:55).
- [ ] Her hızlandırmada rozet, her kesmede atlanan süreyi söyleyen kart var.
- [ ] İngilizce altyazı videoya gömülü, konuşmayla birebir.
- [ ] Ekranda şifre, kişisel e-posta, `.env` yok.
- [ ] FieldNotes dışında uygulama ekranı ve hiçbir logo yok.
- [ ] Müzik yok ya da lisanslı (kaynak açıklamada yazılı).
- [ ] YouTube başlığı: "TapScout — autonomous mobile QA agent powered by NVIDIA Nemotron".
- [ ] Açıklamada demo ve repo linki, "Narration: AI voice".
- [ ] Link `docs/submission/devpost.md`'deki `<YouTube link>` yerine yazıldı.
