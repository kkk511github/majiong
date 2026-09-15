# 碰牌特效

通过内置 image_gen（GPT Image）生成，已保留透明 alpha。
文件：public/art/effects/pung-gold-v1.png（1254 × 1254 RGBA）。
客户端在服务端确认碰牌后播放 1050 毫秒；在对应座位附近寻找未占用桌布区域，
不影响牌面点击。系统设置减少动态效果时仅显示静态标识。

生成提示词：

Use case: stylized-concept. Asset type: production game VFX sprite for a Chinese mahjong app, to animate in code. Create one beautiful compact golden “碰” action impact emblem, genuinely transparent RGBA background. Exact text: “碰” — this is the only text, large, unmistakable and legible even at 80 pixels. Bold elegant Chinese brush calligraphy with beveled warm ivory-gold strokes, thin dark bronze edges for contrast on green felt, luminous gold rim. Behind the word, an airy elliptical gold brush swoosh and a few small sparkling golden particles; refined premium Nanjing/Jiangnan aesthetic. Square 1024x1024 composition, artwork fills central 80%, ample transparent margin, all glow must fade into transparency. No opaque disk or panel, no rectangle, no gray/checkerboard painted background, no scenery, no mahjong tiles, no extra symbols, no watermark. A restrained celebratory impact, not an explosion. It will appear above a player’s meld tray briefly, never cover the board.
