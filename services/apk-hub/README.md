# 应用分发平台迁移

来源：SafeLink-212（212.189.31.87）`/opt/apk-hub`、`/var/lib/apk-hub`。
目标：212.189.31.46，`/opt/apk-hub-migration`。

- 应用广场：https://212.189.31.46/
- 后台：https://212.189.31.46/admin
- 后台密码：沿用旧平台的管理员密码，仅在服务器私有环境文件保留密码哈希。
- 单应用链接：`https://212.189.31.46/app/应用编号`。
- 原应用编号、安装包、图标、说明、下载统计、发布和仅链接状态保留。
- 迁移副本清除旧管理员会话，需重新登录。
- 与麻将服务共享 HTTPS 网关，麻将的 `/mahjong` 路由保持不变。

## 日常维护

源码在仓库 `services/apk-hub/`，`app/` 包含已部署的服务及前端。后台支持删除应用，需确认应用名称，并校验管理员会话与 CSRF；删除后安装包、图标和记录一并移除，分享链接失效。

安装包、数据库、管理员密码配置不纳入版本控制。部署时保留服务器上的 `data/` 和 `service.env`，仅更新源码及容器配置。容器需要已有的 `jinling-mahjong_default` 网络与 HTTPS 网关。

删除功能测试（Python 3.11 或 3.12）：`python3 services/apk-hub/tests/test_delete.py`，使用临时数据库和测试文件。

在新服务器执行：

```bash
cd /opt/apk-hub-migration
docker compose -p apk-hub ps
docker compose -p apk-hub logs --tail=100 apkhub
```

安装包在 `data/packages`，图标在 `data/icons`，数据库在 `data/hub.db`，管理员密码哈希在 `service.env`。备份时使用 SQLite 在线备份，并同时保留安装包、图标及私有环境文件。不要将私有环境文件提交到 GitHub 或放入公开下载目录。

HTTPS 复用现有 IP 证书与自动续期任务。网关路由在 `/opt/jinling-mahjong/server/mahjong.routes`，迁移前副本位于 `/root/apkhub-migration-20260918/mahjong.routes.before`。

旧站保留，旧链接暂时仍指向旧服务器；新的分享链接使用新地址。两个后台的数据不会自动双向同步，以新后台为后续发布入口。
