# 四连风终桌保米发布（2026-09-30）

## 发布内容

- 候选/生产镜像：`jinling-mahjong:0.9.1-four-winds-baomi-20260930`。
- 新桌节点：`four-winds-baomi-20260930`；容器 `server-mahjong-four-winds-baomi-1`。
- 基于已上线 `0.9.1-kong-liability-20260930` 的窄补丁，业务源码仅更新 `shared/engine.ts`，加入四连风实收终桌时保米到100。
- 新引擎 SHA-256：`f209bb02ae58a6705709dc95a346761ae86fd0a5f7a3ade3f7477c1ff8b46fe4`。
- 不改其他胡牌条件、花分、杠责任、计分倍率。没有混入本地未发布的安卓强更、牌桌UI等修改。

## 验证

- 本地131文件1824项测试通过，TypeScript通过。
- 生产候选隔离环境（无生产数据库挂载、无网络）120文件1619项测试通过，TypeScript及部署manifest校验通过。
- 首轮候选被macOS AppleDouble隐藏文件引发的两个“测试文件解析失败”拦住，1619项实际测试均通过。随后重新制作无扩展属性归档，Docker改为显式复制三个目标文件并排除`._*`；第二轮完整通过后才生成`candidate-tested`，未跳过失败检查。第一次测试日志保存为 `tests-first-packaging.log`。
- 精确牌例及修复边界见 [517282排查](four-winds-baomi-517282-20260930.md)。

## 激活与数据保护

2026-09-30北京时间23:48，使用部署锁、候选镜像ID校验、激活前SQLite备份后切换新桌入口。

- 迁移2张waiting桌；新桌使用修复版。
- 备份时进行中的355717第1把、877425第4把仍由原`kong-liability-20260930`节点处理，没有中途更换其整桌规则。
- 3991条局记录、3991条回放、15964条积分流水以及1条最低版本策略原始行指纹保持不变；数据库`integrity_check=ok`；旧桌节点归属核验通过。
- 所有原有牌局容器、稳定前门、网关、Telegram和安装包服务的容器ID、启动时间及重启次数不变。未收桌、踢人或重启旧服务。
- 新服务健康接口返回目标`runtime.release`与`protocol=1`。顶层package版本沿用基线0.8.8，不表示引擎未升级。
- 23:48:45公网健康验证命中新节点，管理员积分与战绩接口匿名访问仍为401；运行中引擎哈希与候选一致，`scoring-nanjing.ts`及`nanjing-rules.ts`与基线哈希一致，新容器healthy且重启次数0。

审计目录：本地 `output/deploy-four-winds-baomi-20260930/`，远端 `/opt/jinling-mahjong/releases/0.9.1-four-winds-baomi-20260930/`。

此服务端修复不要求用户重装App。517282历史账单没有补款或重算；未重发Telegram账单、创建真实测试局、打包APK/IPA、push或更换网页静态资源。本地规则说明已补充，之后客户端发布时带入。
