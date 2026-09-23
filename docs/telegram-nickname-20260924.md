# 日结、周结显示昵称（2026-09-24）

- 查询仍按账号ID独立汇总，新增读取 `accounts.name` 昵称；保留账号名仅供历史数据兼容回退。重名不会合并。
- 新 XLSX 第 C 列从「用户名」改为「昵称」，日结和周结都使用当前昵称。只有昵称缺失/空白才回退账号名；公式式昵称按字符串显示，长昵称按已有规则换行。
- 玩家ID、分数/局数、金额公式、合计和模板样式不改。日结金额降序继续保留，周报原顺序不变。
- 历史已保存文件、CSV兼容路径、发送计划和收件群不改，不重算或补发已发送报表。

验证：本地与 Linux 候选报表容器的48项报表测试通过，包括昵称来源、同名、空昵称回退、公式安全、长昵称、排序和重试快照；完整项目1298项测试通过。

生产只切换报表镜像：`jinling-mahjong:reports-nickname-20260924`，旧镜像为 `jinling-mahjong:reports-daily-amount-desc-20260923`。生效时间约北京时间2026-09-24 00:27:52，healthy，RestartCount=0。

备份目录 `/opt/jinling-mahjong/telegram-reports/releases/nickname-20260924/` 中保存一致性 SQLite 备份、配置副本和核验结果。切换前后6条发送记录/保存文件、4条计划及配置内容哈希完全一致，本次额外发送0份。游戏、网关、安装包容器ID/镜像/启动时间/重启次数均未变化。主服务仍为0.7.35，尚未执行之前暂停的0.7.37主程序部署。

运行文件 SHA-256：

- `server/telegram-reports.ts`: `b4463d18d791c1c5136e05564dbe5af3647a6a4f5b1490853dfcb16c287b3345`
- `server/report-xlsx/workbook.ts`: `f4bbfd160c443e41c3e07d82706cdd8dcf4aa7a89b6c47cb5dc7b1746e523f0f`

如需回滚，只将报表 `.env` 的 `TELEGRAM_REPORT_IMAGE` 恢复旧镜像，在确认无待发/发送中任务后仅重建 `telegram-reports` 服务。不要恢复旧状态数据库，避免重发。
