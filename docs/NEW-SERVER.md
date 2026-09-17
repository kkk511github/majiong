# 新服务器全新部署

本脚本建立全新的麻将系统，**不迁移旧账号、成员、积分、牌局、报表队列或发送记录**。只沿用当前 Telegram 机器人的 token、群、日/周统计规则；新系统建立同名空战队，统计起点在安装向导中设置。

## 准备

- 全新 Ubuntu 22.04/24.04 或 Debian 12/13，root SSH 登录，建议 2 核、4 GB 内存、20 GB 可用磁盘。
- 固定公网 IPv4 **或**已经解析到新机的域名，安全组和主机防火墙放行 TCP 80、443，保留 SSH 端口。脚本不更改防火墙；内网、回环、保留 IP 不可申请公网证书。
- 新机可访问 Docker 官方软件源、Docker Hub、npm、证书签发机构、Telegram API。
- 推荐上传完整安装包，不需要在新机配置 GitHub 权限。也可直接在新机的源码仓库运行向导，此时业务代码使用已提交的 `HEAD`。
- 专用安装包已包含现有 Telegram 私密配置，安装时直接使用，不需要新服务器连接旧服。也可选择本机已上传的配置文件，或暂不配置 Telegram。

## 登录服务器后操作

可以直接从 GitHub 获取源码，不必上传完整安装包。在新服务器以 root 执行：

```bash
apt-get update
apt-get install -y git ca-certificates
cd /root
git clone --depth 1 https://github.com/kkk511github/majiong.git
cd majiong
bash deploy/install.sh
```

私有仓库需要有访问权限的 GitHub SSH 密钥或 HTTPS token，不能用 GitHub 账号密码代替。Telegram token 不存 GitHub：把单独的 `telegram-config.tar.gz` 放在 `/root/majiong/`，然后向导第三步选1。该文件很小，只含现有机器人和群/报表配置，不含游戏数据库。已存在源码目录时，应先核对其状态，再决定是否更新，不能覆盖现有部署目录。

如果使用完整安装包：

上传 `mahjong-installer.tar.gz` 到新服务器，登录后解压并运行：

```bash
tar -xzf mahjong-installer.tar.gz
cd mahjong-installer
bash deploy/install.sh
```

向导用中文逐步提示，并对输入错误重复询问：

1. 全新安装 / 仅检查环境和部署计划 / 退出。
2. 选择“没有域名，使用公网 IPv4”或“使用域名”，填写地址及证书邮箱。
3. Telegram：直接用包内现有配置 / 使用本机配置文件 / 暂不配置。
4. 填写日结与周结起点（YYYYMMDD、北京时间00:00），选择只配置或启用定时发送。
5. 管理员初始密码：自动生成 / 自己设置（两次输入，均不回显）。
6. 显示配置摘要，确认后才安装；直接回车默认取消。

“仅检查”不会联网、写配置或安装软件，适合先熟悉流程。管理员账号固定为 `guanli@1`，密码保存在新服务器 `/opt/jinling-mahjong/initial-admin-password`，只有 root 可读。安装过程会提示当前阶段及日志位置。

已取得完整源码时，可直接执行 `bash deploy/install.sh`，也可不带参数执行 `bash deploy/new-server.sh` 进入同一向导。

## 生成安装包

在开发电脑源码仓库执行：

```bash
bash deploy/package-installer.sh /绝对路径/mahjong-installer.tar.gz
```

普通安装包不带机器人凭据。生成包含现有 Telegram 的专用安装包：

```bash
bash deploy/package-installer.sh /绝对路径/mahjong-installer-private.tar.gz --telegram-from 212-majiong
```

只在制作专用包时读取一次旧服配置，新机安装时不连接旧服。专用包包含机器人 token，属于私密文件，不要公开下载、发群或提交到 Git；外层文件权限为600。不包含管理员密码、业务数据库或旧发送记录。解压后目录名为 `mahjong-installer`。业务代码来自已提交的 HEAD，重新发布代码时需重新生成安装包。

## 从开发电脑部署

原来的非交互方式仍可用。在开发电脑仓库执行，替换 IP、域名和邮箱：

```bash
bash deploy/new-server.sh \
  --host root@新服务器IP \
  --domain game.example.com \
  --email admin@example.com
```

加 `--plan` 只显示计划，不连接任何服务器。现有 Telegram 配置默认从 `212-majiong` 获取，也可通过 `--telegram-from SSH别名` 指定。不会停止、修改旧服务器，也不会读取其游戏数据库或 Telegram 发送记录。临时 token 归档权限受限，不写入日志或仓库。

