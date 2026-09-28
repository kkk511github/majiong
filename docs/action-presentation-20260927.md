# 操作、动作与扣分表现层重构

## 范围与现状

沿用TypeScript、Cocos Creator 3.8.8、原Table场景及React覆盖层。原项目操作按钮不是独立Prefab，而是TableControls生成；新ActionButtons仍接收原TableSceneCommand。服务端、规则、胡牌判断、分值计算和网络业务消息没有修改。本次未部署、未生成APK/IPA、未发布客户端。

主要实改文件：

- `src/ActionButtons.tsx`、`src/action-buttons.css`、`src/TableControls.tsx`：四按钮分层资源、状态、合法集合、捕获触摸、过/胡间隔、抬起复核及手牌输入保护。
- `cocos-table/assets/scripts/TableActionEffects.ts`、`TableScene.ts`：确认事件专用Sprite/Tween组件、四席复用、去重/替换/清理、声音落定及播放完成回执。
- `shared/action-presentation.ts`、`shared/action-anchors.ts`：统一时序、大小、弃牌区/手牌锚点及姓名避让。
- `Table3DView.ts`：补杠上层实际高度收敛至布局终点，接触阴影留在下层牌上。
- `src/CocosTable.tsx`、`GameMotion.tsx`、`audio.ts`、`voice-events.ts`：权威显示事件与点击反馈分离；动作音/报牌在落定点触发；杠后补花语音排在杠之后；退出取消自己拥有的短音源。
- `src/ScoreDebitOverlay.tsx`、`score-debits.css`、`score-debit-layout.ts`、`useScoreDebits.ts`：无框扣分、姓名及真实金额、与动作分阶段显示、完成回执故障兜底。
- `src/ReplayTable.tsx`、`ReplayPanel.tsx`、`TableWinEffect.tsx`：共用确认动作素材；暂停/恢复回放只显示轻量结果信息，不补播历史长动画。
- `src/dev/ActionStudio.tsx`：主应用内本地验收模式，仅DEV和localhost启用，不是独立HTML演示页，不连接牌局WebSocket。测试局面通过未修改的原引擎生成合法动作和结果。

## 按用户最新反馈落地

1. 四个操作按钮为墨绿/象牙/浅金的圆角方章，过为灰绿次级；没有持续光圈、下方说明文字或厚金币边框。
2. 碰、杠位于对应玩家的弃牌区域，不随已出牌张数跳动；碰1200ms、杠1450ms，放大出现、清楚停留、缩小淡出。胡保留手牌中线与1120ms；多家胡分别显示，不堆桌心。
3. 玩家/标签文字避开中间风位和重要区域，去掉姓名绿底条。动作字面向屏幕，不随左右席位旋转。
4. 相关杠扣分等Cocos实际完成回执后再出现；回执丢失有有限时间兜底。只控制展示先后，头像分数和业务状态仍随服务端立即更新。
5. 扣分取消绿色底框，金额为主、朱砂负号、姓名和原因次之；覆盖明杠、暗杠、补杠、花杠、四连风、四张同牌、四家同牌以及余额封顶实际付款。
6. 非法选择隐藏；请求后待确认/其他按钮禁用；按住时动作变化不会换成另一动作或穿透出牌。过只轻按，不发布桌面大字。
7. 简化特效开关放在已有设置区域；系统减少动态效果也生效。未新增震动。

## 资产与提示词

源稿、概念稿、真实透明主字：`art-source/actions-jade-v2/`。

运行资源：`public/ui/actions-jade-v2/`，5张PNG约0.5MB；320×320主字、256×256底板，共用资源，不新增Spine依赖。资源清单/来源/状态与完整提示词在该源稿目录README及prompts.md；生成方式为内置image_gen。金额保持动态文本，概念−15不作为金额贴图。源码与导出资源一致性由构建检查核对。

## 已运行验证

