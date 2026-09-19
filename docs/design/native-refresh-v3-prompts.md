# 首页全景背景与动效修订

工具：内置 image_gen。输入参考：`public/lobby-scene.png`。

原始生成图：`docs/design/lobby-panorama-v2.png`。应用资源：`public/art/lobby-panorama-v2.webp`（仅作 WebP 格式压缩）。首页在整个视口铺满图，文字对比用独立 CSS 层处理。

## 完整生成提示词

Use case: precise-object-edit. Asset type: production full-bleed panoramic lobby background for the existing landscape mobile game 金陵麻将. Input image 1 is the existing background to extend and improve. Primary request: make the background complete across the entire landscape display, retaining the inviting Qinhuai/Nanjing canal tea-house setting, emerald mahjong felt and warm realistic ivory tiles, but replace the empty blurry solid-green left half with a fully illustrated coherent view continuing the scene. Create a very wide 2304x1024 panorama, edge-to-edge scenic artwork with no letterbox or borders. Keep a calm readable composition: on the LEFT a shaded wood pavilion and a quiet stretch of jade canal, fine willow silhouettes and distant tiled roofs rendered as real complete scenery, not empty blur; in the CENTER the winding river, small arched bridge and layered Jiangnan architecture; on the RIGHT the existing warm wooden lattice pavilion, a small tasteful vase and the three familiar ivory tiles 中, 發, 五筒 (five circles only), together with green-backed tile stacks near the lower-right. Lower third is detailed emerald felt and slim carved warm wood rail continuing naturally across the full image. Large app controls will overlay left-center and right-center, so contrast should be moderate and highlights controlled, but do NOT paint placeholder panels, vignettes, dark gradients or blurry cut-outs into the image. Dusk-to-late-afternoon warm sunlight, rich deep jade and restrained soft gold. Keep the original polished stylized 3D game-art identity and coherent perspective. No UI, no title, no button, no lettering except the actual mahjong tile faces, no watermarks, no coins, no fantasy particles. Whole landscape must be finished all the way to all four edges. No white margins.

## 碰杠补花动效

沿用真实 Cocos 牌桌和牌资源，使用代码绘制局部玉绿底与暖金字，去除原本字下方的金色菱形。提示位置沿各家的手牌中心放置，保留中央余花余牌；通过缓存与合并渲染减少动画过程中的重复分配和重画。动效不使用生成图替换真实牌桌。
