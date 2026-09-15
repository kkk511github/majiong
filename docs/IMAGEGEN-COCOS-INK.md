# 新牌面字样（ImageGen）

使用内置 imagegen 工具生成。2026-09-15。参考图仅用于笔画、颜色及传统麻将图案风格。原始透明图保存在 cocos-table/art-source/imagegen/，由构建脚本生成 UV 纹理后，再通过 Blender 实体牌模烘焙各方向。

八条已按用户要求修正为上下对称 W/M 形竹节，使用 bamboo-v2.png。

## wan

Use case: stylized-concept. Asset type: production Mahjong INK / ENGRAVING texture atlas for UV mapping onto our own offline-rendered ivory tile solids. The attached image is a STYLE REFERENCE only, especially the large foreground tiles. Match the refinement, chunky legible Chinese strokes, traditional real Mahjong engraving, intense black, cinnabar red and deep green. Create ONLY the printed symbols, not the white tile body, not a bevel, not a rectangle, not a shadow or game UI. Genuine transparent background (alpha), crisp anti-aliasing. Straight-on orthographic flat ink, consistent minute engraved rim detail, no perspective, no gradients across the canvas. 1024 x 1536 portrait canvas, exactly 3 columns by 3 rows equal cells. Each symbol composition centered inside its cell, occupying about 78% of cell width and 82% of cell height. Keep all artwork inside its own cell with generous clean transparent separators, no gridlines, no labels or numbering beyond the actual Mahjong glyphs. Consistent optical sizes. This is for older players at small screen size: thick confident strokes, clean open counters, exact numerals, no wispy calligraphy.
Nine Wan suit faces in row-major order EXACTLY: 一萬, 二萬, 三萬 / 四萬, 伍萬, 六萬 / 七萬, 八萬, 九萬. Each cell has a very large bold BLACK Chinese numeral in its top half and exactly the same vivid RED traditional 萬 glyph in its bottom half. Each numeral is a beautiful polished Mahjong brush engraving like the reference six seven eight nine: rounded generous black strokes, not a regular printed font, not overly ornate. Use traditional 萬, NOT 万. Match the large reference foreground lettering closely. All nine must be present once.

## honors

Use case: stylized-concept. Asset type: production Mahjong INK / ENGRAVING texture atlas for UV mapping onto our own offline-rendered ivory tile solids. The attached image is a STYLE REFERENCE only, especially the large foreground tiles. Match the refinement, chunky legible Chinese strokes, traditional real Mahjong engraving, intense black, cinnabar red and deep green. Create ONLY the printed symbols, not the white tile body, not a bevel, not a rectangle, not a shadow or game UI. Genuine transparent background (alpha), crisp anti-aliasing. Straight-on orthographic flat ink, consistent minute engraved rim detail, no perspective, no gradients across the canvas. 1024 x 1536 portrait canvas, exactly 3 columns by 3 rows equal cells. Each symbol composition centered inside its cell, occupying about 78% of cell width and 82% of cell height. Keep all artwork inside its own cell with generous clean transparent separators, no gridlines, no labels or numbering beyond the actual Mahjong glyphs. Consistent optical sizes. This is for older players at small screen size: thick confident strokes, clean open counters, exact numerals, no wispy calligraphy.
Seven honor tile symbols plus two completely EMPTY transparent cells. Row1: 東 in bold black, 南 in bold black, 西 in bold black. Row2: 北 in bold black, 中 in cinnabar red, 發 in dark emerald green. Row3: a traditional white-dragon blue double-line rectangular frame ONLY in first cell, second and third cells entirely transparent. Honor glyphs should occupy ~80% of each cell, hand-carved heavy calligraphy matching fine traditional Chinese Mahjong tiles, exact characters and colours. Blue frame rounded ornamental small stepped corners, no white fill. No extra symbols.

## dots

