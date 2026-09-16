# 0.3.0 体验修复

2026-09-13，根据真机反馈修复开局、手牌间距，并重做声音与品牌标识。

- 开局：先准备、后添加最后一位电脑时，原服务遗漏开局检查。现在准备、补电脑、玩家重连都使用同一检查；后台周期检查还会恢复旧版本遗留的已准备等待桌。真人离线时暂缓发牌，回桌后继续，保证不会重复发牌。
- 手牌：新摸的牌进入排序后不再带额外边距，统一使用金色细描边辨认。选中与出牌均保持紧凑。
- 中央盘：扩大风位盘，强化四个方向与当前玩家高亮；中央统一显示出牌或响应倒计时，余牌数移至顶栏。当前出牌者头像带环形倒计时，末 5 秒变色，自己临近超时会有短提示音。练习桌也遵守思考时间，打开设置暂停，返回续计时，超时托管。
- 声音：新增原创 16 小节、88 BPM 的五声音阶背景乐，以拨弦、低音和柔和长音编排。所有声音在本机 Web Audio 合成，无外部音频下载。按钮、选牌、准备、发牌、摸牌、落牌、碰、杠、胡牌各有反馈。对局音效比较服务端确认状态，不因失败操作或在线状态刷新重复播放。音乐与音效可分别开关、调音量，进入牌桌降低音乐音量，进入后台暂停。
- 图标：新设计为朱砂红中、象牙白雕刻牌身、翡翠绿底。App 图标和大厅标识统一，移除旧的字体“發”字块。最终资产 public/brand-icon.png，iOS 与 Android 图标由 scripts/generate-icons.mjs 生成。

视觉参考：[微乐家乡麻将官方商店](https://apps.microsoft.com/detail/xp9m06dwqrhtlx?gl=CN&hl=zh-CN) 的中央倒计时、风位分区和余牌标识。原创美术不使用微乐的商标或素材。音频实现参考 [MDN Web Audio 最佳实践](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)，在用户触摸后开启音频，上下文暂停后恢复。

## 图标生成记录

使用内置 image_gen 工具，生成后原样保存主图，打包时派生平台所需尺寸。

```text
Use case: stylized-concept. Asset type: finished premium iOS mahjong app icon, square 1024 x 1024 full bleed opaque image.
Primary request: redesign Jinling Mahjong icon to a highly polished sculpted mahjong aesthetic. One substantial ivory mahjong tile, almost front-on with a very slight left tilt, centered, filling 76 percent of the canvas. The tile has a beautifully engraved large traditional red "中", deep rich cinnabar lacquer inside the recessed strokes, soft ivory ceramic with clean rounded bevels, subtle jade-green thickness along its right and bottom edges. Bold readable authentic 中 character with refined sculptural calligraphy, not plain printed font.
Backdrop: luminous emerald jade gradient, dark bottle green corners and warm soft light toward center, very faint delicate gold Qinhuai water ripple arcs near the bottom only. No scenery, no extra tiles, no flowers.
Lighting: tasteful warm highlight upper left, physically believable soft cast shadow, luxurious crafted material, vivid colors, crisp detail, restrained reflections.
Composition: square full-bleed background to all edges; NO outer rounded-square border or frame, iOS supplies the mask. Generous clean 10 percent safe margin; subject unmistakable at 60 pixels. No app-name text, no English, no extraneous glyphs, no watermark. Only the red 中 is visible text. Output exactly square 1024x1024.
```
