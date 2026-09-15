# 界面与整套麻将牌面

当前方向由用户选择：向微乐麻将的粗笔大字、饱满牌面与经典游戏界面靠拢。iOS 优先，全程横屏；明亮秦淮河大厅、绿绒牌桌、暖金按钮、四位原创人物头像，中央风位指示清楚，碰杠胡使用统一立体圆按钮。点牌选中，再点同一张牌打出，保留单独出牌按钮。

## 全部 42 种牌面

实际游戏使用 `public/tiles/0.svg` 至 `41.svg` 的透明图案，叠加同一张 `tile-material.png` 立体牌身。字形已转成路径，iOS 和浏览器显示同一套轮廓，不依赖运行时字体。手牌、弃牌、明刻、花牌和提示牌共享同一组件；正向与侧向牌背分别使用 `back.svg` 和 `back-side.svg`。

- 万子：墨色粗笔数目字，朱砂“萬”增大占比。
- 筒子：精确数量的传统排列，一筒采用绿环、浅色径向刻线与朱红中心；其余筒子采用墨、红、绿分色。
- 条子：圆润竹节及细刻槽，一条为原创彩羽雀鸟，八条采用斜竹排列。
- 字牌：东南西北、中发统一书法轮廓，白板使用传统蓝框。
- 花牌：春桃、夏荷、秋枫、冬松雪，以及梅、兰、竹、菊八幅独立矢量插画。
- 牌身：柔和象牙白树脂材质、圆润倒角、翡翠底边。原始透明 PNG 未改写，通过 `tile-mask.svg` 在渲染时遮去边缘杂点，叠加精确的图案，避免生成图中的数量或牌字错误。

素材生成入口为 `npm run tiles`，源文件 `scripts/generate-tiles.ts`。字形来自 Google Fonts 的 Ma Shan Zheng 与 Yuji Syuku，均附 OFL 授权于 `public/fonts/`。传统字优先采用 Yuji Syuku，数目字与花牌题字使用 Ma Shan Zheng。`scripts/tile-glyphs.json` 保存轮廓；重新提取使用 `scripts/extract-tile-glyphs.py`（需要 fonttools）。

`public/tile-catalog.html` 为 42 种牌与牌背的放大检查页，图案、牌身和遮罩均已内嵌，可离线打开。交付副本为项目上一层 `麻将牌面设计.html`。

## 参考与原创美术

