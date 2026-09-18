import { expect, it } from "vitest";
import {
  recordDate,
  recordDayRange,
  recordDateLabel,
  recordFilterRange,
  recordCalendarLabel,
} from "../src/record-dates";
it("按中国时间跨午夜归属日期，跨年仍保留准确日期", () => {
  expect(recordDate(Date.parse("2026-08-31T15:59:59Z"))).toBe("2026-08-31");
  expect(recordDate(Date.parse("2026-08-31T16:00:00Z"))).toBe("2026-09-01");
  expect(recordDayRange("2026-09-01")).toEqual({
    from: Date.parse("2026-08-31T16:00:00Z"),
    to: Date.parse("2026-09-01T16:00:00Z"),
  });
  expect(recordDateLabel("2025-12-31", "2026-01-01")).toBe("昨天");
  expect(recordDateLabel("2025-12-30", "2026-01-01")).toBe("2025年12月30日");
});
it("近7天包含今天和前六个中国日历日，跨年边界与单日查询一致", () => {
  expect(recordFilterRange("recent", "2026-01-03")).toEqual({
    from: Date.parse("2025-12-28T00:00:00+08:00"),
    to: Date.parse("2026-01-04T00:00:00+08:00"),
  });
  expect(recordFilterRange("2026-09-18")).toEqual(recordDayRange("2026-09-18"));
  expect(recordFilterRange("")).toBeUndefined();
  expect(recordDateLabel("recent")).toBe("近7天");
  expect(recordCalendarLabel("2026-01-03", "2026-01-03")).toBe("1月3日");
  expect(recordCalendarLabel("2025-12-31", "2026-01-03")).toBe("2025年12月31日");
});
