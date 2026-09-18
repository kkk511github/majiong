# 战绩与开桌视觉更新

按已确认的三屏设计实现，未改算分规则或音频。

- 战绩首页：日期筛选横排，全部/今天/昨天/近7天/指定日期；四家积分并列。
- 详情：默认本把明细，左侧选把数，事项/付分方/收分方/分数逐笔列出，保留桌外标注、开始结束余额和胡牌分项。移除摘要/反馈入口；保留回放及整桌明细。
- 开桌：正常载入时约2.2秒的立体场景推进、金色开局、淡出到实际 Cocos 牌桌；慢加载期间镜头和金光持续运动，牌桌就绪后才完成转场。可跳过；减少动态效果设置仅保留短淡入淡出。断线恢复、回放、过期提示或已有出牌时不播放。

## 生成素材

使用内置 imagegen，未使用 CLI/API fallback。素材已保存并由代码消费：

- `public/art/records/jiangnan-records-v1.webp` — 2172×724，约75 KB。
- `public/art/opening/table-arrival-v1.webp` — 1920×960，约221 KB。
- `public/art/opening/start-gold-v1.webp` — 1100×550，约220 KB，保留透明 alpha。

最终提示词：

1. Records background: Pale ivory rice paper, Jiangnan/Nanjing jade watercolor architecture confined to far edges, nearly blank middle 75%, subtle amber windows, no text, UI or people; match the selected emerald/ivory/gold mockup.
2. Opening scene: Production landscape Chinese mahjong background, a beautifully rendered 3D emerald felt table with polished dark wood surround, player-side camera looking down at 35 degrees, centered vanishing point, four ivory-and-jade tile walls framing an empty center; Jiangnan waterside pavilion at dusk, lantern glow, subtle engraved felt pattern. No exposed hand, faces, avatars, UI, lettering, logos or watermark. Camera will zoom and dissolve to the real table.
3. Opening title: Single transparent game VFX asset. Exact two Chinese characters 开局 in bold gold brush calligraphy, molten-gold bevels, ivory highlights and antique gold shadow edges. A thin elliptical gold-light sweep and sparse particles behind the lettering, airy transparent gaps. No solid disk, background, table, scene, UI or other text. True alpha and clean edges.

## 本地预览

- `/tests/previews/records.html`：真实战绩组件，内存演示数据，不修改账号或业务记录。
- `/tests/previews/opening.html`：真实 Cocos 组件和开桌动画，可播放、定格及选牌。

测试及对比记录见根目录 `design-qa.md`。

## 完整网页版部署（2026-09-18）

- 入口：https://212.189.31.46/play/ 。完整生产前端，包含本次改版。
- API 与 WebSocket 使用现有 `/mahjong` 服务；账号、权限和战绩共用。
- Vite 使用 `--base=/play/`，代码中的动态图片、音频地址使用 `BASE_URL`。
- 静态版本：服务器 `/opt/jinling-mahjong/server/acme/mahjong-web/20260918T095431Z`；`current` 指向该版本，通过现有网关只读挂载提供文件。
- Caddy 增加 `/play/*` 路由并热加载；原分发站和游戏服务保持运行。
- TypeScript、构建和6项针对性测试通过；线上HTML、JS、CSS、开桌素材、战绩背景、Cocos页面及音频均返回200，WebSocket握手成功。
- 浏览器已确认首次协议界面正常展示；未代替用户接受协议，未验证登录后的线上完整对局。
- 本次未重新打包 APK/IPA，未 push。

## 轮庄与会员排序上线（2026-09-18 18:38）

