# 无花果修复生产部署

2026-09-28北京时间15:52按用户授权激活 `jinling-mahjong:0.8.8-no-flower-20260928`，运行节点 `no-flower-20260928`，私有服务 `mahjong-no-flower`。

## 范围

基于生产 `0.8.8-closed-kong-20260927`，服务端计分源码仅更新 `shared/scoring-nanjing.ts` 的无花果资格：先检查门清或其他独立免花资格，再计零硬花加分。补杠/暗杠/直杠门清、杠费、外包及抢杠赔付不变。发行同时携带相关规则说明和回归测试，不混入未上线的UI/明牌载荷等其他变更；网页静态资源与安装包未更新。

源码SHA256：`461eb30685e7c70de79f004c8ff461d8ee5b4ebddefe0ced7e3898b630cdc049`。版本号仍为0.8.8，用独立runtime release标识本次服务端补丁；强更设置不变。

## 进行中牌局保护

切换前热备份显示878960第3把正在进行；该整桌仍归 `closed-kong-20260927`，未迁移、未重启原引擎、未收桌或踢人。激活仅迁移2张waiting桌，新桌进入修复版。把间ended也按进行中整桌保护，因此不能说所有旧桌已在中途改成新规则。

稳定前门、两个旧引擎、Telegram报告、安装包服务与Caddy的容器ID、启动时间、重启次数切换前后完全一致。旧引擎未退役；必须等其playing/claiming/ended全部结束后才能另行退役。

## 验证与备份

- 候选隔离容器不接生产数据库，116个测试文件1576项全部通过，TypeScript及发行源码清单校验通过。
- 首次候选验证有两项失败：旧测试期待已废弃的抢杠文案；重连测试的随机牌局提前整桌结束，未到目标ended阶段。修正文案断言（与已部署的抢杠规则一致），未修改计分代码或删测试，第二次全量全部通过。首轮日志保留 `tests-attempt1.log`，最终结果在 `tests.log`。
- 部署锁、候选镜像ID检查、生产SQLite热备份、候选健康检查均在激活前完成。
- 2483条既有局记录、2483条回放、9932条积分流水、1条强更策略原始行指纹不变，数据库integrity_check=ok；原进行中桌归属保持。
- 公网健康核验见 `output/deploy-no-flower-20260928/public-verification.json`，未登录真实会员或创建生产测试桌。

生产审计目录：`/opt/jinling-mahjong/releases/0.8.8-no-flower-20260928`，包含before.sqlite、私密运行配置备份、candidate-tested、源码manifest、tests.log、typecheck.log、activated、activation.json、data-verified.json、status-after.json。

历史账单不回算、不重发Telegram表格。本次没有打包、发布APK/IPA；旧安装包本地听牌提示和规则说明须后续客户端更新，服务端已对进入新版的桌执行修复后的胡牌资格。
