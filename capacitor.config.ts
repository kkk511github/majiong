import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.jinling.mahjong",
  appName: "金陵麻将",
  webDir: "dist",
  backgroundColor: "#082820",
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: false,
  },
  android: { backgroundColor: "#082820", webContentsDebuggingEnabled: false },
  plugins: {
    SystemBars: {
      hidden: true,
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
  },
};
export default config;
