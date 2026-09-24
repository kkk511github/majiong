import { describe, expect, it } from "vitest";
import { roomCommunicationLayout,roomPhrasePosition } from "../src/room-communication-layout";
import {layoutPlayerHud} from '../shared/table-scene';

describe("短句单入口实际牌桌布局", () => {
  it.each([[568,320],[844,390],[1280,590],[1920,1080]])('3D主题 %i×%i 跟随新头像，入口保留且不进入手牌区',(width,height)=>{
    const frame={left:0,top:0,width,height};
    for(const safe of [undefined,{left:72,right:72,top:0,bottom:18}]){
      const layout=roomCommunicationLayout(frame,frame,safe,54,'reference-3d');
      expect(layout.players).toEqual([0,1,2,3].map(o=>layoutPlayerHud(o,safe,'reference-3d')));
      expect(layout.players[1].y).toBe(142);expect(layout.tableStyle).toBe('reference-3d');
      expect(layout.rail.top+layout.rail.height).toBeLessThanOrEqual(layout.handTop);
      expect(layout.rail.width).toBeGreaterThanOrEqual(44);
      expect(layout.rail.left+layout.rail.width).toBeLessThanOrEqual(width-layout.safeRight);
      for(const offset of [0,1,2,3]){
        const bubble=roomPhrasePosition(layout,offset);
        expect(bubble.left).toBeGreaterThanOrEqual(layout.safeLeft);
        expect(bubble.left+bubble.width).toBeLessThanOrEqual(width-layout.safeRight+.01);
        expect(bubble.top).toBeGreaterThanOrEqual(layout.top);
      }
      const old=roomCommunicationLayout(frame,frame,safe,54);
      expect(roomPhrasePosition(layout,1).top).not.toBe(roomPhrasePosition(old,1).top);
    }
  });
  it.each([[568,320], [667,375], [844,390], [1280,590], [1920,1080]])("%i×%i避开玩家、手牌和中央信息", (width, height) => {
    const frame = { left: 0, top: 0, width, height };
    const layout = roomCommunicationLayout(frame, frame);
    const { scale, left, top, rail, panel, players } = layout;
    expect(rail.top).toBeGreaterThanOrEqual(top + (players[1].plateY + players[1].h / 2) * scale);
    expect(rail.top + rail.height).toBeLessThanOrEqual(layout.handTop);
    expect(rail.left + rail.width).toBeLessThanOrEqual(width - layout.safeRight);
    expect(layout.size).toBeGreaterThanOrEqual(44);
    expect(rail.width).toBe(layout.size);
    expect(rail.height).toBe(layout.size);
    expect(layout.compact).toBe(width < 720);
    expect(panel.left).toBeGreaterThanOrEqual(left + 790 * scale - .01);
    expect(panel.top).toBeGreaterThanOrEqual(112);
    expect(panel.top + panel.height).toBeLessThanOrEqual(layout.handTop - 12 + .01);
    expect(panel.width).toBeGreaterThan(180);
  });
  it("横屏安全区变化后，入口留在可触摸范围", () => {
    const frame = { left: 0, top: 0, width: 844, height: 390 };
    const layout = roomCommunicationLayout(frame, frame, { left: 72, right: 72, top: 0, bottom: 18 });
    expect(layout.rail.left + layout.rail.width).toBeLessThanOrEqual(844 - layout.safeRight);
    expect(layout.rail.width).toBe(layout.size);
    expect(layout.rail.height).toBe(layout.size);
    expect(layout.panel.top + layout.panel.height).toBeLessThan(layout.handTop);
  });
  it("紧凑模式只扩展短句浮层，不增加第二个入口占位", () => {
    for (const width of [568, 719, 720, 844]) {
      const frame = { left: 0, top: 0, width, height: 390 };
      const layout = roomCommunicationLayout(frame, frame);
      expect(layout.rail.width * layout.rail.height).toBe(layout.size ** 2);
      const panelRight = layout.panel.left + layout.panel.width;
      if (layout.compact) expect(panelRight).toBeGreaterThan(layout.rail.left);
      else expect(panelRight).toBeLessThan(layout.rail.left);
    }
  });
});
