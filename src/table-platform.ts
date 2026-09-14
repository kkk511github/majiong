import { Capacitor } from "@capacitor/core";

// Also use the same layout when an Android browser previews the game.
export const androidTable =
  Capacitor.getPlatform() === "android" || /Android/i.test(navigator.userAgent);
