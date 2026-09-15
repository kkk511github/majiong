import { expect, it } from "vitest";
import {
  recordDate,
  recordDayRange,
  recordDateLabel,
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
