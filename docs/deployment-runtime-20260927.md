# 按桌多版本生产接入记录

2026-09-27北京时间04:47，按用户授权在没有进行中对局的窗口启用。

## 当前状态

- 发行镜像：`jinling-mahjong:0.8.5-runtime-r2-20260927`。
- 稳定入口：`server-mahjong-1`，原Caddy仍访问`mahjong:8787`。
- 初始引擎：`server-mahjong-blue-1`，节点`runtime-r2-20260927`，只走Docker私有网络，无宿主端口发布。
- 初始两张等待桌迁入该引擎，`runtime_config.accepting=1`。首次启用不保留未适配的旧单服务写进程。
- `.env`使用绝对路径`COMPOSE_FILE=/opt/jinling-mahjong/server/compose.runtime.json`。后续禁止继续用旧单服务发布脚本重建稳定入口。
- App版本仍为0.8.5，未打包或发布任何手机安装包。网页和后台资源维持已上线0.8.5版本。

## 验证证据

- 候选Docker：114个测试文件、1496项测试通过，TypeScript通过。
- 独立Node进程：强杀旧引擎、等待真实租约到期、原版本恢复、旧桌重连、重复杠牌请求不重复计分、准入回退不迁移候选已开局桌、跨版本管理员操作及会话撤销通过。
- 不同发行Docker镜像：隔离生产数据库副本、仅合成账号/牌局，验证旧桌/新桌分流、入口重启路由恢复、旧引擎强杀恢复、禁止提前退役、退役后保留旧桌连接等。
- 完整生产Compose配置在独立私有网络和数据库副本上成功启动、核验权限并回退；刻意从非项目工作目录执行，验证绝对配置路径。
- bootstrap回退只删除协调元数据与写保护，不恢复数据库；旧单服务能在回退后的副本启动。两份副本原有财务和政策行指纹保持不变、integrity_check为ok。
- 生产停止前及停止后二次确认无playing/claiming/ended；两次备份哈希相同。
- 公网健康、匿名HTTP/WS拒绝、原生CORS通过。未登录真实会员，未创建生产测试牌局。
- 公网16个HTML/JS/CSS文件哈希与原0.8.5一致，对账、积分、战绩3个额外接口匿名访问均401；新前门与初始引擎均healthy、重启次数0，启动后错误日志计数0。
- 对账抽查：100031在9月25日131.5、100082在9月25日0、418990在9月26日57.5。
- Caddy、安装包服务和Telegram报表容器ID、启动时间、重启次数前后一致。未修改历史结算，未重发Telegram。

## 发现及处理

1. 旧npm启动包装进程未可靠释放运行租约。正式Compose使用直接Node命令与init，强杀后保留30秒租约保护，不手工清租约。
2. 未适配的0.8.5单服务在跨进程中出现SQLite延迟事务升级锁冲突。写事务改为BEGIN IMMEDIATE；旧玩法基线只补并发适配后，完整演练无此错误。旧未适配镜像不得直接加入运行集群。
3. 第一次生产接入因相对COMPOSE_FILE路径解析失败而中止，新引擎尚未启动、运行时数据库表尚未建立。原单服务于04:43恢复健康，既有数据未变。修复为绝对路径并增加完整Compose演练后，第二次接入成功。

## 备份与运维

成功备份目录：`/opt/jinling-mahjong/database-backups/0.8.5-runtime-r2-20260927/bootstrap-20260926T204701Z`。

停止后数据库：`stopped/final-backup.sqlite`，SHA256 `dfeef293d46fe4eee9e39a6236a4b78053b5c341ef037aef2300205782220e85`。

生产发行目录保存：`candidate-tested`、`compose-tested`、`tests.log`、`data-check.json`、`lab-final.log`、`compose-lab.log`、`activate-v2.log`、`activated-backup`及运行日志。私密配置、账号和数据库副本不进入Git。

后续兼容性发布：先启动新ID的私有引擎、验证、activate；旧桌保持原版本至整桌结束后retire并停止旧容器。入口本身及破坏性数据库变更仍需维护窗口。不要执行整栈`down -v`，不要恢复备份覆盖进行中的数据库。详见`runtime-rollout.md`。
