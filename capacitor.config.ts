import type { CapacitorConfig } from "@capacitor/cli";
const simulatorDemo = process.env.MAHJONG_SIMULATOR_DEMO === "1";
const config: CapacitorConfig = {
  appId: simulatorDemo ? "com.jinling.mahjong.demo" : "com.jinling.mahjong",
  appName: simulatorDemo ? "金陵麻将演示" : "金陵麻将",
  webDir: "dist",
  ...(simulatorDemo ? { server: { url: "http://127.0.0.1:5181", cleartext: true } } : {}),
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