脚本自动安装 Docker/Compose，上传源码、构建并测试、建立空数据库、初始化管理员、配置 HTTPS，验证 API、原生跨域、WebSocket 鉴权和 Telegram 群配置。非交互模式可将 `--domain game.example.com` 替换为 `--ip 新服务器公网IPv4`。

## 没有域名

向导中的邮箱仅作为 HTTPS 证书申请联系信息，不是 Telegram 邮箱，也不会收到统计报表。填自己常用邮箱即可，不需要邮箱密码。自动续期依靠服务器定时任务，不依赖邮件通知；Let's Encrypt 已停止证书到期提醒邮件。

向导第二步选择 `1`，输入新机真实公网 IPv4 即可。使用 Let's Encrypt 受信任的 IP 证书，不是自签证书，无需关闭客户端证书验证。IP 证书有效期约六天，脚本通过 Certbot 5.8 和 systemd timer 每六小时检查续期，成功后自动重载网关。80 端口的 ACME 验证路径必须一直可以从公网访问。

```bash
# 在部署完成的新服务器查看自动续期状态
systemctl status mahjong-ip-renew.timer
journalctl -u mahjong-ip-renew.service --since '2 days ago'
```

域名模式仍由 Caddy 自动续期。官方说明：[Let's Encrypt IP 证书](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。

管理员账号 `guanli@1`，随机初始密码只保存在**新服务器** `/opt/jinling-mahjong/initial-admin-password`（600 权限），首次登录必须改密。

## Telegram 启用

日结、周结分别输入起始日期，例如都填写 `20260918`：

| 类型 | 统计开始 | 首次发送 | 后续周期 |
| --- | --- | --- | --- |
| 日结 | 9月18日00:00 | 9月19日00:00 | 每天 |
| 周结 | 9月18日00:00 | 9月25日00:00 | 每7天 |

全部使用北京时间，区间包含起点、不包含终点。周结输入留空默认使用日结起点，也可另选日期。若起点已过去，启用后会补发从该起点开始已经到期的周期；新库没有的旧数据不会恢复，可能产生空报表。起点不是“立即发送时间”。

默认复制并验证配置，但暂不启动定时发送，避免新旧服同时向现有群发送各自报表。确定旧服统计已经停用后，可在首次部署命令加 `--start-telegram`；或安装后在新服执行：

```bash
docker compose -p jinling-mahjong-reports \
  --project-directory /opt/jinling-mahjong/telegram-reports up -d --wait
```

沿用同一个机器人、同一个群和现有战队报表合并方式，新服发送状态从空记录开始。新成员需要重新注册和分配战队。

## 客户端地址

目前已发布 APK/IPA 使用固定 IP `https://212.189.31.194/mahjong`。新机部署不会自动修改旧安装包地址。需要保留原 IP、把原入口转发到新服，或将 `VITE_GAME_SERVER_URL` 改成新域名后重新发包。客户端以后固定使用域名，再次换机可以通过修改 DNS 切换。

## 运维

- 游戏配置：`/opt/jinling-mahjong/server`。
- Telegram 配置：`/opt/jinling-mahjong/telegram-reports`。
- 源码：`/opt/jinling-mahjong/releases/时间-提交号`，提交记录在 `DEPLOYED_COMMIT`。
- 游戏数据卷：`jinling-mahjong_mahjong-data`；证书和 Telegram 状态也使用独立持久卷。
- 构建与测试日志：`/opt/jinling-mahjong/build-*.log`、`test-*.log`。
- 验收结果：`public-check.json`、`telegram-check.json`，都在 `/opt/jinling-mahjong/`。

```bash
docker compose -p jinling-mahjong --project-directory /opt/jinling-mahjong/server ps
docker compose -p jinling-mahjong --project-directory /opt/jinling-mahjong/server logs --tail 100
```

这是新机安装脚本。80/443 被占用、已有麻将容器或数据卷时会拒绝，不覆盖原站点或数据库。安装失败保留数据、配置和日志，尝试停止本次启动的服务；排除故障后可以从对应 Compose 目录继续启动和验收，不要删除数据卷来绕过检查。已有 Docker 必须正常运行并提供 Compose v2。

本脚本不打 APK/IPA，不配置企业签名或下载页。执行脚本前，当前服务器保持原样。
