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

## 金陵麻将统一链接

Android/iOS统一入口：`https://212.189.31.46/app/jinling-mahjong`。后台上传同应用标识的新包会替换同平台旧版本并清理旧包，链接不变；详细规则和维护方式见 [UNIFIED-RELEASES.md](UNIFIED-RELEASES.md)。

## 独立管理后台的上传发布接口

专用后台将“上传待发布包”和“确认发布”分开：完整请求接收和安装包校验通过后，文件保存在私有 `.staged` 目录和独立待发布记录中，线上版本不变。管理员核对该待发布记录的 SHA256 与 Build 后，显式发布才原子切换同平台线上版本。没有额外的人工实机安装声明步骤。Android 与 iOS 独立，上传 Android 不会修改现有 iOS。

Node 管理网关先验证自己的管理员会话，再流式代理至本服务。两个服务通过 `MANAGEMENT_API_TOKEN_FILE` 指向只读共享密钥文件，内容为 32～1024 字节随机密钥。本服务的运行用户（容器 UID 10001）必须能够读取该文件；不要把密钥放入浏览器、URL、代码仓库或发布历史。内部请求必须包含 `X-Management-Token` 和由网关认证后的账号 ID `X-Management-Actor`。密钥逐请求读取并使用 constant-time 比较，可通过替换文件轮换。未配置或不能读取密钥时，内部接口返回 `404 MANAGEMENT_DISABLED`。

| 内部接口 | 请求 | 返回 |
| --- | --- | --- |
| `GET /internal/control/releases` | 受上述服务身份认证 | `{current: [], drafts: [], history: []}` |
| `POST /internal/control/releases/upload?platform=android\|ios` | multipart `file` 和可选 `notes`（最多500字） | 新待发布包 `201 {draft}` |
| `POST /internal/control/releases/:id/publish` | JSON `{sha256, build, confirmSameBuild?}`；`build` 为字符串 | `200 {release}`，重复确认当前同一发布为 `200 {release, alreadyPublished: true}` |
| `POST /internal/control/releases/:id/discard` | JSON `{}` | `200 {ok:true}`，仅删除该待发布包的私有文件，保留审计元数据 |

版本、Build、包名、最低系统和 iOS 分发信息均读取安装包，表单不能覆盖。仅允许 `com.jinling.mahjong`；上传及确认发布都重新比较当前版本，低 Build 返回 `409 BUILD_DOWNGRADE`。同 Build 的重新签名修复必须在发布请求中明确提供 `confirmSameBuild:true`，否则返回 `409 SAME_BUILD_CONFIRMATION_REQUIRED`；警告会说明“不会触发客户端自动更新”。不要求 `installationVerified`，也不宣称已经过实机验证。

上传相同 SHA256 的已有待发布包时，幂等返回 `200 {draft, alreadyStaged:true}`；若同 SHA256 已在线且文件复核一致，则返回 `200 {release, alreadyPublished:true}`，不新增待发布包或历史记录。待发布包没有公开下载地址，不会出现在公开版本接口中。丢弃可以重复调用，不会影响其他待发布包或线上版本。

安装包上限为 `524288000` 字节（500 MiB），multipart 总请求 `Content-Length` 上限为 `524353536` 字节（另加64 KiB）。不接受 chunked 请求。服务先将声明长度的全部请求受限写入私有临时文件，未收满即拒绝；即使 multipart 关闭边界提前出现，也必须收完整个请求含 epilogue 才会解析和写入待发布记录。确认发布的 JSON 也必须完整接收。这与 Node 网关扣留最后网络块并再次鉴权的流程配合，防止上传中会话失效后提前写入。请求临时文件在结束或失败时清理；成功的待发布文件保留至确认发布或丢弃。

发布在进程内互斥锁和 SQLite 写事务内重新核验待发布 ID、确认的 SHA256/Build、当前 Build、文件 SHA256/大小与目标文件；应用记录切换、待发布状态和发布历史在同一个事务提交。失败文件清理也持有 SQLite 写事务，避免与另一个发布进程竞争。已经开始的下载持有旧文件描述符可以完成，随后请求读取新版本。旧包、旧图标及已完成的待发布文件在提交后清理；历史只保留版本、SHA256、大小、更新说明、上传/发布人和时间，以及实际 `staged`、`published`、`discarded`、`superseded`、`publish_rejected` 阶段。发布写入失败会保留旧线上版本与私有待发布包，便于重试。已发布或丢弃的旧二进制不作为历史副本保留。

iOS 只接受上传的已签名 IPA，不调用签名服务、不重新签名、不注入或改变包字节。未发现必要签名元信息、描述文件过期、App Store 包或不支持的分发方式会被拒绝；企业、Ad Hoc、开发包展示对应的设备限制和有效期。签名元信息解析不是密码学验签，也不保证设备可以安装，最终仍由 iOS 验证。Android 也保留原生安装时的最终签名验证。`minimumOsVersion` 对 Android 表示最低 API level，对 iOS 表示最低系统版本。

`release` 和 `draft` 使用 camelCase 字段：`id/platform/stage/name/packageId/version/build/size/sha256/notes`，以及毫秒时间戳 `createdAt/publishedAt`、`createdBy/publishedBy`、`productUrl/downloadUrl`、`minimumOsVersion/distribution/signingMetadataPresent/provisioningExpiresAt/installationNote`。待发布的 `stage` 为 `draft`，线上为 `published`。`validation` 包含 `canPublish/errors/warnings/currentBuild/sameBuild`；`requiresSameBuildConfirmation` 对同 Build 待发布包为 `true`，`installationVerificationRequired` 始终为 `false`。接口错误格式为 `{error, code}`，不含共享密钥和服务器文件路径。

配置 `MANAGEMENT_API_TOKEN_FILE` 后，旧站对金陵麻将的上传、修改、发布、下架、删除和展示范围写操作均返回 `409 MANAGED_RELEASE_REQUIRED`，指向 `/manage/`；即使密钥文件临时不可读，也不会重新打开旧写入口。旧站的其他通用应用和公开金陵固定入口/下载保持原状。完全未配置该变量时，旧站原有工作流保持兼容。

本地回归（Python 3.11/3.12，使用临时数据库、合成包和随机 loopback 端口，不访问生产）：

```bash
MANAGEMENT_API_TOKEN_FILE= python3 services/apk-hub/tests/test_management_releases.py
MANAGEMENT_API_TOKEN_FILE= python3 services/apk-hub/tests/test_unified_release.py
MANAGEMENT_API_TOKEN_FILE= python3 services/apk-hub/tests/test_delete.py
```
