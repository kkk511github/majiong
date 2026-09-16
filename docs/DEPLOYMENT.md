# 对局服务部署

## 2026-09-16 发布目标

当前 App 配置连接 `https://212.189.31.194/mahjong`（SSH 别名 `212-majiong`）。0.7.4/build40 已部署，容器健康，完整结果见 [发布说明](RELEASE-0.7.4.md)。已保存数据库备份、验证副本启动和生产数据行数，原0.7.3-build39镜像保留用于回退。以下 SafeLink-212 地址和0.4.0记录仅为历史资料。


2026-09-13 已按用户确认部署到 SafeLink-212（212.189.31.87）。

0.3.1 已完成四真人公网联机，以及两位真人先准备、再补两位电脑的顺序回归，结果见 deployment-0.3.1-four.json 与 deployment-0.3.1-bots.json。当前容器健康，持久卷和代理配置沿用。

## 当前 0.4.0 服务

0.4.0 已部署至 `releases/0.4.0-8455494c`，`current` 已切换，容器健康。上传包 SHA-256：`8455494c647509386ef4927b2bb91eecda9b49db2f21c2dc90db3a54a237f7f7`。新增数据库表为兼容迁移，部署前已使用 SQLite backup API 保存一致备份于服务器 `/opt/jinling-mahjong/database-backups/0.4.0-8455494c.sqlite`，原持久卷继续使用。公网大厅完整检查见 [table-lobby-public-0.4.0.json](table-lobby-public-0.4.0.json)。部署包前端未对外开放；最后的原生重连提示修正只改客户端，后端逻辑与该发布包一致。

复核新大厅：`npx tsx scripts/check-table-lobby.ts https://safelink.chat/mahjong`。脚本使用临时身份，结束后清理所有验收桌。

## 0.3.1 历史部署信息

- HTTPS 后端入口：`https://safelink.chat/mahjong`。
- 健康检查：`https://safelink.chat/mahjong/api/health`；WSS：`wss://safelink.chat/mahjong/ws`。
- 部署目录：`/opt/jinling-mahjong/current`，指向 `releases/0.3.1-7b3d5373`。本次上传包 SHA-256：`7b3d537366e7b4d8b3c835598c83a721b4f89825876b3bc4be726a554a939b85`，旧版本目录保留供回退。
- Docker Compose 项目 `jinling-mahjong`，服务 `mahjong`，只映射服务器回环端口 `127.0.0.1:18887`。容器开机自动恢复，日志自动轮转，带健康检查。
- SQLite 独立持久卷 `jinling-mahjong_mahjong-data`，容器内 `/app/data/mahjong.sqlite`。
- Nginx 在原 `safelink.chat` HTTPS 站点中引入 `/etc/nginx/snippets/jinling-mahjong.locations`，使用现有有效证书。原配置备份位于 `/opt/jinling-mahjong/nginx-backups/`。本入口仅提供后端；前端界面内置在 App 中。
- `.env.native` 保存公开服务地址，`npm run native:sync` 使用 native 构建模式同步 iOS 与 Android。普通 `npm run dev` 仍使用本地后端。

已完成真实公网四客户端验证：建立原生来源 WSS 连接、创建和加入同桌、开局、手牌保密、出牌广播、同身份重连，以及重启容器后的四家手牌/弃牌/副露/牌墙余数恢复一致。验收桌已投票解散并退出。结果见 `deployment-check.json`，不等同于长时或弱网测试。

日常管理（在服务器执行）：

```sh
cd /opt/jinling-mahjong/current
docker compose -p jinling-mahjong ps
docker compose -p jinling-mahjong logs --tail 100 mahjong
docker compose -p jinling-mahjong restart mahjong
```

从开发机复核联机：`npm run check:deployment -- https://safelink.chat/mahjong`。`--pause-for-restart` 会创建验收桌并等待管理者重启此容器，只在安排好的维护窗口使用。

## 单实例

1. 准备一台支持 Node.js 24 的服务器和一个域名。
2. 安装依赖并构建，执行 `npm run server`；或使用 Dockerfile 构建并运行。
3. 将域名解析到服务器，使用 HTTPS 反向代理转发到 8787 端口，确认支持 `/ws` 升级。
4. 原生打包时将 `VITE_GAME_SERVER_URL` 设置为相同 HTTPS 域名，再执行 build、cap sync 和原生构建。
5. 在两种不同网络下，用四台设备验证加入、整局对战、后台恢复、断网重连和结算。

Caddy 示例（把域名改成自己的）：

```caddy
mahjong.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
```

## 持久化与运维

- `DATABASE_PATH` 默认 `data/mahjong.sqlite`。SQLite 开启 WAL，备份应使用 SQLite backup API 或停服后同时处理关联文件，不要只复制正在写入的主数据库。
- 健康检查：`GET /api/health`。
- 本版 WebSocket 单消息上限 8 KB，每连接每秒最多 30 条操作；10 秒未登录关闭连接，30 秒心跳检查。
- 客户端凭证为 32 字节随机值；数据库只存哈希。凭证按设备保存，昵称相同不能接管座位。
- 对局日志和反馈只保存在服务端数据库/日志，尚无完整后台 UI；不要将数据库或调试日志公开。
- 有效操作先持久化、成功后再广播；保存失败则操作不生效，可重试。重启后恢复最近 24 小时的快速好友房；0.4.0 大厅建桌不受该时间限制，持续保存设置与空桌，保留牌、分数和操作阶段，将在线状态重置，按房间设置的思考时间重设出牌期限，解散投票窗口为 60 秒。
- 已离线超过 60 秒的玩家在解散投票中自动视为同意。离线玩家未超时则仍等待投票，避免瞬时断线被强制解散。
- 当前房间保存在单进程内存，SQLite 用于恢复。**不要直接启多个实例负载均衡**，后续横向扩容需要房间路由、共享会话和跨节点恢复。

## 尚需完成的上线验证

已完成本机 100 客户端短时对局压测和数据库故障回滚测试。上线仍需跨网络及长时间稳定性、实际磁盘满后的运维恢复、用户数据删除与导出、运营后台、举报反馈处理、服务监控告警、目标渠道的资质与隐私/实名要求。

## 发行签名

Android Debug APK 仅供内部测试，不应用作长期发行包。正式 Keystore 不应由脚本临时生成后遗失，需由项目所有者保管。

iOS 开发版已使用本机现有开发签名安装并启动于用户的 iPhone 17 Pro Max。此项目的临时 Bundle ID 为 `com.jinling.mahjong`；正式分发仍需确定发行方案。仓库不包含签名私钥或设备描述文件。