- 服务端镜像和源码目录版本为 `0.7.13-rules-20260918`；部署源为当前工作区，631个文件逐一校验，与已通过546项测试的代码一致。
- 仅庄家胡牌或流局连庄。其余轮到下家坐庄；大胡等仍触发下把2倍。接庄比仅在下家本把胡牌并接庄时触发。
- 会员管理按注册时间倒序，同时间按插入次序倒序。
- `/play/` 已重新构建，静态目录为 `server/acme/mahjong-web/20260918-rules`，主入口 `index-BbRApHm4.js`；包含最新规则说明、开桌与战绩改版。
- 切换前无进行中的牌局；数据库备份位于服务器 `/opt/jinling-mahjong/database-backups/rules-20260918/mahjong.sqlite`。
- 运行中的引擎、会员接口及规则文案SHA256与本地一致；服务器镜像内14项轮庄/接庄回归测试通过。页面、关键资源、API健康检查和WebSocket握手通过，分发与Telegram统计服务正常。
- 浏览器已确认加载最新入口；未代替用户接受首次协议，未进行线上真实对局。
- APK/IPA联机规则和会员排序使用服务端结果，本次无需重打包；原生包内页面样式和离线练习仍需后续安装包更新。未 push。

## 自动续桌换号上线（2026-09-18 18:57）

- 新版本 `0.7.13-renew-20260918` 已部署；网页目录 `server/acme/mahjong-web/20260918-renew`，主入口 `index-CJ_xN20_.js`。
- 整桌打满8把或提前两家归零等结束，自动续桌都会创建新桌号和新对局ID，移除旧大厅入口，保留旧战绩。新号码避开当前牌桌及已保存整桌战绩的桌号。
- 规则、设置、开桌人和分组位置完整继承，座位/局数/积分从新桌重新开始；自动续桌开启且权限有效时持续续开。
- 主动离桌、断线重连和托管逻辑未改。旧版已经续出的同号空桌在启动时换号；仅处理无人入座、尚未开局的空桌，已开始或有人入座的牌桌不迁移。
- 548项全量测试通过；服务器镜像内3项联机续桌回归通过，覆盖提前结束、8把结束、连续续两代、持久化及旧号迁移。
- 首次切换时有正在进行的563975，因此等待第一把结算间隙再更新；上线后确认该桌正常进入第二把。
- 数据库备份位于 `/opt/jinling-mahjong/database-backups/renew-20260918/mahjong.sqlite`。线上代码摘要、HTML及资源、健康检查、WebSocket握手验证通过。此项不需要重打APK/IPA，未 push。

## 整桌累计超时与上拖出牌（0.7.14 / build 51）

- 每人每桌90秒累计超时额度，每次出牌或响应仍先有正常10秒。超时余额90→87→50后，下次从50秒继续；同桌跨把、重连和取消托管不恢复，新桌才恢复。旧版每次重置设置兼容迁移为累计，保留已知已耗时间。
- 开桌动画只在新桌第一把播放，后续把数直接进入牌桌；断线恢复继续沿用原有不播放规则。
- 出牌改为先轻点选牌，再向上拖动并松手。轻点同牌取消选择；未选牌直接拖动、拖动不足、下拖、非本人出牌阶段都不会出牌。拖牌保留物理牌ID，倒计时更新不打断手势。点击音效保持原样。
- 单元测试：全量559项中旧文案断言1项更新后，该文件5项复测通过，其余558项全量通过。Chrome/WebKit共12项交互测试通过，覆盖三种横屏宽度和倒计时推送中拖动。TypeScript和Cocos构建通过。
- APK和Ad Hoc IPA已完成签名及资源验包，详情见 `release-0.7.14-build51-verification.json`。IPA仅限描述文件登记的4台设备，尚未真机安装。
- 服务端和完整网页版已上线至 `0.7.14-interaction-20260918`。切换前无进行中牌局；数据库备份为服务器 `database-backups/interaction-20260918/mahjong.sqlite`。
- 635个部署源文件摘要全部匹配；HTML、主JS/CSS、Cocos入口和开局素材在线摘要匹配，API返回0.7.14，WebSocket握手通过。使用数据库只读备份验证五张旧空桌加载后均使用90秒累计模式，生产数据库未做手工改写。
