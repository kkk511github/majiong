import { expect, it } from "vitest";
import { meldSourceDirection } from "../src/MeldSourceArrow";
import type { Seat } from "../shared/types";
it("供牌箭头随观看者旋转，对同一供牌者的不同碰杠指向一致", () => {
  for (const me of [0, 1, 2, 3] as Seat[]) {
    expect(meldSourceDirection(me, me)).toBe("down");
    expect(meldSourceDirection(((me + 1) % 4) as Seat, me)).toBe("right");
    expect(meldSourceDirection(((me + 2) % 4) as Seat, me)).toBe("up");
    expect(meldSourceDirection(((me + 3) % 4) as Seat, me)).toBe("left");
  }
});
