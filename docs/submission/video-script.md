# TapScout — demo video script (target 2:45, hard limit < 3:00)

Narration and on-screen text are in English (submission language). Production notes are in
Turkish for the person recording.

## Kurallar ve kararlar (resmî kurallar, 26 Ekim'de okundu)

- **Süre:** 3 dakikadan kısa olmalı; jüri 3. dakikadan sonrasını izlemek zorunda değil. Hedef
  2:45, tampon 15 sn.
- **Görüntü:** projenin çalıştığı cihazı göstermeli: web arayüzü ve emülatör/simülatör ekran
  görüntüleri yeter.
- **Yayın:** YouTube'da **herkese açık** (Public) olmalı. "Liste dışı" (Unlisted) değil.
- **Telif:** üçüncü taraf marka ve telifli müzik/materyal izinsiz kullanılmaz.
  - Müzik yalnızca lisansı açık bir kaynaktan, örneğin YouTube Ses Kitaplığı; ya da hiç müzik
    olmasın.
  - NVIDIA/Nebius adları metin olarak geçebilir; logolarını kullanma.
  - Benchmark uygulamalarının (Ice Cubes, Mastodon vb.) ekranlarını ve logolarını gösterme.
    Videoda yalnız kendi örnek uygulamamız FieldNotes görünür.
- **Yüz:** göstermek zorunlu değil; kurallarda böyle bir şart yok.
- **Yapay zekâ sesi:** kurallarda yasak yok. Sesin yayın hakkının sende olması yeter: kullandığın
  TTS servisinin lisansı ticari/kamuya açık kullanıma izin vermeli. Ücretsiz planlar çoğu zaman
  vermez; planın koşullarını kontrol et.
  - Sesi videonun açıklamasında belirt: "Narration: AI voice". Dürüst ve risksiz.
- **Altyazı:** İngilizce altyazıyı videoya göm. Jüri sessiz izleyebilir; konuşma metni zaten
  aşağıda hazır.
- **Hızlandırma:** kesilen ve hızlandırılan her yer ekranda açıkça yazar ("×12", "4 min later").
  Bu, ürünün dürüstlük ilkesiyle uyumlu (`docs/05` §6 F5: "Kesilen bekleme açıkça belirtilir").

## Kayıt planı

**Ne kaydedilecek:** yeni bir canlı koşu, baştan sona, kesintisiz. Video bundan kurgulanır.

