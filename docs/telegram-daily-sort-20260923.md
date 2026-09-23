# 日结 50金额降序（2026-09-23）

## 范围

- 仅 `server/report-xlsx/workbook.ts` 的日结明细顺序：按 `points` 有符号数值降序，金额相同按玩家 ID 数值升序。
- 整张合并战队日报共同排序，不按战队分块。复制输入数组后排序，整行输出；原输入、计算口径、统计日期、模板、汇总位置均保留。
- 周报继续原来的顺序；日结分数÷2、周结局数×3不变。
- 已保存的报表快照仍原样重试，不重建历史文件，不补发到 Telegram。

## 验证

- 本地、候选 Linux 报表容器：3 个测试文件、45 项测试全部通过。覆盖跨战队排序、正负数、零、小数、ID 同金额次序、单行、空表、六列布局、公式缓存、总计和跨日快照重试。
- TypeScript、差异检查通过。
- 使用表格检查工具只读导入现有生成器的前后测试样本并渲染检查；重算 E 列结果为 `100,10,10,9.5,0,-0.5,-8`，总计 `121`，原模板格式不变。样本仅用于 QA，没有发送。
- 镜像中遗留的旧测试仍断言已废弃的 20 列；候选验证挂载当前六列回归测试，没有为此更改生成器或线上历史数据。

## 上线

- 生产服务器：212.189.31.46。
- 旧报表镜像：`jinling-mahjong:reports-reset-ready-20260920-b875f3e9c8`。
- 新报表镜像：`jinling-mahjong:reports-daily-amount-desc-20260923`，只覆盖上述一个渲染文件。
- 生效时间约 `2026-09-23T14:56:49Z`（北京时间 22:56），报表容器 healthy，RestartCount=0。
- 渲染文件 SHA-256：`f4b0e7d4baa1c77792a0cca1569db428c0c075af22ffbe09dc156cd5543c6c95`。
- 报表状态数据库已通过 SQLite 在线备份，完整性检查 `ok`。备份与受限配置副本位于 `/opt/jinling-mahjong/telegram-reports/releases/daily-amount-desc-20260923/`。
- 切换前后 `report_runs` 的 5 条记录及全部保存文件内容哈希一致；`report_schedules` 的 4 条记录及配置文件哈希一致。没有 pending/sending/uncertain 任务，没有本次额外发送。
- 游戏、网关、安装包服务的容器 ID、镜像、启动时间和重启次数全部一致。没有运行之前暂停的 0.7.37 主程序部署脚本。
- 下一次自动生成的日报采用新的降序，正常定时发送继续运行。

## 回滚

仅恢复报表 `.env` 的 `TELEGRAM_REPORT_IMAGE` 为旧镜像，使用 `docker compose -p jinling-mahjong-reports --project-directory /opt/jinling-mahjong/telegram-reports up -d --no-deps --no-build --wait telegram-reports`。先检查没有正在发送/待处理任务并避开零点；不要回滚状态数据库，避免重发历史报表。牌桌主程序无需重启。
