import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { teamSchema } from "../server/teams";
import { createReportQueue, type TelegramReportConfig } from "../server/telegram-reports";
import { freshTelegramConfig, reportStart } from "../deploy/fresh-telegram.mjs";

const root = resolve(import.meta.dirname, "..");
const args = ["--host", "root@unreachable.invalid", "--domain", "game.example.com", "--email", "admin@example.com"];
function run(extra: string[]) {
  return spawnSync("bash", [resolve(root, "deploy/new-server.sh"), ...extra], { encoding: "utf8" });
}
const now = Date.parse("2026-09-17T18:00:00+08:00");
function config(): TelegramReportConfig {
  return {
    chatId: "-100123456", chatTitle: "test-group", timezone: "Asia/Shanghai", countUnit: "completedTables",
    schedules: [
      { id: "daily", name: "日结冰战队+日结丁战队", kind: "dailyScore", days: 1, firstEnd: "2026-09-01T00:00:00+08:00", teams: [{ id: "old-ice", name: "日结冰战队" }, { id: "old-ding", name: "日结丁战队" }] },
      { id: "weekly", name: "一生所爱战队", kind: "weeklyTables", days: 7, firstEnd: "2026-09-07T00:00:00+08:00", teams: [{ id: "old-love", name: "一生所爱战队" }] },
    ],
  };
}

