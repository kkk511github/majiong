# 内置 image_gen 提示词与生成链

所有调用均使用内置工具；透明主字和底板请求`transparent_background=true`。没有CLI、外部付费素材或用户截图作为最终字形来源。

## 四按钮概念最终编辑

Reference: 自生成四按钮第一稿（碰、杠、胡、过2×2），非其他游戏素材。

> Refine this concept sheet in one focused material pass. Preserve the 2×2 layout, exact simplified characters 碰 杠 胡 过, their clear unified lettering and all spacing. 胡 must have a DARK INK-GREEN tablet, NOT a red tablet; retain only a tiny cinnabar rectangular accent near its lower-right corner, with quiet champagne-ivory lettering. Reduce all corner ornament: remove the large gold ornamental curls on 杠 and replace them with two extremely thin small champagne parallel ticks, remove other ornate corner patterns. All four plates should feel thin and calm with a subtle bevel and very close contact shadow, no massive dark extrusion. Keep 碰 ink-green/ivory, 杠 ink-green/ivory plus its two understated gold ticks, 胡 ink-green/pale warm gold plus tiny cinnabar accent, 过 gray-green/ivory. Neutral clean background, front view, no additional words, no glow, no extra props.

## 碰字最终透明编辑

Reference: 自生成象牙白碰字第一稿。第一稿有多余光晕，没有作为运行素材使用。

> Edit target: supplied 碰 glyph sprite. Keep the exact correct character 碰, its readable upright structure, ivory face and small deep-green edge. Remove ALL luminous haze/glow, drop shadow, green mist and diffuse pixels around the strokes. Outside the hard glyph silhouette and inside the holes must be exactly transparent alpha=0, not black or gray; glyph face fully opaque alpha=255 with only narrow antialias edges. Reduce the thick green extrusion to a very thin 1% shallow-relief edge. Preserve no scenery, no plate, no frame, no separate ornaments. Center the complete letter on a SQUARE transparent canvas with around 15% transparent margin on every side. It must be a clean production sprite, no shadow/glow baked into it.

## 杠字

Reference: 上述最终碰字。

> Use case: text-localization. Supporting style/reference image: the upright ivory 碰 glyph. Make a matching standalone sprite but change ONLY the character to the correct simplified Chinese "杠" (木 on left, 工 on right). Exactly one character, no 碰 and no other text. Match its controlled brush strokes, upright structure, weight, ivory material, tiny dark ink-green shallow edge and clean silhouette. This is the same typography family for a refined modern Eastern mahjong game. Center on a square canvas, generous 15% margin, no cropped tips. Truly transparent background alpha=0 outside the strokes and in holes, opaque letter face; no gray/black/checkerboard background. Absolutely no glow, haze, diffuse shadow, particles, ornaments, plate, frame, badge, or thick extrusion. Maintain phone-size readability and complete accurate strokes.

## 胡字

Reference: 最终碰字。

> Use case: text-localization. Style reference: the supplied single ivory 碰 sprite. Produce its matching sibling, changing the letter to EXACTLY the correct simplified Chinese character "胡" (古 on left, 月 on right). Same disciplined upright modern brush family, substantial legible strokes, same visual proportions and extremely shallow dark ink-green edge. Face color is pale LOW-SATURATION champagne ivory-gold, not orange or bright metallic yellow. Complete accurate character only, crisp antialiased silhouette, centered square composition with generous clear margins, opaque face and real transparent alpha outside and inside stroke holes. No shadows, glows, fringe, gold border, haze, particles, plate, frame, ornaments, other text or checkerboard. Keep the recognizable original glyph typography style and thin material; no heavy extrusion.

## 过字

Reference: 最终碰字。

> Use case: text-localization. Produce a matching sibling of this modern brush typography sprite. The ONLY character is correct SIMPLIFIED Chinese "过" (寸 with simplified 辶), NOT traditional 過. Same upright, stable, substantial brush family, ivory face, extremely shallow dark ink-green edge; fully readable at 40px. Keep exactly one complete character with balanced proportions and controlled stroke tips. Square transparent canvas with generous margin. Truly transparent background, alpha 0 outside hard character outline and inside holes, fully opaque face, narrow antialias edge only. No plate, outline frame, shadow, glow, neon green fringes, haze, particles, ornament, symbols, extra text or checkerboard. Use the same visual weight as the reference.

## 无字底板

> Use case: stylized-concept. Asset type: ONE blank production UI button base sprite, without lettering, for modern Eastern mobile mahjong. Subject: one front-facing perfectly upright rounded-square THIN dark ink-green jade tablet. Restrained refined semi-matte stone material, extremely subtle mineral detail, clean continuous shape. Gentle shallow bevel, thin edge highlight, 1% apparent edge thickness. Square inner field left blank with generous room for a separate large Chinese glyph. No perspective and no tilt. Tablet fills 82% of the square image, equal clear margin on all sides. Background: real transparent alpha, including rounded corners. No cast shadow outside the tablet, shadows are separate runtime layers. Fully opaque jade face. No text, no glyph, no corner motifs, no filigree, no large gold frame, no circular badge, no precious jewel, no metallic rim, no glow, no gradients resembling generic web UI, no glossy glass. Quiet dark green material similar to a finely polished thin jade game token, not a massive slab.

## 无框扣分概念

> Use case: ui-mockup. Asset type: original floating score-loss typography concept for the landscape mobile game 金陵麻将. This is NOT a button, card, badge or panel. Subject: ONE compact, beautifully typeset floating readout, centred with generous transparent space. Exact text in three lines: small upper line "秦淮"; large dominant middle line "−15" (true minus sign, correct digits 1 and 5); small lower line "四家同牌". No other words. Design direction: refined modern Eastern editorial typography mixed with tactile mahjong game feedback. Absolutely NO background plate, NO green box, NO rectangle, NO frame, NO pill, NO border. The three lines stand freely in space. Main numeral face is warm ivory with a slight champagne cast, crisp very shallow engraving-style edges, minimal close dark ink edge for readability. Minus sign is muted cinnabar, not bright red. Numerals have sturdy elegant contemporary serif structure, balanced tabular spacing, not comic or fantasy lettering. Chinese subtitle and player name are clear upright simplified Chinese in the same quiet elegant family, smaller and subordinate. Accent: at most one very short tapered cinnabar ink tick beside the minus, no underline extending into a container and no enclosing geometry. Flat front view, no tilt or large extrusion. No outer glow or soft halos, no smoke, coins, gems, sparkles, large shadows, gradient panel or background scene. Background MUST be real transparent alpha: exactly transparent outside letters and the tiny ink tick, not painted black/white/gray/checkerboard. Legible at about 100×70 logical pixels. Priority: immediate clear loss amount, then reason, then player identity. Avoid game-dashboard or clickable-control appearance.

扣分概念只定义方向。实现采用准确的动态文字，不烘焙金额，不套用概念中的具体玩家姓名。
