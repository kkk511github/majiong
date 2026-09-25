# 客户端版本统计部署

2026-09-25 11:08（北京时间），按用户“修改部署”请求更新服务端及管理后台。

- 镜像：`jinling-mahjong:0.8.0-client-versions-20260925`。健康检查通过、重启次数0。
- 后台入口：人员管理 → 更新情况。版本口径与使用方式见 [说明](client-version-reporting.md)。
- 新增 client_version_reports 表、版本索引和删号清理触发器。认证后的 hello 保存最后上报，包含被强更拒绝的旧客户端；不伪造历史数据。
- 不修改客户端包、网页牌桌、业务规则、账号权限及强更设置。版本仍为0.8.0，无需重打APK/IPA。
- 切换前无进行中牌局；切换前后两次一致性备份 SHA-256 相同，数据库完整性检查通过。
- 备份：`/opt/jinling-mahjong/database-backups/0.8.0-client-versions-20260925/cutover-20260925T030836Z/stopped/final-backup.sqlite`。
- 备份 SHA-256：`911959d97619cafccced9ad605417d4abed2597e310ecef25e88011b742748fd`。
- 原账号、战队、战绩、回放、积分、公告及阅读数据、强更策略逻辑内容哈希均保持一致。报表服务、安装包服务、网关未重启。
- 本地及隔离候选容器：95文件、1354测试通过；管理后台浏览器12项检查通过，含手机尺寸统计筛选。
- 公网后台入口及入口JS/CSS与本地产物哈希一致；匿名读取成员统计仍为401。部署后已观察到真实账号上报写入，新表不是测试数据。
- 新代码以显式 delta.tar.gz 冻结部署；发布目录 `/opt/jinling-mahjong/releases/0.8.0-client-versions-20260925/`，其中 source 是上一发布完整源码加本次 delta 的副本。
- delta SHA-256：`963c77f52bb8147510f3597f03f85c8e72cb37b161b0a58258a9f9170a167f2d`。
- control.tar.gz SHA-256：`546576a96ce552cbdc6d363f19648ecf4a8b914142d689e9ef1d57e867372289`。

回滚仅恢复该备份父目录的 server.env、previous-links.txt 中后台及源码链接并重建 mahjong 服务；新版本记录表可以保留，旧服务忽略它。不要恢复旧数据库覆盖新产生的版本报告或对局数据。