describe("new server deployment guards", () => {
  it.each(["new-server.sh", "bootstrap-server.sh", "install.sh", "package-installer.sh", "address.sh", "report-dates.sh", "renew-ip-certificate.sh"])("%s has valid Bash syntax", script => {
    expect(spawnSync("bash", ["-n", resolve(root, "deploy", script)]).status).toBe(0);
  });
  it("rejects shell metacharacters and reserved IP targets before SSH", () => {
    expect(run([...args, "--host", "root@host;exit", "--plan"]).stderr).toContain("Specify --host");
    expect(run([...args, "--domain", "203.0.113.10", "--plan"]).stderr).toContain("DNS domain");
  });
  it("rejects the existing server as target and removed migration options", () => {
    expect(run([...args, "--host", "212-majiong", "--plan"]).stderr).toContain("must differ");
    expect(run([...args, "--backup", "old.sqlite", "--plan"]).stderr).toContain("Unknown option");
  });
  it("plan never connects; scheduled reporting requires explicit enablement", () => {
    const result = run([...args, "--plan"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("empty database");
    expect(result.stdout).toContain("reporting enabled: 0");
    expect(run([...args, "--start-telegram", "--plan"]).stdout).toContain("reporting enabled: 1");
  });
});

describe("interactive server installer", () => {
  function wizard(input: string, entry = "install.sh") {
    return spawnSync("bash", [resolve(root, "deploy", entry)], { input, encoding: "utf8", timeout: 5000 });
  }
  it("no-argument entry opens the wizard and supports immediate exit", () => {
    const result = wizard("0\n", "new-server.sh");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("新服务器安装向导");
    expect(result.stdout).not.toContain("开始准备安装文件");
  });
  it("re-prompts invalid menu/domain/email input and finishes read-only planning", () => {
    const result = wizard("9\n2\n2\n203.0.113.10\ngame.example.com\nbad-email\nadmin@example.com\n3\n1\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("选项无效");
    expect(result.stdout).toContain("请输入有效域名");
    expect(result.stdout).toContain("邮箱格式不正确");
    expect(result.stdout).toContain("未联网、未安装软件、未写入配置");
  });
  it("uses bundled Telegram and shows requested period boundaries without SSH", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "mahjong-wizard-"));
    try {
      mkdirSync(resolve(dir, "deploy"));
      for (const file of ["install.sh", "address.sh", "report-dates.sh"])
        cpSync(resolve(root, "deploy", file), resolve(dir, "deploy", file));
      writeFileSync(resolve(dir, "telegram-config.tar.gz"), "plan-only-placeholder");
      const result = spawnSync("bash", [resolve(dir, "deploy/install.sh")], {
        input: "2\n1\n212.189.31.194\nadmin@example.com\n1\n20260230\n20260918\n\n2\n1\n", encoding: "utf8", timeout: 5000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("日期无效");
      expect(result.stdout).toContain("直接使用安装包内现有配置，不连接旧服务器");
      expect(result.stdout).toContain("日结起点：20260918 00:00；首次发送：20260919 00:00");
      expect(result.stdout).toContain("周结起点：20260918 00:00；首次发送：20260925 00:00");
      expect(result.stdout).toContain("定时统计：安装后启用");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("missing bundled Telegram asks for another option, never silently connects to old host", () => {
    const result = wizard("2\n2\ngame.example.com\nadmin@example.com\n1\n3\n1\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("缺少 telegram-config.tar.gz");
    expect(result.stdout).toContain("未联网");
  });
  it("never echoes custom passwords, and repeats mismatched confirmation", () => {
    const secret = "sample-private-password";
    const result = wizard(`2\n2\ngame.example.com\nadmin@example.com\n3\n2\nshort\n${secret}\nmismatched\n${secret}\n${secret}\n`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("两次密码不一致");
    expect(result.stdout).toContain("已设置（不显示）");
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
  it("EOF cancels instead of looping or starting an installation", () => {
    const result = wizard("2\n2\ngame.example.com\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("输入结束，已退出");
  });
  it("offers public IP HTTPS without a domain and re-prompts private IPs", () => {
    const result = wizard("2\n1\n192.168.1.1\n212.189.31.194\nadmin@example.com\n3\n1\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("不能使用内网");
    expect(result.stdout).toContain("https://212.189.31.194/mahjong");
    expect(result.stdout).toContain("每六小时");
  });
});

describe("certificate address validation", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "172.16.0.1", "192.168.0.1", "203.0.113.1", "198.51.100.1", "198.18.0.1", "224.0.0.1", "256.1.1.1", "1.2.3.04", "1.2.3.4;exit", "bad-.example.com"])("rejects %s", address => {
    expect(run([...args, "--ip", address, "--plan"]).status).not.toBe(0);
  });
  it.each(["212.189.31.194", "game.example.com"])("accepts %s in offline plan mode", address => {
    expect(run([...args, "--ip", address, "--plan"]).status).toBe(0);
  });
});

describe("fresh Telegram configuration", () => {
  it("anchors daily and weekly reports at the chosen midnight and waits a complete interval", () => {
    const db = new DatabaseSync(":memory:");
    try {
      teamSchema(db);
      const starts = { daily: "20260918", weekly: "20260918" };
      const fresh = freshTelegramConfig(db, config(), now, starts);
      expect(fresh.schedules.map(s => s.firstEnd)).toEqual(["2026-09-19T00:00:00+08:00", "2026-09-25T00:00:00+08:00"]);
      const queue = createReportQueue(db, fresh);
      queue.enqueue(Date.parse("2026-09-18T23:59:59+08:00"));
      expect(db.prepare("SELECT COUNT(*) AS n FROM report_runs").get()!.n).toBe(0);
      queue.enqueue(Date.parse("2026-09-19T00:00:00+08:00"));
      expect(db.prepare("SELECT start_at,end_at FROM report_runs WHERE kind='dailyScore'").get()).toEqual({
        start_at: Date.parse("2026-09-18T00:00:00+08:00"), end_at: Date.parse("2026-09-19T00:00:00+08:00"),
      });
      queue.enqueue(Date.parse("2026-09-25T00:00:00+08:00"));
      expect(db.prepare("SELECT start_at,end_at FROM report_runs WHERE kind='weeklyTables'").get()).toEqual({
        start_at: Date.parse("2026-09-18T00:00:00+08:00"), end_at: Date.parse("2026-09-25T00:00:00+08:00"),
      });
    } finally { db.close(); }
  });
  it("independent starts remain exact even when installation happens later", () => {
    const db = new DatabaseSync(":memory:");
    try {
      teamSchema(db);
      const fresh = freshTelegramConfig(db, config(), Date.parse("2026-10-01T00:00:00+08:00"), {daily: "20260918", weekly: "20260921"});
      expect(fresh.schedules.map(s => s.firstEnd)).toEqual(["2026-09-19T00:00:00+08:00", "2026-09-28T00:00:00+08:00"]);
    } finally { db.close(); }
  });
  it.each(["20260230", "20261301", "2026091", "2026-09-18", "20230229", "19991231"])("rejects invalid start %s", value => {
    expect(() => reportStart(value)).toThrow();
    const result = spawnSync("bash", ["-c", 'source "$1"; valid_report_date "$2"', "date-test", resolve(root, "deploy/report-dates.sh"), value]);
    expect(result.status).not.toBe(0);
  });
  it("accepts leap day and crosses the year boundary", () => {
    expect(reportStart("20240229")).toBe(Date.parse("2024-02-29T00:00:00+08:00"));
    const result = spawnSync("bash", ["-c", 'source "$1"; report_first_end 20261228 7', "date-test", resolve(root, "deploy/report-dates.sh")], {encoding: "utf8"});
    expect(result.stdout.trim()).toBe("20270104");
  });
  it("retains destination/grouping, maps empty new teams, and never backfills old periods", () => {
    const db = new DatabaseSync(":memory:");
    try {
      teamSchema(db);
      const original = config();
      const fresh = freshTelegramConfig(db, original, now);
      expect(fresh.chatId).toBe(original.chatId);
      expect(fresh.chatTitle).toBe(original.chatTitle);
      expect(fresh.schedules[0].teams).toEqual([{ id: "team-4", name: "日结冰战队" }, { id: "team-3", name: "日结丁战队" }]);
      expect(fresh.schedules.map(s => s.firstEnd)).toEqual(["2026-09-18T00:00:00+08:00", "2026-09-21T00:00:00+08:00"]);
      expect(original.schedules[0].teams[0].id).toBe("old-ice");
      expect(db.prepare("SELECT COUNT(*) AS n FROM team_memberships").get()!.n).toBe(0);
      const queue = createReportQueue(db, fresh);
      queue.enqueue(now);
      expect(db.prepare("SELECT COUNT(*) AS n FROM report_runs").get()!.n).toBe(0);
    } finally { db.close(); }
  });
  it("adds a configured team only as an empty team, without importing its old identifier", () => {
    const db = new DatabaseSync(":memory:");
    try {
      teamSchema(db);
      const input = config();
      input.schedules[1].teams[0].name = "新战队";
      input.schedules[1].name = "新战队";
      const fresh = freshTelegramConfig(db, input, now);
      expect(fresh.schedules[1].teams[0].id).not.toBe("old-love");
      expect(db.prepare("SELECT COUNT(*) AS n FROM teams WHERE name='新战队'").get()!.n).toBe(1);
      freshTelegramConfig(db, input, now);
      expect(db.prepare("SELECT COUNT(*) AS n FROM teams WHERE name='新战队'").get()!.n).toBe(1);
    } finally { db.close(); }
  });
  it("at midnight selects the next period, retaining weekly weekday", () => {
    const db = new DatabaseSync(":memory:");
    try {
      teamSchema(db);
      const fresh = freshTelegramConfig(db, config(), Date.parse("2026-09-21T00:00:00+08:00"));
      expect(fresh.schedules.map(s => s.firstEnd)).toEqual(["2026-09-22T00:00:00+08:00", "2026-09-28T00:00:00+08:00"]);
    } finally { db.close(); }
  });
});
