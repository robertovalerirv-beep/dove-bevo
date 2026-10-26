import type { CapacitorConfig } from "@capacitor/cli";
import { validateNativeConfig } from "./native/build-policy.ts";

const config: CapacitorConfig = {
  appId: "com.dovebevo.app.preview",
  appName: "Dove bevo Preview",
  webDir: "dist/native",
  loggingBehavior: "none",
  server: {
    hostname: "localhost",
    androidScheme: "https",
    iosScheme: "capacitor",
    cleartext: false,
  },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
  plugins: {
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
    SystemBars: { insetsHandling: "native" },
  },
  includePlugins: [
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/geolocation",
    "@capacitor/share",
  ],
};
validateNativeConfig(config);
export default config;
