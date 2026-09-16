# 六条实物照片校正

以用户最后提供的实物照片为准：上三根、下三根，两行三列，共六根绿色竹节。此前文字“三横排、每排两根”已由实物照片纠正。保留象牙白牌身和翡翠底边。

最终素材：`public/tiles/sculpted/bamboo-six-corrected.png`。
原始生成文件：`exec-186ed4aa-064c-4a9f-a10c-475139d754bf.png`。
布局参考：用户提供的 `IMAGE 2026-09-14 12:29:04.jpg`；样式参考：项目原六条。使用内置 imagegen 编辑。

最终提示词：

```text
Use case: precise-object-edit. Production mahjong tile sprite.
Image 1 is our tile EDIT TARGET: retain its ivory ceramic body, rounded bevel, emerald green bottom edge, front-facing camera, lighting, pixel placement and 1024 x 1536 portrait canvas.
Image 2 is the user's definitive LAYOUT REFERENCE for six bamboo. Match the six stems on this real tile: EXACTLY THREE upright stems across the TOP ROW and EXACTLY THREE upright stems across the BOTTOM ROW. TWO HORIZONTAL ROWS, THREE VERTICAL COLUMNS. Top 3 + bottom 3 = 6.
Replace only the green bamboo design of image 1. Remove its old two-column / three-row layout. Create six identical long, narrow, upright emerald lacquered bamboo stems. They have modest round end joints, a slim slightly scalloped shaft, and a thin engraved ivory central stroke, matching the characteristic form in image 2 but rendered with the refined carved glossy 3D material of image 1. All six are green.
Place stem centers at approximately x = 280, 512, 744, and y = 460 and 1060 on the 1024x1536 canvas. Each stem about 145px wide and 440px tall. Equal spacing, consistent sizes, crisp readable silhouette. Leave clear ivory whitespace between the upper and lower row.
Only a single isolated finished tile. Do not recreate the real photo's tabletop, camera angle, watermark, text, logo, or gray background. No labels, no red marks, no extra stems, no three-row arrangement. Preserve the original tile body and crop.
```
