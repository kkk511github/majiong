/** Records use the room's China calendar, regardless of device timezone. */
export function recordDate(at: number) {
  return new Date(at + 8 * 3600000).toISOString().slice(0, 10);
}
export function recordDayRange(date: string) {
  const from = Date.parse(date + "T00:00:00+08:00");
  return { from, to: from + 86400000 };
}
export function recordClock(at: number, includeDate = false) {
  const china = new Date(at + 8 * 3600000).toISOString();
  return `${includeDate ? china.slice(5, 10).replace("-", "/") + " " : ""}${china.slice(11, 16)}`;
}
export function recordDateLabel(date: string, today = recordDate(Date.now())) {
  if (!date) return "全部";
  if (date === "recent") return "近7天";
  if (date === today) return "今天";
  if (date === recordDate(recordDayRange(today).from - 86400000)) return "昨天";
  return recordCalendarLabel(date, today);
}
export function recordCalendarLabel(date: string, today = recordDate(Date.now())) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year !== Number(today.slice(0, 4)) ? year + "年" : ""}${month}月${day}日`;
}

/** Inclusive China-calendar days, with an exclusive upper bound for API queries. */
export function recordFilterRange(date: string, today = recordDate(Date.now())) {
  if (!date) return undefined;
  if (date === "recent") {
    const { from, to } = recordDayRange(today);
    return { from: from - 6 * 86400000, to };
  }
  return recordDayRange(date);
}
