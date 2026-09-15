# 麻将牌面材质试样

用户已选定「按这组立体雕刻质感继续」。完整 42 种牌面及牌背现已接入游戏，替换原 SVG 图案叠加牌身的版本。当前重点修正用户指出的八条排列。

八条对照了[八索实物图](https://item.rakuten.co.jp/auc-toysanta/g-55ig0010fu-008/)：上组为 W 形，下组为 M 形，两组各四根，两侧竖直、内侧倾斜。原图集的同向斜排已停用，`public/tiles/sculpted/bamboo-eight.png` 为单独修正版；六条以用户 2026-09-14 12:29 实物照片为准，修正为两行三列、上三下三，采用 bamboo-six-corrected.png；细节见 SIX-BAMBOO-PROMPT.md。游戏与全套预览共用 `src/tile-art.ts` 的映射，八条不能再落回旧图集。

最终素材目录：`public/tiles/sculpted/`；完整提示词与模式见 `sculpted-prompts.json`（内置 image_gen，未使用 CLI）。八条原始输出为 `exec-451536e2-e970-4a35-9337-fc80639e661b.png`，六条现为 `exec-186ed4aa-064c-4a9f-a10c-475139d754bf.png`（旧 `exec-abbd1ac7-0427-4a0f-b331-6a847468dcaf.png` 已停用），均保留在下面同一生成目录。万、筒、条、字、花图集依次为 `exec-dded9b8a-7bf0-400e-97ff-846cb2adf469.png`、`exec-75c99b2a-ed7a-4f80-bf0d-282b688d713d.png`、`exec-e338448e-dcc7-4ca1-a44f-5fe8ffd5cfff.png`、`exec-c74b2624-e894-4e3e-a93d-60e6d769540a.png`、`exec-32477205-87fc-4809-9a36-aa19dacedb57.png`。

生成器未返回真正透明背景，而是 RGB 棋盘背景；源 PNG 原样保留。界面使用像素视窗和圆角裁切排除外部背景，没有用图片编辑程序改写源图。`npm run tiles` 生成实际共用素材的预览，项目上一层 `麻将牌面设计.html` 内嵌全部素材，可离线查看。

本轮验证：生产编译通过；牌组加载、八条放大预览、7 种横屏、残局及碰牌共 14 项浏览器检查通过；边缘微调后重新通过牌组预览检查。模拟器验证见 VERIFICATION.md。

模式：内置 image_gen 新图生成。原始文件保留于 `/Users/kk/.codex/generated_images/01a09933-c4fa-79b3-bc2a-3cf53a0e90f2/exec-8346fd77-535f-47a2-91f2-c568a0b2dc00.png`；工作区副本为 `public/tile-study-carved.png`。`npm run tiles:study` 生成 `public/tile-material-study.html`（外部引用）及项目上一层 `麻将牌面-新旧对照.html`（离线内嵌），共享图片只引用一次，已修复旧页面重复嵌入导致的体积膨胀。CSS 视窗仅用于布局显示，未改写位图。

本轮重新查看了 [微乐当前 iPhone App Store 页面](https://apps.apple.com/cn/app/id1467718253) 的官方宣传截图，并回看此前 Microsoft Store 的实际牌桌图。新图为原创材质研究。

最终采用的生成提示词：

```text
Use case: stylized-concept
Asset type: final-quality material and engraving study for four traditional Chinese mahjong game tiles, not an app screen.
Create a beautiful close-up set of EXACTLY FOUR matching mahjong tiles, arranged in one straight horizontal row on a clean deep emerald felt surface. The four faces are 五萬, 一筒, 二条, 東, left to right. This is a premium classic Chinese mobile mahjong game art direction, with readable saturated signs and an exceptionally refined tactile tile finish.
All four tiles stand straight upright, parallel, all identically sized with width:height 0.72, broad almost front-on faces, a very slight top-down view only, no left-right perspective skew. Fill the image with the tiles, equal modest gaps. White front material is luminous, pure warm-white polished melamine resin, softly convex, smooth broad bevels, beautifully controlled creamy highlights at upper left, clean cool ivory underside, pale mint green 8-percent-thick base. Avoid dirty gray front faces, extreme thick dark green borders or extruded outlines.
The markings are physically CUT INTO the white face and filled with smooth glossy opaque lacquer. Tiny convincing inner occlusion on top/left of each engraved edge and delicate white light on the lower edge. No raised lettering, no outlines around brush strokes, no rough ink erosion, no printed flat sticker look. Readable clear Chinese traditional mahjong patterns:
Tile 1: exactly black “五” over vivid vermilion red traditional “萬”, vertically centered. Black 五 is broad and confident authentic Chinese hand-carved mahjong brush lettering; 萬 has flowing calligraphic character, broad graceful strokes, strongly recognizable correct Chinese character. Not Songti or Ming serif typography. Occupy 78 percent of face width.
Tile 2: ONE beautiful large deeply engraved concentric green medallion with a red circular center, thin ivory separation channels and eight symmetric small petal-like inner lobes. Refined real Chinese mahjong circle mark, not a target or mechanical gear. Diameter 72 percent of tile width.
Tile 3: EXACTLY TWO substantial emerald green bamboo emblems placed vertically, one above the other. Each emblem consists of a round cap and foot and a wide middle bamboo segment, natural elongated traditional mahjong bamboo shape with thin inset ivory groove highlights. The two emblems fill the tile face generously. No bird, no leaves, no additional sticks.
Tile 4: EXACTLY traditional Chinese black “東”, centered tall and large, confident rounded Chinese brush-lettered mahjong engraving, not font-like thin serif strokes.
Lighting is clear, bright, warm neutral studio/game light, highlights consistent on every tile; calm green background, soft short contact shadows. Every detail should be crisp enough to evaluate the carving at large size while still reading beautifully at 50-pixel width. Restrained premium craftsmanship, natural proportions, not a vector icon or cartoon toy. No captions, UI, logos, watermark, coins, ornamental decoration, extra symbols or extra tiles. Landscape composition.
```