Use case: stylized-concept. Asset type: production Mahjong INK / ENGRAVING texture atlas for UV mapping onto our own offline-rendered ivory tile solids. The attached image is a STYLE REFERENCE only, especially the large foreground tiles. Match the refinement, chunky legible Chinese strokes, traditional real Mahjong engraving, intense black, cinnabar red and deep green. Create ONLY the printed symbols, not the white tile body, not a bevel, not a rectangle, not a shadow or game UI. Genuine transparent background (alpha), crisp anti-aliasing. Straight-on orthographic flat ink, consistent minute engraved rim detail, no perspective, no gradients across the canvas. 1024 x 1536 portrait canvas, exactly 3 columns by 3 rows equal cells. Each symbol composition centered inside its cell, occupying about 78% of cell width and 82% of cell height. Keep all artwork inside its own cell with generous clean transparent separators, no gridlines, no labels or numbering beyond the actual Mahjong glyphs. Consistent optical sizes. This is for older players at small screen size: thick confident strokes, clean open counters, exact numerals, no wispy calligraphy.
Nine dots/circles suit faces in row-major order 1 through 9. EXACT pip counts and traditional layout. 1: a single large elaborate circular green rosette medallion with red central flower, beautiful crisp concentric engraved rings, fills cell. 2: two vertically aligned BLACK ring pips. 3: diagonal green upper-left, red centre, black lower-right. 4: four black ring pips in 2x2. 5: four black corner pips plus red centre. 6: two green upper pips above four red pips, 2 columns x 3 rows. 7: three green pips in upper diagonal above four red lower pips. 8: eight BLACK pips in 2 columns x 4 rows. 9: 3 columns x 3 rows, green upper row, red middle row, black bottom row. Fine concentric rings with transparent centres, hefty readable outer rings, exact counts. Match reference six/eight circles in foreground, no Chinese text.

## bamboo

Use case: stylized-concept. Asset type: production Mahjong INK / ENGRAVING texture atlas for UV mapping onto our own offline-rendered ivory tile solids. The attached image is a STYLE REFERENCE only, especially the large foreground tiles. Match the refinement, chunky legible Chinese strokes, traditional real Mahjong engraving, intense black, cinnabar red and deep green. Create ONLY the printed symbols, not the white tile body, not a bevel, not a rectangle, not a shadow or game UI. Genuine transparent background (alpha), crisp anti-aliasing. Straight-on orthographic flat ink, consistent minute engraved rim detail, no perspective, no gradients across the canvas. 1024 x 1536 portrait canvas, exactly 3 columns by 3 rows equal cells. Each symbol composition centered inside its cell, occupying about 78% of cell width and 82% of cell height. Keep all artwork inside its own cell with generous clean transparent separators, no gridlines, no labels or numbering beyond the actual Mahjong glyphs. Consistent optical sizes. This is for older players at small screen size: thick confident strokes, clean open counters, exact numerals, no wispy calligraphy.
Nine bamboo suit faces in row-major order 1 through 9, EXACT stalk counts. 1: one elegant traditional green peacock / sparrow Mahjong engraving, primarily deep green with delicate small red detail, no cartoon outline. 2: TWO separate elongated green bamboo stalks in ONE VERTICAL COLUMN, one above the other, NEVER side by side. 3: one green stalk at top centre, two below. 4: four long green stalks in 2x2. 5: green stalks at four corners and one red central stalk. 6: six green stalks, 3 columns x 2 rows. 7: one red top-centre stalk above six green stalks in 3x2. 8: traditional symmetrical bent bamboo groups, four green segments above and four below, clear 8-bamboo zigzag shape. 9: three columns x three rows, central column red and two outer columns green. Each stalk is stout, carved bone/gourd-like shape with a delicate pale engraving channel, like the reference four bamboo. Large symbols, no text, no extraneous decoration.

## 八条修正

