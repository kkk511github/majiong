import { describe, expect, it } from "vitest";
import { tableOverlayLayout } from "../src/table-overlay-layout";

describe("外置碰杠控件的留白", () => {
  it.each([[568,320], [844,390], [1280,590], [1920,1080]])("%i×%i 的来源卡避开手牌、头像和中央计数", (width, height) => {
    const frame = { left: 17, top: 25, width, height };
    const layout = tableOverlayLayout(frame, frame);
    const bottom = layout.sourceTop + layout.sourceHeight;
    expect(bottom).toBeLessThanOrEqual(layout.handTop - 8);
    expect(layout.sourceLeft + layout.sourceWidth).toBeLessThanOrEqual(layout.left + 224 * layout.scale);
    const avatar = layout.players[3];
    expect(layout.sourceTop).toBeGreaterThan(layout.top + (avatar.plateY + avatar.h / 2) * layout.scale);
    expect(layout.sourceHeight).toBeGreaterThanOrEqual(44);
    expect(bottom).toBeLessThan(layout.top+(layout.players[0].plateY-layout.players[0].h/2)*layout.scale);
    expect(layout.sourceWidth).toBeGreaterThanOrEqual(80);
    const controlsRight = width - layout.actionRight;
    expect(controlsRight).toBeLessThanOrEqual(layout.left + 1140 * layout.scale - 8);
  });

  it("横屏刘海使来源卡收窄，并保持与本家头像的距离", () => {
    const frame = { left: 0, top: 0, width: 844, height: 390 };
    const safe = { left: 72, right: 72, top: 0, bottom: 18 };
    const layout = tableOverlayLayout(frame, frame, safe);
    expect(layout.sourceLeft).toBeGreaterThanOrEqual(safe.left * layout.scale);
    expect(layout.sourceLeft + layout.sourceWidth).toBeLessThanOrEqual(224 * layout.scale);
    expect(frame.width - layout.actionRight).toBeLessThanOrEqual(1140 * layout.scale - 8);
  });
});
