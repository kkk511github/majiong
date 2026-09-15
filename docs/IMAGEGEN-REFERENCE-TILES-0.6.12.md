# Reference table and tile textures

### table-reference-v2.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Use case: precise-object-edit. Input image is the EXACT approved game-table design, not a loose inspiration. Produce the empty background plate for this exact screen. Preserve pixel-aligned camera, trapezoidal table perspective, dark green woven felt, subtle embossed center pattern, warm wood rails, side brown ambient margins, lighting and shadows of the TABLE, and the inset long flower-slot outlines at left, top, right and bottom. Remove EVERY mahjong tile, every tile wall, all gold action buttons, all menu/time icons, all words/numbers/logos and the central countdown device. Fill only those removed object areas naturally with the same surrounding green felt or brown margin. Do not add any objects or decoration. Do not change camera, perspective, rail widths, crop, or color. Wide composition matching original approx 2.196:1. This is a production background bitmap for an interactive app whose actual tiles will render in code.

### tiles/reference/wan.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Create a production mahjong FACE texture atlas, matching the tiles in the attached exact visual reference. This is not a redesign: match the bottom hand's black broad brush calligraphy, red 萬 character, clean nearly white smooth enamel, fine gray beveled perimeter, slightly rounded RECTANGULAR corners. Avoid yellow cream, inflated pillow shapes, inset frames, engraved 3D letters, drop shadows, decorations. The printed glyphs are bold flat lacquer ink. The tile face itself has a subtle white-to-light-gray edge for volume.
Output portrait 1024x1536 PNG, a regular THREE columns by THREE rows grid of NINE identical front-facing upright rectangular mahjong face sprites. Identical tiles roughly 290 wide x 430 high, equal grid pitch and gutters, centered in their cells. Each tile is flat facing the camera (no perspective tilt). Outside tiles transparent alpha. Tile width:height about 0.70. No labels outside tiles. No green back/body in these face textures; game code adds that body.
Exact row-major content:
top row 一萬, 二萬, 三萬;
middle row 四萬, 五萬, 六萬;
bottom row 七萬, 八萬, 九萬.
Numbers BLACK in the same loose thick readable Chinese brush lettering as reference. 萬 RED below. The numbers occupy upper 40%, large red 萬 lower 50%, with only a slim safe margin. Match shapes especially 六 七 八 九 shown in the reference bottom hand. All nine correctly legible. No invented symbols, no simplified 万.

### tiles/reference/dots.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Production mahjong tile face atlas. The first reference is the EXACT desired game style: white rectangular enamel face, narrow gray beveled edge, tiny rounded corners, flat printed crisp saturated ink. The second reference gives the THREE by THREE atlas arrangement and approximate face sizes; match its uniform geometry, but reduce the rounded/puffy bevel to the restrained squared-off tile edges of the game reference. All front-facing, no perspective or tilt, no green bodies, no shadows outside the face, transparent alpha outside nine tiles. Portrait 1024x1536, THREE columns x THREE rows, nine identical 290x430 front face sprites centered in regularly spaced cells. No text outside tiles, no numbers or labels under them. Large symbols fill most of the white face (small 7% edge margin). Render all NINE circle (筒/饼) tiles in row-major numerical order. Use the reference game's simple concentric double rings, solid color and white inner ring, not metallic or engraved. EXACT layouts and counts: Row 1: ONE circle dark green with red center; TWO dark green circles in vertical line; THREE circles diagonally descending green, red, black. Row 2: FOUR black circles 2x2; FIVE black circles four corners +red center; SIX circles 2columns x3rows, top2 green, lower4 red. Row 3: SEVEN:3small green circles diagonal in upper half +4red circles2x2 in lower half; EIGHT:8black circles2columns x4rows; NINE:9circles3x3,top3black,middle3red,bottom3green. Counts must be exact. Rings should be bold enough to read on a phone.

