# 七条牌面生成记录

工具：内置 imagegen；模式：参考图局部编辑。

参考：已有 bamboo-six.png 的牌体、象牙白材质和绿边。最终文件：public/tiles/sculpted/bamboo-seven.png，1024 × 1536；取图矩形 [62, 38, 898, 1481]。

最终传入提示词：

Use case: precise-object-edit. Edit target: the supplied single six-bamboo mahjong tile. Create its seven-bamboo counterpart, a production game sprite at exactly 1024 x 1536 pixels. Change ONLY the face symbols. The correct traditional SEVEN BAMBOO arrangement is exactly THREE ROWS: top row ONE RED upright bamboo centered; middle row THREE GREEN upright bamboos evenly spaced; bottom row THREE GREEN upright bamboos evenly spaced. Thus 1 + 3 + 3 = 7, exactly one red and six green. All seven bamboo glyphs same size, similar sculpted bamboo joint shape to input, with round caps, lacquer inlay and ivory center detail; not stick lines, not numbers. Lay out centers at top (512,350), middle (285,790),(512,790),(739,790), bottom (285,1220),(512,1220),(739,1220); each glyph approximately 155 wide by 320 tall. Preserve original cream ivory rounded tile body, lighting, bevel, green lower edge and the body's exact framing: tile body x62 to960, y38 to1519. Preserve original gray checkerboard outside the tile; no new shadow or background. Orthographic frontal view, no perspective rotation. No letters, labels, digits, watermark, border changes or extra bamboo. Top row must contain only a single RED bamboo, never three.
