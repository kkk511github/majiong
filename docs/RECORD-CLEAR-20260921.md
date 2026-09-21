# 2026-09-21 00:02 北京时间战绩清空

用户授权：仅清战绩、回放及相关统计，账号、密码、战队、成员归属、开桌权限、配置、审计、已发报表均保留。正在进行的牌局继续，保留牌张、牌墙、局号、分数、设置以及尚未结束的当前回放。

按用户最新指示，**执行时间仍为 9 月 21 日 00:02，数据边界改为 9 月 21 日 00:00**。`scripts/clear-game-records.ts` 是一次性命令，只接受 `--before 2026-09-21T00:00:00+08:00`，默认只读预演。只清理严格早于零点的数据，零点及之后（包括 00:00–00:02）的新记录全部保留；独立的 `RECORD_CLEAR_NOT_BEFORE` 固定为 `2026-09-21T00:02:00+08:00`，不会因数据边界提前而允许提前执行。生产清空前必须部署识别 `record_clear_fee_carryover` 的游戏服务和日报 worker，保持现有仅 `guanli@1` 能开桌的权限实现。

9 月 21 日 00:00 照常发送 9 月 20 日日结。新日结从 9 月 21 日 00:00 开始统计，首发 9 月 22 日；新周结同样从 9 月 21 日 00:00 开始，满七天后首发 9 月 28 日。报表配置及维护 wrapper 由对应部署步骤同步更新，本清理命令不修改报表配置。

## 部署和执行

1. 先运行下面的离线测试；在独立备份副本上预演并检查 JSON 中的删除数量和受保护表摘要。
2. systemd 定时执行时间应为 `2026-09-20 16:02:00 UTC`，即北京时间 9 月 21 日 00:02；命令本身也拒绝提前 apply。wrapper 获取维护互斥锁，停止游戏服务和报表 worker，并阻止自动重启，确保没有保留旧内存状态的服务实例继续写库。
3. wrapper 一致备份报表队列和主库；若有截至当天 00:00 已到期、尚未生成文档的报表，先从完整战绩生成并冻结其文档。核心清空命令不发送 Telegram，不改报表配置、token 或已发送报表。
4. 停服确认后执行核心命令，保存 JSON receipt。核心还会为本次清空创建独立、完整、权限 `0600` 的主库备份；备份路径必须是不存在的新路径，父目录须已存在且只供受信任运维访问。
5. 核心成功才启动支持费用标记的原功能服务。核对 receipt 中 `verified:true`、受保护表摘要、服务健康和 `guanli@1` 开桌权限。保留备份和 receipt；用户账户与队伍不需要重建。

```sh
# 只读预演，可以在授权时刻前运行
tsx scripts/clear-game-records.ts --database /data/mahjong.sqlite \
  --before 2026-09-21T00:00:00+08:00

# 由已停服的维护 wrapper 在授权时刻执行。备份文件名应每次唯一。
tsx scripts/clear-game-records.ts --database /data/mahjong.sqlite \
  --before 2026-09-21T00:00:00+08:00 --apply --service-stopped \
  --backup /private/backups/mahjong-before-clear-20260921-000200.sqlite

vitest run tests/clear-game-records.test.ts tests/records-practice.test.ts tests/telegram-reports.test.ts
tsc --noEmit
```

Node 运行时需支持 `node:sqlite` 的 `DatabaseSync` 和 `backup` API；部署镜像应先在临时数据库通过同一测试。CLI 不提供强制提前执行选项；测试只通过导出函数注入测试时钟。

## 清空范围和保证

- `round_records`、`match_records`、`point_records` 按 `at` 删除旧行；回放按其结束时间删除。未结束回放保留。
- `rooms` 行全部保留，只删除旧 `history` 项和已结束的旧 `replay`；其余所有字段和 `updated_at` 不改。旧归档删除；较新归档仍会去掉旧历史以防重启恢复旧流水。
- 历史 `round_rosters` 删除，较新战绩和正在进行回合的 roster 保留；旧 `admin_match_reads` 删除。
- 同桌费用曾归属旧首局时，为仍活跃的牌桌，以及延迟执行时已经有新战绩的牌桌，只保留 `(game_id, account_id, cleared_before)` 标记，防止新首局重新扣费。这里没有旧分数、牌谱、名字或队伍归属。
- 所有其它表，包括 `accounts`、`teams`、`team_memberships`、`sessions`、`table_permissions`、`account_audit`、报表配置与队列，均用完整行摘要证明完全不变。保留的战绩行和牌局字段另作逐行精确校验。

核心在 `BEGIN IMMEDIATE` 写锁内从独立只读连接做 SQLite 一致备份，检查完整性、schema 和全部行摘要，刷盘备份和目录后才开始删除。同一个事务执行清理与校验；任何失败回滚。失败时 stderr 给出原因、退出码为 1，成功退出码为 0。成功 JSON 包含 `mode`、`before`、`backup`、`counts`、`protectedTables` 和 `verified:true`，不会输出密码、会话或报表内容。

重复运行同一边界不再删除新数据，也不修改既有费用标记；需换一个备份文件名。进程异常退出可能留下 `mahjong.sqlite.clear-game-records.lock`，需确认没有维护进程、服务已隔离且数据库完整后才能手动移除。备份失败、损坏数据、时间不一致、锁冲突或校验失败均不得跳过保护继续清空。

如需恢复，先停所有写入方，再从经过验证的完整备份恢复；不要把旧数据库直接覆盖到正在使用的 WAL 数据库上。恢复会同时恢复清空前战绩，应作为人工处置，不能由定时器自动反复回滚线上库。

## 已部署的定时任务

2026-09-20 已在服务器 `212.189.31.46` 完成最新配置：

- `jinling-record-reset-20260921.timer` 已启用且处于等待状态，下一次触发为 `2026-09-20 16:02:00 UTC`，对应北京时间 9 月 21 日 00:02；`Persistent=yes`。
- 数据清理边界为北京时间 9 月 21 日 00:00，独立的最早执行时间仍为 00:02。0 点至清理前两分钟的新战绩会保留，参与新周期统计。
- 清理 service 尚未启动，`state/result.json`、`state/done.json`、`state/runtime.json` 均不存在；现场旧战绩仍在，没有提前清空。
- 游戏进程未重启；报表 worker 已换为兼容镜像且心跳正常。游戏下次启动的持久配置已指向支持费用承接标记的镜像，保持原开桌权限。
- 维护目录为 `/opt/jinling-mahjong/maintenance/record-reset-20260921`，执行结果为该目录内的 `state/result.json`。健康探针使用严格 TLS 的 `https://212.189.31.46/mahjong/api/health`。
- 本地部署证据为 `output/bot-team-reports-20260920/maintenance-timer-installed.json`、`midnight-boundary-install-result.json` 和 `midnight-boundary-verification.json`。最新代码全部 979 项单测通过，真实私有数据库副本及新时间边界的隔离验证通过；线上正式清理仍待上述时刻执行。

日结保留现有每天零点的连续排期和全部历史发送回执：9 月 21 日 00:00 照常发 20 日，9 月 22 日 00:00 发新周期的 21 日。三个周结计划均已把首次发送边界改为 9 月 28 日 00:00，完整覆盖 21 日至 27 日，再每 7 天发送；迁移前确认三个周结没有已产生任务，只修改对应计划配置，日报及已发送记录均不变。配置迁移证据为 `output/bot-team-reports-20260920/weekly-start-migration-result.json`。

本任务的自动核验会在 9 月 21 日 00:05 起只读检查结果；核验不重新执行清空、不恢复旧数据库、不发送 Telegram。