### tiles/reference/bamboo.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Production mahjong tile face atlas. The first reference is the EXACT desired game style: white rectangular enamel face, narrow gray beveled edge, tiny rounded corners, flat printed crisp saturated ink. The second reference gives the THREE by THREE atlas arrangement and approximate face sizes; match its uniform geometry, but reduce the rounded/puffy bevel to the restrained squared-off tile edges of the game reference. All front-facing, no perspective or tilt, no green bodies, no shadows outside the face, transparent alpha outside nine tiles. Portrait 1024x1536, THREE columns x THREE rows, nine identical 290x430 front face sprites centered in regularly spaced cells. No text outside tiles, no numbers or labels under them. Large symbols fill most of the white face (small 7% edge margin). Render NINE bamboo (条/索) tiles in row-major numerical order. EXACT content: ONE: traditional green and red sparrow on a thin branch; TWO:2 green bamboo sticks vertical; THREE:3 green sticks triangle(one above,two below). FOUR:4 green sticks2x2; FIVE:4green sticks at corners plus1RED center; SIX:6green sticks THREE COLUMNS xTWO ROWS. SEVEN:1RED stick top center +THREE green middle +THREE green bottom (7total); EIGHT:two green W/M-shaped bamboo ligatures stacked vertically, exactly like 八条 in the game reference, total8segments, not straight sticks; NINE:9sticksTHREE columns xTHREE rows, red center column3sticks and green outer columns6sticks. Use thick vivid dark green lobed bamboo shapes with a narrow white slit and round segmented ends, exactly like FOUR bamboo in game reference. Do not generate wrong counts.

### tiles/reference/bamboo.png (vertical two-bamboo correction)

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Precise correction to this production mahjong atlas. Preserve the exact image size, all tile rectangles, background, colors and ALL eight other tile faces pixel aligned. Change ONLY the upper-middle tile, the TWO BAMBOO tile: it must show TWO slender green bamboo sticks stacked VERTICALLY in one column (one above the other), NOT side by side. Make these two separate short sticks the same shape as the three-bamboo tile to its right, each with rounded lobes and a narrow white slit. Keep generous white space between the two. Do not alter any other tile or its symbol count. Same 1024x1536 PNG.

### tiles/reference/honors.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Production mahjong tile face atlas. The first reference is the EXACT desired game style: white rectangular enamel face, narrow gray beveled edge, tiny rounded corners, flat printed crisp saturated ink. The second reference gives the THREE by THREE atlas arrangement and approximate face sizes; match its uniform geometry, but reduce the rounded/puffy bevel to the restrained squared-off tile edges of the game reference. All front-facing, no perspective or tilt, no green bodies, no shadows outside the face, transparent alpha outside nine tiles. Portrait 1024x1536, THREE columns x THREE rows, nine identical 290x430 front face sprites centered in regularly spaced cells. No text outside tiles, no numbers or labels under them. Large symbols fill most of the white face (small 7% edge margin). Render mahjong HONORS in exact row-major cells: Row1 東, 南, 西; Row2 北, 中, 發; Row3 a traditional white-dragon WHITE BOARD with a narrow blue double-line rectangle, a blank plain white face, another blank plain white face. All winds BLACK, 中 RED, 發 GREEN. Large beautiful authentic loose Kaiti brush calligraphy with varied line thickness, like East and West in game reference; not a heavy bold display typeface. Each wind fills75% of face height. The white-board blue rectangle fills75%height and65%width, white center. No other decorations.

### tiles/reference/flowers.png

Mode: imagegen reference edit. Reference: /Users/kk/Desktop/截屏2026-09-15 12.26.54.png (and generated face atlas for material continuity). Original PNG files are preserved unmodified. CSS frame rectangles crop the source; physical depth and orientation are rendered by the scene.

Prompt:

Production mahjong tile face atlas. The first reference is the EXACT desired game style: white rectangular enamel face, narrow gray beveled edge, tiny rounded corners, flat printed crisp saturated ink. The second reference gives the THREE by THREE atlas arrangement and approximate face sizes; match its uniform geometry, but reduce the rounded/puffy bevel to the restrained squared-off tile edges of the game reference. All front-facing, no perspective or tilt, no green bodies, no shadows outside the face, transparent alpha outside nine tiles. Portrait 1024x1536, THREE columns x THREE rows, nine identical 290x430 front face sprites centered in regularly spaced cells. No text outside tiles, no numbers or labels under them. Large symbols fill most of the white face (small 7% edge margin). Render mahjong flower faces in exact row-major order: 春 with plum blossom(red), 夏 with orchid(green/red), 秋 with chrysanthemum(green/orange), 冬 with bamboo(green), 梅 red plum blossoms, 蘭 orchid, 竹 bamboo, 菊 yellow chrysanthemum, lastcell blank plain whiteface. Small readable Chinese title at upperleft and a large traditional simple botanical illustration centered filling mostface. Match the floral tiles in the game reference: sparse crisp green leaves/stems with red accents, not photoreal plants or ornate illustration. Firstfour season namesred, secondfour plantnamesdarkgreen. Do not add decorative framing.