1. **Hazırlık:**
   - OBS Studio (ücretsiz), 1920×1080, 30 fps.
   - Tarayıcı tam ekran, yakınlaştırma %110–125; yer imi çubuğu ve diğer sekmeler kapalı.
   - Bir jüri hesabıyla gir (`judge1@tapscout.com`, şifre `.env.jury`'de). Böylece ekranda kişisel
     e-posta görünmez.
   - **Şifre yazılırken kaydı durdur** ya da giriş sahnesini sonradan çek.
2. **Kayıt A — canlı koşu (~25 dk):**
   - Start Test formu açıkken kaydı başlat.
   - Varsayılan seçili "FieldNotes — sample: seeded" (iki platform) kalsın; beş modun hepsini işaretle.
   - Start Test'e bas. Koşu sayfasında kal ve koşu bitene kadar kayda devam et.
   - Ara ara Android/iOS sekmeleri arasında geç; zaman çizelgesinde birkaç olaya tıkla.
   - Koşudan beklenenler (vitrin koşusu `67f6637c`'deki zamanlama):

     | Zaman (başlangıçtan) | Olay |
     |---|---|
     | ~0:00–3:30 | Kuyruk ve cihaz açılışı (videoda kesilir) |
     | +0:35 | Onboarding geçilir ("Get started") |
     | +1:20 | Nemotron Ultra test planını yazar (not olarak görünür) |
     | +1:25–2:15 | "Edit profile" → "About you" yazılır → kaydedilir → uygulama yeniden başlatılır → değer kaybolmuş → iki kez tekrarlanır |
     | +3:25 | Uzun başlıklı not kaydedilir → uygulama kapanır (çökme) |
     | Android ~10 dk, iOS ~17 dk | Oturumlar biter, rapor oluşur |
3. **Kayıt B — rapor (2–3 dk):**
   - Koşu bitince rapor bölümünü yavaşça gez: özet, bulgu kartları, kanıt görüntüsü, "Reproduced
     2/2", triage gerekçesi, ekran haritası, kontrol durum tablosu ("Not tested"/"Unsupported").
   - Koşu kötü giderse aynı çekimi paylaşılan örnek koşu **`67f6637c`** ile yap (ana sayfada
     "Sample run"). Videoda o koşu için "Previously completed run" yaz.
4. **Kayıt C — açılış görüntüsü:** ana sayfa, build yükleme kutusu, "How do I get these files?"
   (5–10 sn yeter).

**Sesi en son ekle:**
- Konuşma metnini TTS'e ver, her sahneyi ayrı ses dosyası olarak üret.
- Görüntüyü sesin süresine göre kes; görüntüyü sese uydur, tersi değil.

## Akış (toplam ~2:45)

Süreler yaklaşık. İngilizce konuşma ~150 kelime/dk; toplam ~370 kelime.

---

### Sahne 1 — Problem (0:00–0:15)

**Görüntü:** FieldNotes'un iOS ekran görüntüsü, "About you" alanında yazılı bir metin. Kesme:
aynı ekran, uygulama yeniden açılınca alan boş. (Kayıt A'nın 1:25–2:15 arasındaki ekran
görüntülerinden.)

**Ekran yazısı:** `Saved. Restarted. Gone.`

**Narration:**
> You save your profile, restart the app — and it's gone. A person finds that bug in five minutes
> of tapping around. Catching it automatically still means writing UI test scripts for every
> screen, on two platforms. Most small teams never do.

---

### Sahne 2 — Ne yapıyor (0:15–0:35)

**Görüntü:** Kayıt C: ana sayfa → build yükleme kutusu → Start Test formu: iki platform, seeded
örnek, beş mod işaretleniyor → **Start Test** tıklanıyor.

**Ekran yazısı:** `Upload an APK or iOS Simulator build · No scripts`

**Narration:**
> TapScout is an autonomous QA agent. Upload an Android APK or an iOS Simulator build, pick what
> to test, and press Start. That's the whole setup. We're testing our sample app, which has six
> bugs planted in it.

---

### Sahne 3 — Canlı keşif (0:35–1:20)

**Görüntü:**
- Kayıt A'dan. Kuyruk ve cihaz açılışını kes; araya kısa bir kart koy: `Devices boot on GitHub
  runners · 3 min later`.
- Sonra zaman çizelgesi ×8–×12 hızda akar; sağ üstte sürekli bir rozet: `×10`.
- Android ve iOS sekmeleri arasında bir kez geçiş.
- Yavaşlat (×1) ve bir olayı vurgula: "Type text into About you", yanında planner'ın gerekçesi
  ve ekran görüntüsü.

**Ekran yazısı (vurgu sırasında):** `Planner: NVIDIA Nemotron 3.5 Lightning · ~1 s per step`

**Narration:**
> Each platform gets a fresh device — a real Android emulator and an iOS Simulator — running in
> parallel. At every step, NVIDIA Nemotron, served by Nebius Token Factory, reads the screen and
> picks the next action, with a reason you can see. A larger Nemotron model, Ultra, writes a
> test plan for this specific app once it has seen the first screens. Everything is validated
> before it touches the device, and the agent never taps anything that would post, follow or
> spend money.

---

### Sahne 4 — Hatayı yakalıyor (1:20–1:50)

**Görüntü:**
- Kayıt A, +1:25–2:15 bölümü, ×4 hız.
- Akış: Edit profile → yaz → Save → **Relaunch app** → alan boş → "Replay" adımları iki kez.
- Sonra +3:25: uzun başlık → Save → "Relaunch app after the crash".
- Rozet: `×4`.

**Ekran yazısı:** `Found → replayed → Reproduced 2/2`

**Narration:**
> Here it saves a profile, restarts the app, and checks the value is still there. It isn't. So
> TapScout doesn't just report a guess — it replays the steps twice, and the bug reproduces both
> times. A minute later, a long note title crashes the app. That gets replayed too.

---

### Sahne 5 — Rapor (1:50–2:25)

**Görüntü:** Kayıt B, ×1, yavaş kaydırma.
- Özet.
- Bulgu kartı "Saved About you is lost after the app restarts": beklenen/gözlenen, kanıt
  görüntüsü, `Reproduced 2/2`, tekrar adımları.
- Kırpılmış metin bulgusu ve triage gerekçesi.
- Ekran haritası.
- Kontrol durum tablosunda bir `Not tested` satırı.

**Ekran yazısı:** `6 of 6 planted bugs · Android and iOS · 0 false alarms`

**Narration:**
> When the run ends, you get one report for both platforms. Every finding shows what was
> expected, what happened, the screenshots, and the steps that led to it. Nemotron Ultra
> reviews the findings and flags likely false alarms; a vision model confirms visual ones like
> clipped text. In this run it caught all six planted bugs, on both platforms, with no false
> alarms. And it says what it did not test, instead of inventing a coverage number.

---

### Sahne 6 — Gerçek uygulamalar ve mimari (2:25–2:40)

**Görüntü:** Tek bir sade slayt, iki sütun. Logo yok, yalnız metin.
- Solda mimari: `Browser → Next.js on Vercel → Nebius Token Factory (Nemotron)` ve
  `GitHub Actions: Android emulator · iOS Simulator + Appium`.
- Sağda benchmark tablosu (README'den):
  - AntennaPod 9/10
  - Habo 7/8
  - Ice Cubes 6/7
  - Jitsi 5/5
  - Read You 5/7
  - Jerboa 4/6

**Ekran yazısı:** `5 UI stacks · ~$0.016 in model calls per platform`

**Narration:**
> On six real open-source apps, across five UI frameworks, it reaches most main screens in one
> seventeen-minute session — and it found a real crash in one of them. A full session costs about
> two cents in model calls.

---

### Sahne 7 — Kapanış (2:40–2:50)

**Görüntü:** TapScout adı, demo adresi, repo adresi; arkada rapor sayfası bulanık.

**Ekran yazısı:**
```
TapScout
tap-scout-zeta.vercel.app
github.com/OzzyD07/TapScout
```

**Narration:**
> TapScout. Hand it a build, get back bugs with proof. Try it at the link below.

---

## Kurgu kontrol listesi

- [ ] Toplam süre < 3:00 (hedef 2:45–2:50).
- [ ] Her hızlandırmada rozet var (`×4`, `×10`); her kesmede kart var (`3 min later`).
- [ ] İngilizce altyazı videoya gömülü; konuşmayla birebir aynı.
- [ ] Ekranda şifre, `.env`, kişisel e-posta, GitHub token'ı görünmüyor; adres çubuğunda sorgu
  parametresi yok.
- [ ] Ice Cubes, Mastodon ve diğer üçüncü taraf uygulamaların ekranları ve logoları yok; NVIDIA
  ve Nebius logoları yok (adlar metin olarak var).
- [ ] Müzik yoksa sorun yok; varsa lisanslı ve kaynağı açıklamada yazılı.
- [ ] YouTube'da **Public**; başlık: "TapScout — autonomous mobile QA agent powered by NVIDIA
  Nemotron".
- [ ] Açıklamaya demo ve repo linkleri, "Narration: AI voice" notu ve (varsa) müzik kaynağı
  eklendi.
- [ ] Link `docs/submission/devpost.md`'deki `<YouTube link>` yerine yazıldı.
