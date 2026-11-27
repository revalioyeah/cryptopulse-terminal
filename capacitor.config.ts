/**
 * Konfigurasi Capacitor untuk migrasi CryptoPulse Terminal SPA (dist/) ke Android APK.
 * Kompatibel langsung dengan `@capacitor/cli` dan strict TypeScript.
 */
interface CapacitorAppConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: 'https' | 'http';
    cleartext?: boolean;
  };
  android?: {
    backgroundColor?: string;
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
  };
  plugins?: {
    StatusBar?: {
      style?: 'DARK' | 'LIGHT';
      backgroundColor?: string;
    };
  };
}

const config: CapacitorAppConfig = {
  appId: 'com.cryptopulse.terminal',
  appName: 'CryptoPulse Terminal',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0B0E11',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B0E11',
    },
  },
};

export default config;
