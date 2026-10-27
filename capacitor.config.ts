import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jarvis.assistant',
  appName: 'Jarvis',
  webDir: 'dist/jarvis/browser',
  // http scheme so the WebView can call Ollama on http://127.0.0.1:11434 (or your LAN PC) without mixed-content blocks.
  server: { androidScheme: 'http', cleartext: true },
  android: { allowMixedContent: true },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_jarvis', iconColor: '#22d3ee' },
    // Keep native fetch: CapacitorHttp would break token streaming.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
