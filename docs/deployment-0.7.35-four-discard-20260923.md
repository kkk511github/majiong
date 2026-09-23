# 0.7.35 四家连续同牌服务端热更新（2026-09-23）

## 变更范围

- 生产镜像：`jinling-mahjong:0.7.35-build73-four-discard-20260923`
- 基础镜像：`jinling-mahjong:0.7.35-build73-anchor-20260922`
- 生产构建提交：`06a25dc`；合入 `main` 后的同内容提交：`191e3df`（`Fix four-player same-tile penalties`）
- 只覆盖运行时文件 `/app/shared/engine.ts`，没有重新构建或发布 Web、APK、IPA，也没有重启网关、安装包管理或 Telegram 报表服务。

## 生效规则

- 本把任意时机、任意圈，只要最近四次弃牌由四位玩家连续打出同一种牌，就由第一位出牌者向另外三家付款。
- 不限制庄家起头，不限制风牌；数牌同样适用。碰牌或任一种杠会清空当前连续记录。
- 同一把可以多次成立，每次分别罚款。
- 同一把无论成立几次，`四家跟牌` 的下一把比下胡原因只记录一次；默认下一把仍为 2 倍，不累乘成 4 倍。

## 构建与验证

- 本地 TypeScript 检查通过。
- 本地全量测试：78 个测试文件、1090 项测试全部通过。
- 新镜像 TypeScript 检查通过。
- 新镜像部署回归测试：房间 `883935` 的“先北、后四家南风”顺序，以及同一把两次四家同牌，共 2 项全部通过。
- 新引擎 SHA-256：`f2474eeb58f31373adc8c93d71edb1443c3e5ef53d28119aa0bfcb28be4f8628`。
- 新镜像 ID：`sha256:696d818ebf3466e5ddae71a93ec0e39d78bc89180139a5ae9259cfc903c5e594`。
- 严格 TLS 公网健康检查、鉴权保护、原生 CORS、匿名 WebSocket 拒绝检查均通过；服务版本仍为 `0.7.35`。

## 数据安全与上线结果

- 切换前确认在线真人、进行中牌局、最近两分钟活动会话均为 0。
- 一致性备份：`/opt/jinling-mahjong/database-backups/0.7.35-build73-four-discard-20260923-deploy/final-backup.sqlite`
- 备份 SHA-256：`bcc251ed727eb33a11f80db386aebb49daf2da8d391f00181636d1066f6f778b`，`PRAGMA integrity_check` 返回 `ok`。
- 切换前后历史记录、余额、外包责任及房间账本校验一致。
- 麻将服务于 `2026-09-23T03:07:17Z` 启动，健康状态为 `healthy`，重启计数为 0。
- 网关、安装包管理和 Telegram 报表容器的 ID、镜像、启动时间及重启计数在切换前后完全一致。

## 回滚

如需应用回滚，将 `/opt/jinling-mahjong/server/.env` 中的 `MAHJONG_RELEASE` 恢复为 `0.7.35-build73-anchor-20260922`，然后仅对 `mahjong` 服务执行 `docker compose --project-directory /opt/jinling-mahjong/server up -d --no-deps --no-build --wait mahjong`。不要用旧数据库覆盖回滚后新产生的战绩。
