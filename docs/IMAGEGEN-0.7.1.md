# 0.7.1 全套鲜艳立体麻将牌

模式：内置 `image_gen`，新生成（非 CLI）。

最终生成原图：`cocos-table/art-source/imagegen/jade-resin-v1.png`。原图保持不变；Blender 通过材质节点将它与绿色树脂基色混合，应用到每张牌的牌背和绿色侧边。

最终提示词：

> Use case: stylized-concept. Asset type: production seamless albedo texture for green resin mahjong tile backs in a mobile game. Primary request: vivid polished emerald-green melamine resin, elegant rich jade green with extremely subtle fine mottling and tiny natural resin flecks. Composition: square 1024x1024, perfectly flat orthographic material swatch filling the entire frame edge to edge, tileable seamless boundaries. Uniform saturated mid emerald color, very low contrast microtexture, no directional light or shading baked in (game renders physical lighting), no objects, no tile outline, no border, no symbols, no text, no watermark. Opaque RGB texture. The result will be UV mapped onto all mahjong tile backs and edges; preserve readability of their silhouette and keep material clean.

当前数字、文字和点数复用已校对的42种图案，避免重新生图造成点数/字形错误。通过统一的原生三维材质提高彩色刻纹饱和度与亮度、调整白色树脂和倒角、高光、绿色侧边。各方向离线预渲染，游戏运行时没有新增实时灯光或三维模型负担。

构建链：

1. `cocos-table/tools/render_tiles.py` 读取原图与42张 `art-source/ink` 图案，按既有相机和摆放关系渲染。
2. `cocos-table/tools/pack-tiles.mjs` 生成 `assets/resources/tiles` 和 `tile-atlas.json`。
3. `cocos-table/tools/export-web-tiles.mjs` 导出 `public/tiles/vivid/{own,back-top}.png` 和 `src/tile-vivid.json`，保证听牌提示、帮助及结算小牌使用相同牌面。
4. `npm run build:cocos` 导出两端共用运行资源；`npm run native:sync` 打进 APK 与 IPA。

未改动实体牌编号、布局坐标、碰杠来源标记、暗杠隐藏规则或点数图案。
