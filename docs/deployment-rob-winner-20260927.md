# 抢杠三份只付胡者：生产发布记录

2026-09-27北京时间17:27部署完成。候选镜像`jinling-mahjong:0.8.5-rob-winner-20260927`，运行节点`rob-winner-20260927`，私有服务`mahjong-rob-winner`。

## 发布范围

- 基于已部署`0.8.5-runtime-r2-20260927`镜像，仅替换`shared/engine.ts`和`shared/types.ts`及对应测试，重新生成并验证发行源码清单。
- B档抢杠由补杠者按三份全付实际胡者，不分给未胡者；余额封顶、多人胡分配沿用既有算法。
- 没有发布本地牌桌动作/按钮/特效、网页规则文案及结算解释改动；没有制作或上传APK/IPA、没有改强更策略。
- 没有修改284731第5把或其他历史账单；没有重发Telegram。

## 上线流程及结果

初查旧引擎持有1张playing桌，准备候选期间让它正常继续。切换前只读备份显示进行中桌已为0，activate将两张waiting桌移至新引擎。
原稳定入口`server-mahjong-1`未重建；Caddy、安装包服务、Telegram服务未重启。旧`runtime-r2-20260927`在退役工具确认无playing/claiming/ended后才retire，随后停止`mahjong-blue`；未迁移进行中桌，未强制收桌或踢人。

新引擎及稳定入口均healthy，重启次数0。公网`/mahjong/api/health`返回新节点与新发行。旧节点租约为0，仅保留19张closed墓碑。

## 验证

- 候选镜像114个测试文件、1497项测试通过；TypeScript与不可变源码清单检查通过。
- 第一次候选测试被macOS AppleDouble `._*.test.ts`文件拦截，未激活。保留失败产物以备审计；使用COPYFILE_DISABLE及--no-xattrs重打包后，重新构建并全量通过。没有跳过失败门禁发布。
- 切换前SQLite热备份；切换后integrity_check=ok，既有2204条round_records、2204条round_replays、8816条point_records、1条client_update_settings逐行指纹不变。
- 公网16个网页/后台HTML、JS、CSS文件哈希维持原版；积分、战绩、对账3个接口匿名均401。
- 未创建生产测试桌，未登录真实会员。本轮实际修复从新引擎接管的等待桌及新建桌生效。

## 运维位置

生产发行目录：`/opt/jinling-mahjong/releases/0.8.5-rob-winner-20260927`。
包含`before.sqlite`热备份、私密Compose/env备份、candidate-tested、tests.log、typecheck.log、manifest-check.log、activation.json、activated、candidate-health.json、data-verified.json、retired-old.json。
本地发布脚本及公网证据：`output/deploy-rob-winner-20260927/`（不提交数据库/私密配置）。
运行时Compose继续使用`/opt/jinling-mahjong/server/compose.runtime.json`。不要用旧单服务重建脚本；不要用磁盘current网页/source链接推断实际引擎版本，实际版本以runtime_config、容器发行清单和公网health为准。

如需回退新桌入口，须先恢复并验证旧节点健康，再显式activate旧节点；已在新引擎开局的桌继续留在新引擎，不覆盖数据库。
