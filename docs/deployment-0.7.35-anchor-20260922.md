# 全球独钓架牌服务端修正部署

部署日期：2026-09-22。客户端版本仍为 v0.7.35 / Build 73，未重新打包或替换 APK、IPA、网页资源。

## 变更范围

- 全球独钓四组均允许碰、明杠或暗杠。第四组完成后首次出牌建立架牌，杠先正常收分、补牌。
- 三嘴和三清即时外包继续优先；已经立即结算的牌局不进入架牌流程。
- 架牌范围、实际胡牌才收50/100外包、改听永久取消、旧明碰存档兼容均保留。
- 以线上 `jinling-mahjong:0.7.35-build73` 为基础，仅更新 `shared/engine.ts`、`shared/reference-rules.ts`、`shared/types.ts` 及架牌专项测试。
- 部署期间本地新增的战绩字段改动未带上线；未修改这些本地工作文件。

## 线上状态

- 容器：`server-mahjong-1`
- 镜像：`jinling-mahjong:0.7.35-build73-anchor-20260922`
- 部署源码：`/opt/jinling-mahjong/releases/0.7.35-build73-anchor-20260922`
- 备份：`/opt/jinling-mahjong/backups/0.7.35-build73-anchor-20260922`
- 备份包括 SQLite 一致性快照、原 `.env`、compose 配置；SQLite `integrity_check` 为 `ok`。
- 通过 compose 仅重建麻将服务，保留原数据卷及网络，未重启下载服务和网关。
- 切换前无进行中对局；重启后两张等待桌仍在，归档牌桌记录仍为43条。
- 公网 `/mahjong/api/health` 返回 `ok: true`、版本 `0.7.35`；容器健康、重启计数0，启动日志无报错。
- 公网 `/mahjong/ws` WebSocket 握手通过；未创建测试账号或正式牌局。

## 校验

新镜像内类型检查及6个测试文件共272项专项测试通过。上线后三份规则文件的 SHA-256：

```text
f8db13580916a9fefebfe545d3b120c634ac3a5543c306755a144a5ca67136c4  shared/engine.ts
c7d0db5ec097b894d16b1c5b14a8fed5ab348d6d4879111a134f0afbc8f90546  shared/reference-rules.ts
4f8a53d52842b69bf0f01dd85f66e65865dfc2a6f1e4068e4ce3a92d17a5e07c  shared/types.ts
```

## 回滚

保留了旧镜像。需要回滚时，把 `/opt/jinling-mahjong/server/.env` 的 `MAHJONG_RELEASE` 改回 `0.7.35-build73`，再运行 `docker compose --project-directory /opt/jinling-mahjong/server up -d --no-deps --wait mahjong`。

不应直接恢复旧数据库覆盖上线后的新战绩。旧代码不识别新杠牌架牌来源，回滚应在无进行中对局时进行。
