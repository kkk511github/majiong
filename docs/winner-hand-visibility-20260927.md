# 只让胡牌者倒牌

用户要求：谁胡谁倒牌，其余玩家不自动明牌。实战视图中，本家始终能看自己的手牌；本家未胡时维持站牌，不向他人亮出。

- `viewFor`：仅在ended/finished且result.reason=hu时公开winners的手牌；其他玩家hand为空但handCount保留。未胡者暗杠仍沿用只公开一张牌面的规则。
- 实时history也做同样的接收者投影，防止通过本把历史载荷旁路看到未胡者暗牌；不修改服务器保存的完整战绩/回放。
- `cocosState`：即使旧服务端仍发送四家明手，也只接受本家和确认赢家的牌面。
- `revealedWinners`独立驱动倒牌。本家胡牌时由真正的桌面3D平放牌模型接管，其他本家手牌维持原站牌；旁家胡牌在各自原牌架亮出，不把四家一起翻开。
- 多家胡亮全部真实winners；流局、解散和非胡牌破产结束不自动全亮。
- 回放“当前视角”不再因为finish自动四家全亮；用户主动选择的“四家明牌”复盘功能保留。

验证：`tests/winner-hand-visibility.test.ts`覆盖四赢家×四观看座位、实时历史不泄露、原数据不变、旧服务端载荷过滤、多家胡和非胡结束。Chromium/WebKit真实Cocos检查确认只有赢家生成倒牌模型，截图`output/qa/action-jade-v2/*-winner-only-*.png`；构建日志`.tmp/winner-hands-build.log`，浏览器日志`.tmp/winner-only-browser.log`，全量测试日志`.tmp/winner-only-all-final.log`。

原有三处“结束即全明牌/历史原样公开”的测试预期同步改为新规则，同时继续验证服务器保存的原历史不变与重连续局。

本次本地实现，未部署，未制作APK/IPA。此前已部署的抢杠付款修复不等于本次倒牌策略已经上线。上线需服务端更新，原生客户端的本家3D倒牌和旧载荷防御需随新包交付。
