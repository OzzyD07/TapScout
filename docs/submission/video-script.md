| 2:12–2:29 | 35 || 1:50–2:12 | 40 || 1:40–1:50 | 16 || 1:09–1:31 | 49 || 0:57–1:09 | 28 || 0:44–0:57 | 25 || 0:32–0:44 | 28 || 0:08–0:32 | 41 |# TapScout — demo videosu kurgu planı (çıktı 2:50, sınır < 3:00)

Konuşma ve ekran yazıları İngilizce (teslim dili). Açıklamalar Türkçe.

**Zamanlamanın kaynağı:** vitrin koşusu `67f6637c` (26 Ekim). Start Test'e basıldığı an **00:00**
kabul edildi; aşağıdaki "kaynak" süreleri bu koşudaki gerçek olay zamanlarıdır. Senin kaydın
birkaç saniye, iOS tarafı birkaç dakika kayabilir. Her kesmeyi **olayın adıyla** bul (tabloda
yazıyor), saatle değil.

| Kaynak | Olay (zaman çizelgesindeki metin) |
|---|---|
| 00:00 | Start test |
| 02:20 | Android: "Runner started on GitHub-hosted android runner" |
| 02:55 | Android: "Interruption: in-app onboarding … tap "Get started"" |
| 03:08–03:30 | Android: Name, Email yazılır, Continue |
| 03:40 | Android: "Test plan (nvidia/Nemotron-3-Ultra-550b-a55b) …" notu |
| 03:46–04:03 | Android: Edit profile → About you yazılır → Save → Relaunch app |
| 04:04 | Android: bulgu adayı "Saved About you is lost after the app restarts" |
| 04:06–04:34 | Android: iki tekrar (Replay); 04:34'te "Reproduced 2/2" |
| 05:28–05:45 | Android: Add note → uzun başlık yazılır → Save → "Now on Outside the app" (çökme) |
| 06:01 | Android: "System dialog "FieldNotes keeps stopping" … tapped "Close app"" |
| 07:03 | iOS: runner başlar |
| 10:37 | iOS: onboarding geçilir |
| 12:12 | iOS: test planı notu |
| 12:50 | Android oturumu biter (kontroller ve bulgular yazılır) |
| 24:04 | iOS oturumu biter |
| 24:53 | Rapor hazır |

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

Rapor bölümünde şu sırayla, her durakta yazan süre kadar bekle:

1. Rapor özeti paragrafı (6 sn).
2. Bulgu filtresinde **"Evidence found"** seç. "Saved About you is lost after the app restarts" kartını aç: **Expected / Observed**, **Symptom screenshot**, "Reproduced 2/2" etiketi ve tekrar adımları (12 sn).
3. "App closes after saving long text in Title" kartı (6 sn).
4. "Text appears cut off on "Notes"" kartı ve altındaki **Nemotron Ultra triage gerekçesi** (8 sn).
5. **Checks** tablosu: geçen/kalan satırlar (6 sn).
6. **"What each platform session covered"** ve **"What limited this run"** / **Limitations** (6 sn).
7. **Screen map** (6 sn).

Canlı koşu kötü giderse (altyapı hatası vb.): Kayıt B'yi paylaşılan koşu `67f6637c` ile çek.
Kayıt A'nın canlı kısımları için koşuyu tekrarla.

---