- Cocos Creator真实导出，TypeScript检查及生产网页构建/资源哈希检查。
- 整套单元测试：116文件、1507项通过。
- 新版浏览器场景：Chromium/WebKit各11项，共22项通过。包含四按钮默认/按压/待确认/禁用；四席碰杠胡；明/暗/补杠；补杠叠放终点；多家胡；重复事件；重连；连续动作替换；摸到牌插入；声音时点；简化；三种横屏尺寸；七类扣分；四视角和倍率；完成回执丢失兜底。
- 真实App入口、隔离账户及受控WebSocket：确认前不播、拒绝恢复、双击只一条请求、动作期间仍能选牌、按住时动作过期不穿透。Chromium和WebKit均通过。
- 额外Chromium可信触控事件注入：按住后状态过期，再移到手牌释放，不触发操作或选牌。WebKit不支持该CDP注入用例，明确跳过，不当成iOS真机触摸验收。
- 原有15项控件/主题/扣分回归覆盖：首轮14项通过，一项因新增姓名后旧整段文本断言失配；更新为分别核对姓名、金额、原因后单独重跑通过。
- 现有财务与牌面布局单元测试保留；规则/服务文件未改。首次与Creator构建并行执行时出现过一条既有服务续把时序断言波动，隔离及后续整套重跑通过，未修改该服务测试或服务逻辑。

最终命令结果与数目以本地验收日志为准：`.tmp/action-jade-final-unit.log`、`.tmp/action-jade-delivery.log`、`.tmp/action-authority-delivery.log`、`.tmp/action-regression.log`、`.tmp/action-regression-recheck.log`、`.tmp/action-jade-web-final.log`。

## 录屏与使用入口

本地入口：`http://127.0.0.1:5199/?actionStudio=1`。正式入口仍为`/`，生产构建不包含ActionStudio调试块。

截图、短音效离线渲染WAV：`output/qa/action-jade-v2/`。

实际浏览器录屏：`output/qa/action-jade-v2/recordings/`，含四家动作、按钮状态、补杠/多家胡/重连、插牌、各类扣分、不同横屏比例及实际App操作安全。WebM没有系统音轨；WAV由生产音效包络离线渲染，不是手机麦克风录音。没有用静态图合成或伪造“实机录屏”。

## 未验证与边界

### 同日追加：晶体按钮与连续火焰环

提示避让追加修复：WinHintPanel原先只监听操作区尺寸，遗漏React更新bottom/right但尺寸不变的位移；现监听操作区style/class变化，留12px间隔覆盖火焰边缘。极短预览区域不足一行时改用左侧空隙，移除会将提示压回操作区的54px强制顶部限制。Chromium/WebKit均通过7次横竖屏/同宽不同高度切换、提示与按钮间距、按钮中心实际命中检查（`.tmp/action-hint-gap.log`）。

按用户最新方向，实际App操作按钮换为圆润通透底材，原有四字、位置与输入防穿透机制保留。
胡使用连续一整圈火焰，不是分散的八簇；碰/杠蓝色流光节奏不同，过为中性晶体掠光。
资源/完整提示词：`art-source/actions-crystal-v3/README.md`；内置image_gen生成两张真实透明素材，打包脚本保留alpha。
待确认/禁用、简化设置和系统减少动态模式停用外圈与掠光。
本次追加未改服务端、计分规则、碰杠确认事件或扣分顺序。
本地证据：`output/qa/action-crystal-v3/`；`.tmp/action-crystal-browser.log`中六项Chromium/WebKit动效与状态/完成回执回归通过；最后连续环版本单独复测见`.tmp/action-crystal-ring.log`。

未运行本轮iOS/Android真机及原生容器验收，未测最低系统设备、真机帧率、显存或启动耗时；WebKit浏览器通过不等于iOS15真机通过。未重新打包，所以已安装手机端不会因这次本地修改自动更新。后续若发布，应将React前端、Cocos导出和运行素材作为同一版本整体构建。