本轮实际查看了 [微乐麻将官方 Microsoft Store 页面与游戏截图](https://apps.microsoft.com/detail/xp9m06dwqrhtlx?gl=CN&hl=zh-CN)，研究粗笔牌字、饱满比例、传统筒条排列、四家位置及风位显示；另参考 [欢乐麻将牌桌截图](https://game.xiaomi.com/viewpoint/1270322523_1686536294223_149)。未把其他产品的图片、头像或标识装入本项目。

大厅背景、空白牌身和人物头像使用内置 image_gen 工具，未使用 CLI。四位头像为原创虚构成年人，整张 2×2 图集保存在 `public/avatars.png`，通过 CSS 显示对应象限。绿绒纹理 `public/felt.svg` 与界面光影通过代码绘制。

大厅位图保存于 `public/lobby-scene.png`，通过内置 image_gen 工具编辑生成，未使用 CLI。原始输出保留于 `/Users/kk/.codex/generated_images/01a09933-c4fa-79b3-bc2a-3cf53a0e90f2/exec-11125744-6653-46ed-8650-153d95fd838f.png`。

最终背景编辑提示词：

```text
Edit this original mahjong game lobby background. Preserve the exact camera composition, large recognizable 中 / 發 / five circles ivory mahjong tiles in the center-right, jade tile backs, table, Nanjing pavilion and river. The user wants a lively polished CLASSIC MOBILE GAME, not a dim moody photograph. Change the art direction to bright, vibrant, welcoming high-end stylized 3D game art: golden morning sunlight, turquoise blue river and luminous jade green velvet table, rich warm gold wooden detail, sunny highlights, bright white polished ivory tile faces with saturated cinnabar red and brilliant emerald symbols, rounded clean bevels and beautiful subsurface ceramic glow. Visually crisp and refined, tactile tiles should be the star. Increase exposure and color saturation substantially, remove murky dark gray shadows. Left 40% remains calm medium emerald negative space for live heading and buttons, bottom 20% calm jade cloth. Keep all tile symbols accurate; don't add UI, titles, buttons, currencies, people, brand logos or text beyond the existing mahjong symbols. Landscape 1536x1024.
```

## 牌身生成记录

模式：内置 image_gen，新图生成。选用原始输出 `/Users/kk/.codex/generated_images/01a09933-c4fa-79b3-bc2a-3cf53a0e90f2/exec-09ff3b32-c230-4025-a992-fb87d0ec7a5a.png`，原样复制到 `public/tiles/tile-material.png`。后续另一次清理尝试未采用。

最终采用的提示词：

```text
Create one production-ready game asset: a SINGLE BLANK traditional Chinese mahjong tile, no lettering, no symbols. It must look like the tactile mahjong tiles of a premium classic Chinese mobile mahjong game, rendered as polished 3D resin with beautiful soft studio lighting. Straight-on front view with only a very slight top-down elevation, no visible left or right side perspective skew. The broad rectangular front face is blank brilliant ivory white, smooth, gently rounded four corners, realistic soft bevels, a subtly convex smooth surface, soft small highlights along the upper left bevel, no ornamental outline border, no concentric drawn frame, no gold. Subtle cool gray contact shading at the bottom of the white face. A thick emerald green resin layer is visible across the bottom 10 percent of the tile with realistic deep green occlusion and luminous green edge reflections. Tile width to total height about 0.73. The white front face is nearly a perfectly axis-aligned rectangle occupying the upper 86 percent of the object so accurate game symbols can be overlaid in code later. Camera orthographic, no dramatic tilt, no isometric view, no vanishing-point distortion. A soft neutral contact shadow directly below. Clean transparent background with real alpha, no floor, no surrounding props, no extra tiles. The single tile fills 88 percent of image width and 94 percent of image height; portrait composition. Crisp realistic material, not a vector illustration, not flat icon art, not a plastic UI button. No text of any kind.
```

## 头像生成记录

模式：内置 image_gen，新图生成。原始输出 `/Users/kk/.codex/generated_images/01a09933-c4fa-79b3-bc2a-3cf53a0e90f2/exec-9a3f4909-2430-49b5-89d2-589c6c7636d2.png`，原样复制到 `public/avatars.png`。

最终提示词：

```text
Production game UI avatar sprite sheet for an original classic Chinese mobile mahjong app. Exactly FOUR original fictional Chinese adult characters, in a perfectly aligned 2 by 2 grid of equal square quadrants, no gaps, no borders, no words. Each quadrant is a polished high-end stylized 3D portrait from upper chest up, centered head with entire hair and shoulders inside the quadrant, warm smiling approachable expression, refined soft studio light, clear shapes readable at 50 pixels. Top left: friendly young adult man, neat black hair, cream casual shirt with a teal jacket, warm amber gradient background. Top right: elegant adult woman in jade green Chinese-inspired blouse, tidy shoulder-length black hair, pale peach gradient background. Bottom left: kindly older man with silver side-parted hair and round glasses, navy Chinese jacket, powder blue gradient background. Bottom right: cheerful adult woman with a dark ponytail, lavender casual jacket, rosy lilac gradient background. The characters must have distinct silhouettes, attractive mature adult faces, detailed eyes, softly shaded hair, warm skin tone, natural proportions. Casual polished mahjong game art, not photos, not flat vector icons, not children, not anime. 1024x1024 square, four perfectly equal quadrants. No branding or logos.
```

## 实战布局补充

四家弃牌按每行十张排列，依据牌桌实际可用高度与弃牌行数自动调整尺寸，不再隐藏后续弃牌。自家副露与手牌同排，对手副露沿各自牌边放置；响应牌移到碰杠胡按钮旁。点击任意弃牌区或右上角四格入口可放大查看公开牌，并切换东南西北各家；仅使用客户端已有的公开信息。牌桌高度通过 ResizeObserver 取得，避免依赖 iOS 15 尚不支持的容器查询尺寸单位。
