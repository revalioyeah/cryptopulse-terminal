# CryptoPulse Terminal (Web-First SPA, Android-Ready)

**CryptoPulse Terminal** adalah platform *Crypto Trading Intelligence, Smart Screener, Backtest-First Setup, Auto-Signal Bot, Whale Activity Tracker,* dan *Portofolio Akumulasi Spot* berbasis **React + Vite + TypeScript (Strict Mode) + Tailwind CSS + Zustand + TanStack Query + TradingView Lightweight Charts**.

Aplikasi dibangun sebagai **SPA statis (`dist/`)** tanpa ketergantungan SSR sehingga dapat berjalan cepat di Desktop/Mobile browser sekaligus siap di-compile menjadi **Android APK** via **Capacitor**.

---

## Arsitektur Modular

- `src/types/` — Definisi interface eksplisit (`Coin`, `Candle`, `TradeSetup`, `SpotSetup`, `SpotHolding`, `ActivityLog`, `WhaleTx`, `PriceAlert`, `TelegramConfig`, dan tipe pendukung).
- `src/services/adapters/` — Seluruh komunikasi REST & WebSocket terisolasi melalui pola **Adapter** dengan fallback mock data realistis:
  - `binanceAdapter.ts` — Ticker 24h, OHLCV Klines, & WebSocket `!miniTicker@arr`
  - `coinGeckoAdapter.ts` — Global Market Cap, `BTC.D`, `USDT.D` (cache 5–10 menit)
  - `fearGreedAdapter.ts` — Alternative.me Fear & Greed Index (cache 15 menit)
  - `derivativesAdapter.ts` — Funding Rate (8h), Open Interest, L/S Ratio, Liquidation Clusters 25x/50x (siap disambungkan ke Coinglass API)
  - `whaleAdapter.ts` — Live stream on-chain whale outflow/inflow (siap disambungkan ke Whale Alert / DeFiLlama)
  - `telegramAdapter.ts` — Telegram Bot API (`sendMessage` HTML + Test Koneksi)
- `src/hooks/` — Custom hooks dengan cleanup ketat saat unmount (`useBinanceStream`, `useMarketQueries`, `useAutoScanner`, `usePriceAlertWatcher`, `useWhaleStream`).
- `src/store/` — State lokal ter-persist via **Zustand `persist`** (`localStorage`) lengkap dengan utilitas **Backup & Restore JSON**.

---

## Menjalankan Web App Lokal

```bash
# 1. Instal dependensi
npm install

# 2. (Opsional) Salin environment variables
cp .env.example .env

# 3. Jalankan development server
npm run dev

# 4. Verifikasi TypeScript strict & build produksi statis (output: dist/)
npm run typecheck
npm run build
```

> Semua variabel environment memakai prefix `VITE_` (lihat `.env.example`). Jika API key belum diisi atau API publik terkena rate-limit, aplikasi otomatis beralih ke fallback data realistis tanpa crash.

---

## Cara Build Android APK via Capacitor

Proyek sudah dilengkapi [`capacitor.config.ts`](./capacitor.config.ts) (`webDir: 'dist'`), `viewport-fit=cover`, dan dukungan `env(safe-area-inset-bottom)` pada Bottom Navigation Bar.

### Prasyarat
- Node.js 20+
- Java JDK 17+ & Android SDK (Android Studio)

### Langkah Build APK

```bash
# 1. Instal paket Capacitor Android (cukup sekali)
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. Build SPA statis terlebih dahulu
npm run build

# 3. Tambahkan platform Android (cukup sekali)
npm run cap:add:android

# 4. Sinkronkan bundle dist/ ke project Android
npm run build:android

# 5a. Buka di Android Studio untuk build / signing APK atau AAB
npm run cap:open:android

# 5b. Atau compile Debug APK langsung via Gradle CLI
cd android && ./gradlew assembleDebug
# Output APK: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Opsi Menjalankan Auto-Signal Scanner 24/7 (Supabase Edge Function)

Pada arsitektur client-only (Web/APK), **Auto-Signal Scanner Bot** berjalan selama aplikasi terbuka. Agar pemindaian sinyal & notifikasi **Telegram** berjalan **24/7 di server** meskipun HP/browser ditutup:

1. **Buat Proyek Supabase** dan aktifkan ekstensi `pg_cron` serta `pg_net` melalui SQL Editor.
2. **Buat Edge Function** (`supabase functions new cryptopulse-scanner`):
   - Pindahkan logika murni dari `src/services/indicators.ts`, `src/services/backtestEngine.ts`, dan `src/services/spotScoring.ts` (seluruhnya pure TypeScript tanpa ketergantungan DOM).
   - Simpan state **Anti-Spam Cooldown** per coin pada tabel Postgres (`scanner_cooldowns(symbol text primary key, last_sent_at timestamptz)`).
   - Simpan `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` sebagai Supabase Secrets:
     ```bash
     supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
     ```
   - Deploy fungsi:
     ```bash
     supabase functions deploy cryptopulse-scanner --no-verify-jwt
     ```
3. **Jadwalkan dengan `pg_cron`** (contoh: scan otomatis setiap 5 menit):
   ```sql
   select cron.schedule(
     'cryptopulse-auto-scanner-5m',
     '*/5 * * * *',
     $$
     select net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cryptopulse-scanner',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <ANON_OR_CRON_SECRET>'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

Dengan pola ini, terminal Web/Android Anda tetap ringan dan 100% statis sementara sinyal 24/7 dikirim otomatis ke Telegram.