Use case: precise-object-edit. Edit target: the attached transparent 3x3 Mahjong bamboo ink atlas. Change ONLY the bottom row MIDDLE cell (eight bamboo / 八条 / 八索). Replace its incorrect eight straight bamboo stalks with the correct traditional EIGHT BAMBOO glyph: TWO LARGE GREEN ZIGZAG BAMBOO MOTIFS vertically stacked, upper motif clearly W-shaped, lower motif its upside-down mirror M-shaped. Each W/M uses four connected diagonal bamboo segments with small rounded joints. At small size the outline must unmistakably read W above M, exactly like a traditional Chinese mahjong 8 bamboo engraving, not a set of vertical stalks. The two motifs are separate with a clean gap. Solid deep green engraved ink, delicate inner ivory/transparent groove, same bold stroke weight and refinement as the surrounding bamboo symbols. Keep the EXACT canvas size, grid registration, all other eight cells, bird, colours, symbol counts, transparency and margins unchanged. Genuine transparent background; no new glow, no background, no tile body, no captions.
# Eight bamboo and eight bonus flowers correction — 2026-09-15

Generated with the built-in imagegen tool. Eight bamboo uses the inspected traditional shape (upper W / lower M with upright outer legs) as a geometry reference. Reference sprites are for inspection only and are not shipped. Flowers are original generated illustrations; the canonical kind order remains 春、夏、秋、冬、梅、兰、竹、菊 (34–41).

Rules checked: https://static.laiyouxi.com/games/44.html (Nanjing's 20 hard flowers, including eight seasons/flowers and four each of 中、发、白); https://zh.wikipedia.org/wiki/麻雀牌 (八索 W above M).

Final ink sources: `cocos-table/art-source/imagegen/eight-bamboo-v3.png`, `flowers-v1.png`. `prepare-ink.mjs` replaces kind 25 separately so the rejected v2 eight is never baked into output.

## Eight bamboo prompt

Use case: stylized-concept. Production Mahjong ink/engraving texture, one isolated EIGHT BAMBOO symbol, transparent alpha background, 1024x1536 portrait. Image 1 is a precise SHAPE reference of traditional 八条. Image 2 is our ink texture STYLE reference; replace its mistaken eight-bamboo design by drawing ONE isolated correct eight symbol, not a nine-cell sheet.
Follow Image 1's geometry precisely: TWO SEPARATE BROAD GREEN GROUPS, upper group W, lower group M, each group has FOUR bamboo strokes. Outer left and right strokes are almost VERTICAL, thick and capped, and the two inner diagonals meet at the center. The upper W center peak rises nearly as high as the tops of the two outside uprights. The lower M is its vertical mirror. Both groups same width, each group width about 1.5 times its height. Clear horizontal gap between groups about 18% of a group's height. Upper W and lower M must NOT touch, cross, twist, or form an hourglass. The overall two-group silhouette fills about 70% canvas width and 78% height, centered.
Premium dark jade green carved enamel ink, confident thick bamboo strokes with tiny joint collars, subtle narrow light edge and engraved inner detail so clearly readable at 35px. Match Image 1's Chinese mahjong shape, not a typeset W/M font. No tile body, no rectangle, no shadow, no backdrop, no extra bamboo stems, no numerals or Chinese labels. Real transparent alpha outside artwork.

## Eight flowers prompt

