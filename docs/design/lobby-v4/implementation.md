# 大厅与配套 UI 实施记录

## 本轮范围

基于 main 60fcb34。保留南京麻将业务和服务端权限，本轮不是全 Cocos 迁移。现有 React/Capacitor 外壳的界面已更新；Cocos 牌桌、麻将资源、服务端和 shared 规则模块没有修改。

- 普通成员：首页只有房间大厅入口。
- 管理员：首页房间大厅与亲友房；亲友房复用原目录组件，不是新的房间类型。
- 新建仍使用 mayCreateTables，普通管理员不会自动获得开桌权限。
- 建房默认值、校验、三步流程、草稿、最终 createTables 消息保持原样。
- 登录注册、个人页、玩法、战绩、等待房间、设置与通用弹窗采用同套场景/蓝色导航/奶油色面板/绿色确认控件。
- 对局牌面与 round-reveal-dialog 排除在这次换肤范围外。
- 原 online-home.css 已不再导入；未删除历史文件。

## 网络观察与实现边界

只观察了用户打开的微乐小程序正常联网界面。没有切断电脑网络，没有加入第三方牌局，也没有查看微乐内部实现。未实际验证微乐断网表现，不能把以下方案称为其内部实现。

现有 GameClient 已有心跳、前后台同步、重连退避、命令 pending 和权威快照恢复；本轮不替换这些协议。新增 NetworkFeedback 只负责展示。

| 状态 | 反馈 | 操作 |
| --- | --- | --- |
| 少于800ms握手/短暂同步 | 不闪横幅 | 原有连接状态立即控制危险操作 |
| 延迟高/超时观察中 | 网络波动 | 不弹窗，不强制离桌 |
| 离线 | 网络连接中断，牌桌已保留 | 联网后走原自动重连 |
| 已认证但快照未到 | 正在恢复牌局 | 仍不可准备或出牌 |
| 持续12秒以上 | 增加重试连接 | 按钮节流，调用原retryNetwork，不重放命令 |
| connected且READY | 已恢复连接，短暂显示后消失 | 原快照恢复交互 |
| 账号在别处打开 | 明确提示冲突及“在此恢复” | 用户主动通过原connect重认证；不会自动抢回会话 |

恢复提示1.8秒，UI检查间隔400ms。提示不改变服务端计时，不声称断线暂停真实牌局。

## 已验证

- 全量单测：88文件、1305项通过。
- 页面/账号/权限/建房/重连/协议：20项浏览器回归通过。
- 小横屏与Android/iOS键盘专项：13项通过（其中页面用例与上述有重叠）。
- 测试浏览器实际offline、延迟850ms心跳、三尺寸目录滚动：5项通过。
- 类型检查及生产构建通过。构建校验沿用原Cocos运行包，未改牌桌资源。
- 修复568×320个人页管理按钮被导航遮挡；复核记录页导航与设置弹窗内距。

以上不是全部历史E2E套件跑完的声明。部分历史首页用例仍假设旧首页直接展示牌桌列表，需要随新入口结构迁移；新增lobby-game/game-ui和更新的home-scroll覆盖当前流程。

## 资源

项目内资源在 public/art/lobby-v4/：scene.png、teapot.png、tea-bowl.png。内置image_gen生成，不使用CLI；图中文字和所有交互均由真实组件绘制，没有把整张效果图作为UI。

原始参考来自用户确认的本地大厅视觉稿（讨论稿未纳入此次代码提交）。生成场景时移除所有营销入口与文字；两个道具使用透明背景。

### 完整资源提示词

#### lobby_scene_prompt

```text
Edit target: the referenced approved vivid mobile mahjong lobby design.
Asset type: production background plate for the game lobby, not a UI mockup.
Remove EVERY interface element, all panels/buttons, all text and numbers, all badges, all bars, all avatars, all coins, all gems, all card/teapot/button props. Seamlessly fill the revealed areas using the existing background scene.
Keep the male host character in the left third at exactly the same scale and position, same green shirt, yellow scarf, cream sleeves and brown shorts. Remove writing/logos from clothing. Keep luminous blue sky, distant mountains, lake/city terrace, autumn trees and slate-blue floor in the same polished commercial game illustration style and rich palette.
The right 60% must be clear scenery for our real controls to be placed on top. No new objects or characters. Wide 16:9, opaque background. There must be ZERO UI, lettering or text. Preserve reference camera, composition, lighting and art finish.
```

#### lobby_teapot_prompt

```text
Use case: stylized-concept
Asset type: isolated production UI prop for a vivid Chinese mahjong game lobby entrance button.
One beautiful clear ivory-white and pale celadon glass teapot with a small gold chrysanthemum on its side, three-quarter view, lid and curved handle, short elegant spout. Matching small saucer underneath. Polished dimensional game art, glossy glass/porcelain, bright and welcoming, fine warm metallic accents. Similar material finish to a premium Chinese mobile mahjong lobby mode selector, NOT a photo. Center entire object with clear margin, the silhouette readable at 120px width. Genuinely transparent background with alpha, no environment, no panel, no UI, no text, no letters, no watermark. Soft small contact shadow only under teapot.
```

#### lobby_bowl_prompt

```text
Use case: stylized-concept
Asset type: isolated production UI prop for a Chinese mahjong friend's-room entrance button.
One translucent amber-orange glass Chinese lidded tea bowl on a matching small saucer, delicate gold finial on top, polished bright high-quality 3D commercial mobile-game icon. Three-quarter view from slightly above. Same refined collectible glass and porcelain visual quality as a modern Chinese mahjong lobby mode tile. Entire object centered, margin around silhouette. No teapot spout or handle. Genuinely transparent background and alpha, no room, no backdrop, no UI panel, no letters, no text, no watermark. Natural small contact shadow beneath saucer only. Icon must be clear when displayed at 120px.
```
