# 0.8.0 / Build 77 服务端部署

2026-09-25 10:20（北京时间），经用户明确授权，通过指定跳板机连接生产服务器，部署提交 `1e620b1`。

- 主服务镜像：`jinling-mahjong:0.8.0-build77-20260925`，健康检查通过，重启次数 0。
- 网页 `/play/`、后台 `/manage/`、源码 current 同步切换；保留旧散列静态资源供已打开的页面使用。
- 新的管理员不可被邀请限制生效；没有改动计分、胡牌、超时规则。四个规则核心文件与旧服务逐文件哈希一致。
- 未上传或替换 APK/IPA；安装包服务、Telegram 报表容器和网关的 ID、启动时间、重启次数保持不变。
- 强制更新策略原样保留：enabled=true，minimumVersion=0.7.37，revision=1；没有提高最低版本。

## 验证与备份

- 切换前多次检查：仅两张无人等待桌，无 playing/claiming/ended 对局。
- 在线一致性备份后，停止主服务再核查并二次备份；两份数据库 SHA-256 相同，integrity_check=ok。
- 备份路径：`/opt/jinling-mahjong/database-backups/0.8.0-build77-20260925/cutover-20260925T022003Z/stopped/final-backup.sqlite`。
- 数据库 SHA-256：`9672821b5613dac979e191aced6ac2c7e998f3c015180f33851afc2c59f4beb7`。
- 账号、战队归属、局/桌战绩、回放、归档、积分记录、费用结转、公告与阅读记录、强更策略表的行数及内容哈希在切换前后保持一致。
- 部署前日志保存在备份父目录 `server-before.log`，用于后续历史故障分析。
- 隔离候选容器在 NODE_ENV=test 下 94 文件、1351 测试通过。首次继承 NODE_ENV=production 时一项头像 URL 测试因 /mahjong 前缀与测试预期不同失败；恢复标准测试环境后全量重跑通过，未修改测试断言或生产配置。
- 网页 366 文件、后台 6 文件在服务器发布目录与构建产物逐文件匹配。公网健康接口返回 0.8.0；网页/后台入口、入口 JS/CSS、Cocos index 哈希匹配。受保护后台接口匿名访问仍为 401。
- 本地验证材料：`output/deploy-0.8.0-20260925/`；服务器候选及测试日志：`/opt/jinling-mahjong/releases/0.8.0-build77-20260925/`。

## 回滚

先确认维护窗口和进行中牌局，再恢复上述备份父目录的 server.env，仅重建 Compose 项目 server 的 mahjong 服务，恢复 previous-links.txt 中三个 current 链接。不要以旧数据库覆盖切换后产生的新数据，也不要重启报表、安装包或网关服务。