Use case: stylized-concept. Production Mahjong engraved INK texture sheet, 8 bonus flowers/seasons for Nanjing Mahjong. Transparent alpha background. 1024x1536 portrait, exactly 3 columns by 3 equal rows, each cell 341x512 approximately. Only printed glyphs and carved floral artwork, no tile bodies, no frames, no shadows, no UI. Refined traditional Chinese enamel engraving: bold legible red / dark-jade green stems and foliage, restrained golden flower centers, subtle crisp engraved line detail. Designed to texture ivory 3D mahjong tiles and remain readable at small size. Not watercolor, not cartoon, no gradients/glow outside painted strokes.
Eight distinct cells, exact order row-major:
row1: 春 with red peony blossoms and green leaves; 夏 with red lotus bloom and two green leaves; 秋 with russet-red leafy chrysanthemum sprig;
row2: 冬 with red camellia flowers and dark green leaves; 梅 with a branching red plum blossom sprig; 兰 with elegant long narrow green orchid leaves and small red orchid blooms;
row3: 竹 with three upright jointed jade bamboo stalks and pointed leaves; 菊 with a large dense red chrysanthemum and two green leaves; last cell COMPLETELY EMPTY transparent.
Each of eight cells has its exact Chinese label 春 夏 秋 冬 梅 兰 竹 菊 carved at upper left in clear traditional calligraphic strokes, label at least 20% cell height, with illustration below/right occupying 72% width and 65% height. Each flower clearly different. Consistent stroke weight and visual scale. Maintain at least 10% transparent cell margin, no artwork crossing cell boundaries. No other text.
# Six dots centering and level table tiles — 2026-09-15

The user requested parallel tile edges on all exposed racks/rivers and centered six-dot artwork. The baker now removes lateral camera yaw from all exposed tiles. Six dots has its own reviewed texture, avoiding the adjacent-cell fragment at the top of the first sheet's sixth cell. The ink packer centers the complete alpha bounds of the isolated six-pip group. Built-in imagegen source: `cocos-table/art-source/imagegen/six-dots-v2.png`.

## Six dots prompt

Use case: precise-object-edit. Create the isolated SIX DOTS (六筒 / 六饼) ink symbol from the supplied texture sheet, preserving exactly its circular ring engraving style and colors. Output one single tile's transparent INK texture, 1024x1536, not a nine-tile sheet. Exactly six equal-size circular pips: two columns and three rows, two dark emerald green pips on top, four red pips in the lower two rows. Equal horizontal and vertical center-to-center spacing. Each pip has a dark outer disk with a narrow light inner circular groove. Center the bounding rectangle of the WHOLE SIX-PIP GROUP on the canvas both horizontally and vertically. Whole group occupies 72% canvas width and 70% canvas height; identical top and bottom transparent margins. Clean circular pips only, no line, fragment, mark or speck near the canvas edges. NO tile body, NO white background, NO perspective, no text, no shadow, no glow outside painted symbols. Genuinely transparent alpha. Refined readable Chinese mahjong face engraving, thick clean consistent edges.


## Centered two-dot correction (2026-09-15)
Original isolated imagegen asset `two-dots-v2.png` replaces the miscentred sheet cell.
Prompt: exactly two identical dark jade concentric circular pips, vertically centred at 29% and 71%, refined ring engraving, equal diameter, transparent background, no tile body or text. The engraving shader supplies material relief on the actual solid surface.

## Five- and nine-dot corrections (2026-09-15)
`five-dots-v2.png`: exactly four black corner pips and one central red pip, identical diameters, symmetric quincunx, no edge fragments or tile body.
`nine-dots-v2.png`: regular 3×3 grid of equal concentric pips, top black, middle red, bottom jade green, centred on transparent UV canvas.
Both are original imagegen ink assets, subsequently rendered as recessed enamel on the solid tile.


## 2026-09-15 fixed flower grooves

`public/art/table-reference-v2.png` remains the production tabletop. Its original
four long grooves are retained. `FLOWER_SLOTS` records their inner corner
coordinates in the 1280 x 590 camera; flower centres, widths and projection
angles are computed from those fixed fixtures. The discarded v3 study erased
the grooves and framed the tiles, which did not meet the required appearance.

The offline Blender bake adds `flower-left` and `flower-right`: the evaluated
bevelled solid and its UVs receive the measured screen shear of each side slot.
The shear is applied to mesh vertices (object transforms would decompose and
lose shear). The runtime loads prerendered images; there is no live mesh or
lighting. Adjacent cards follow their projected body height, keeping their
edges together. Full racks gain a parallel companion groove for overflow.
