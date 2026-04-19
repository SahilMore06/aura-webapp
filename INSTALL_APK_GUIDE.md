# 📱 AURA Android — Install Guide (Test APK)

## APK File
**`AURA-AirQuality-debug.apk`** — 5.1 MB  
Located in the `AQI FINAL/` folder

---

## Install on Your Android Phone

### Step 1 — Enable Unknown Sources
On your Android phone:
1. Open **Settings**
2. Go to **Security** (or **Privacy** on newer phones)
3. Enable **"Install Unknown Apps"** or **"Unknown Sources"**
   - On Android 8+: You enable this per-app when prompted
   - On older Android: One toggle in Security settings

### Step 2 — Transfer the APK to your phone
Choose one method:

**Method A — USB Cable (Fastest)**
1. Connect phone to Mac with USB
2. Choose "File Transfer" mode on your phone
3. Copy `AURA-AirQuality-debug.apk` to your phone's Downloads folder

**Method B — WhatsApp / Telegram**
1. Send the APK file to yourself on WhatsApp/Telegram
2. Open it on your phone and tap to install

**Method C — Google Drive**
1. Upload the APK to Google Drive
2. Open Google Drive on your phone, download and install

### Step 3 — Install
1. Open your phone's **Files** app
2. Navigate to **Downloads** (or wherever you copied the APK)
3. Tap **`AURA-AirQuality-debug.apk`**
4. Tap **Install**
5. If prompted "Play Protect" warning → tap **Install Anyway** (it's safe, just unsigned)

### Step 4 — Run the App
1. Open **AURA** from your home screen / app drawer
2. Grant **Location permission** when prompted → tap "Allow"
3. Sign in with your account

---

## What's Working in This Build
| Feature | Status |
|---|---|
| Dashboard with Live AQI | ✅ |
| Real-time location detection | ✅ Fixed (GPS + IP fallback) |
| Air quality map (Leaflet) | ✅ |
| AQI heatmap overlay | ✅ |
| Analytics charts | ✅ |
| ML predictions (60 cities) | ✅ (via Render cloud) |
| Google Gemini AI advisory | ✅ |
| Settings | ✅ |
| Login / Registration | ✅ |

---

## Rebuild APK (after code changes)

```bash
cd "AQI FINAL/frontend"
npm run cap:build-apk
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Troubleshooting

**App shows blank screen:**
→ Make sure your phone has internet. The app needs network to load data.

**Location shows wrong city:**
→ Tap the "Use GPS" button in the dashboard header. Grant location permission.

**"App not installed" error:**
→ Uninstall any previous version first, then reinstall.

**ML cities not loading:**
→ The ML backend on Render.com may be spinning up (free tier sleeps). Wait 30 seconds and refresh.