## 2. Kurgu listesi (saniye saniye)

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
| **0:54–0:57** | 3 sn | A: 00:06 → 02:55 | **Kes** | Kart | `Two fresh devices boot on GitHub runners — 2:49 skipped` |
| **0:57–1:05** | 8 sn | A: 02:55 → 03:40 | ×6 | Android: onboarding geçilir, Name/Email yazılır, Continue | rozet `×6` |
| **1:05–1:09** | 4 sn | A: 03:40 | Dondur | Test planı notuna yakınlaş (zoom ×1,6) | `Test plan written by Nemotron 3 Ultra` |
| **1:09–1:21** | 12 sn | A: 03:46 → 04:04 | ×1,5 | Edit profile → About you yazılır → Save → Relaunch app; ekran görüntüsünde alan boş | rozet `×1.5` · 1:18'de: `Saved text is gone after restart` |
| **1:21–1:28** | 7 sn | A: 04:04 → 04:34 | ×4 | Bulgu adayı satırı, ardından iki Replay döngüsü | rozet `×4` · `Replaying the steps…` |
| **1:28–1:31** | 3 sn | A: 04:34 | Dondur | "Reproduced 2/2" satırına yakınlaş | `Reproduced 2/2` (büyük, yeşil) |
| **1:31–1:37** | 6 sn | A: 05:28 → 05:58 (04:34 → 05:28 **kes**) | ×5 | Add note → uzun başlık → Save → "Outside the app" | rozet `×5` · ilk 1 sn köşede: `+54 s` |
| **1:37–1:40** | 3 sn | A: 06:01 | Dondur | "FieldNotes keeps stopping" notuna yakınlaş | `Crash found` |
| **1:40–1:47** | 7 sn | A: 10:40 → 12:15 (06:01 → 10:40 **kes**) | ×14 | iOS sekmesi: onboarding, iOS test planı | rozet `×14` · ilk 1 sn köşede: `+4:39` · `iOS Simulator, in parallel` |
| **1:47–1:50** | 3 sn | A: 12:15 → 24:53 | **Kes** | Kart | `Both sessions finish — 12:38 skipped · 25 min in total` |
| **1:50–1:56** | 6 sn | B: durak 1 | ×1 | Rapor özeti | — |
| **1:56–2:08** | 12 sn | B: durak 2 | ×1 | About you bulgusu: Expected/Observed, ekran görüntüsü, Reproduced 2/2, adımlar | — |
| **2:08–2:12** | 4 sn | B: durak 3 | ×1,5 | Çökme bulgusu | — |
| **2:12–2:19** | 7 sn | B: durak 4 | ×1 | Kırpılmış metin bulgusu + Ultra triage gerekçesi | `Reviewed by Nemotron 3 Ultra` |
| **2:19–2:25** | 6 sn | B: durak 5–6 | ×2 | Checks tablosu → "What limited this run" | rozet `×2` |
| **2:25–2:29** | 4 sn | B: durak 7 | ×1,5 | Screen map | `6 of 6 planted bugs · Android & iOS · 0 false alarms` |
| **2:29–2:42** | 13 sn | Grafik ("Sonuçlar kartı") | — | Benchmark tablosu | Kartın kendisi |
| **2:42–2:50** | 8 sn | Grafik ("Kapanış kartı") | — | — | Kartın kendisi |

**Kesilen gerçek süre:** 2:49 (cihaz açılışı) + 0:54 + 4:39 + 12:38 (oturumların bitişi) ≈ 21 dk.
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
| 1:09–1:31 | 49 | From then on, Nemotron Lightning picks every action, about a second per step, with a reason you can read. Here it edits the profile, saves, and restarts the app. The text is gone. TapScout doesn't stop at a guess: it replays the steps twice. Reproduced, two out of two. |
| 1:31–1:40 | 20 | A minute later it saves a note with a very long title, and the app crashes. That is replayed too. |
| 1:40–1:50 | 16 | Meanwhile, the same app runs on the iOS Simulator in parallel, with its own test plan. |
| 1:50–2:12 | 40 | When both sessions finish, one report covers both platforms. Every finding shows what was expected, what happened, the screenshot, and the steps that led to it. Nothing is a bare claim: each one points to the screen that proves it. |
| 2:12–2:29 | 35 | Nemotron Ultra reviews each finding and explains its verdict. The report also says what limited the run and what it did not test. Here: all six planted bugs, on both platforms, and no false alarms. |
| 2:29–2:42 | 32 | On six real open-source apps across five UI frameworks, it reaches most main screens in one session, and it found a real crash. A session costs under two cents in model calls. |
| 2:42–2:50 | 10 | TapScout. Hand it a build, get back bugs with proof. |

Toplam 343 kelime (~2,1 kelime/sn; rahat bir anlatım hızı).

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
