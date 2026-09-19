# 牌桌动效设计完整提示词

工具：内置 image_gen。用途：本地设计预览，未改正式版。

## 第一版

Use case: ui-mockup.
Asset type: high-fidelity visual redesign proposal for the existing 金陵麻将 landscape mobile game, preview only.
Input image 1 is the EXISTING APP STYLE AND TABLE REFERENCE, not a gameplay state to reproduce. Redesign the positions and feedback shown there into a polished product design presentation. Preserve the identity: green mahjong felt, slightly warm wooden rails, physical ivory tiles with green backs and classic Chinese tile faces, four seats. The table remains familiar, almost top-down with slight 3D depth, practical and readable on a phone.

Create one exceptionally refined large landscape design sheet, about 1536x1024. Top 70%: a large beautiful 4-player landscape table, not a phone device mockup, with slim presentation heading above reading exactly "牌桌 · 动效与布局". Bottom 25%: three closeup design details on a pale warm paper background, carefully aligned, labeled "碰杠归位", "扣分提醒", "补花与摸打". High-fidelity UI rendering, restrained Chinese typography, generous spacing, realistic tile materials, fine natural shadows. Not fantasy concept art.

Main table specifics:
- All four seats visible. Human-facing bottom hand large and crisp along bottom edge; left and right concealed hands vertical at the edges; top concealed hand along top edge. Four small portrait+name score panels near corners/outer sides, no faces in the middle.
- Melds have reserved fixed lanes just inside each player's hand, aligned to that player's orientation. Grouped 3-tile pungs and 4-tile kongs, distinct 10px gaps between groups. Example bottom left two groups separated cleanly from a remaining short hand at bottom right. Side melds face their owner. Exposed melds cannot extend into the central counters or discard grid.
- One concealed kong closeup shows exactly three green backs as the base and one face-up 五万 tile raised slightly over the center; three backs plus one face = four physical tiles. A pung has exactly three matching 五万 tiles; added kong has exactly one matching extra tile placed above middle. Do not draw 5 tiles for a kong.
- Four compact discard grids closer to center, clearly separated from meld and flower lanes. One discarded 六条 subtly yellow to preserve the app's global-single-wait anchor indication, distinct from temporary action flashes.
- Central wind compass and status must be fully unobstructed and smaller than in reference. Legible exact labels "余牌 56", "余花 12", "第 3 / 8 把". No large action text at center.
- Flower tiles in narrow orderly small tray next to each player's meld lane; one modest softly illuminated flower insertion shown. The flower face remains recognizable and readable.
- A small elegant ivory-gold "暗杠" action word appears in front of BOTTOM player's meld lane, not over center, with subtle thin warm glimmer. Small "-5" warm pale-gold numerals are visible in front of each of the OTHER THREE players, close to their own tiles, never red/pink/neon. No deduction in front of the bottom kong actor. Minimal translucent deep green backing only if needed for contrast.
- Clean table edges, small exact label "南京麻将", subdued neutral command buttons; do not invent monetary currencies, bet controls, advertisements or rewards.

Bottom detail cards:
1. "碰杠归位": enlarged demonstration of an exposed triple with a delicate source marker and a separate concealed kong three backs plus one revealed face; a small ivory-gold action "碰" and "暗杠", sharp visibility.
2. "扣分提醒": a player's nearby tile edge with elegant "-10" and small caption "明杠", and a second understated "-5" with caption "暗杠"; visually refer to payer positions, not total balance. This is separate examples, not simultaneous collection.
3. "补花与摸打": 3 small sequential representations of the SAME tile gliding into a hand-right gap, then a raised tile and smooth curved motion cue settling into discard lane; a flower tile settling into small flower tray. Use only slight ghost positions and fine curved path to communicate fluidity, no speed-blur hiding tile glyphs.

Composition should feel like a professional finished design review board for a real shipped game. Exact Chinese labels only as listed; keep other text minimal. Warm gold is sparing, deepest jade background frames the sheet, cream bottom cards. No neon, no coins, no explosions, no full-screen golden calligraphy, no white smartphone border, no excessive ornament. Primary goals: spatial clarity, no central obstruction, coherent 3D tile directions, elegant feedback, fluid physical motion.

## 定向修订

Use case: precise-object-edit / ui-mockup.
Edit this design board, preserving the overall composition, green felt / wood / ivory aesthetic, its three lower detail cards, and the elegant central status. Make ONLY these important correctness and clarity fixes, with exact readable Chinese:

1. In BOTH the main table and the lower-left detail, the concealed kong MUST be exactly FOUR tiles total, in a simple flat row: green back, green back, face-up 八条, green back. DO NOT stack anything on top; DO NOT create five tiles. Only ONE visible 八条 face and exactly THREE green backs. The pung remains three matching 五万 tiles, clearly separate. Using 八条 for the kong also prevents impossible extra 五万 copies.
2. On the main table, because the bottom player has two melds, shorten the remaining front hand to SEVEN tiles total, toward the bottom-right, and keep melds bottom-left in their reserved lane. Leave a small extra gap for the next drawn tile; do not draw a duplicate full 14-tile hand.
3. The lower middle card contains WRONG scoring text. Remove that old line completely and replace it verbatim with two clear short lines:
"明杠：出牌者 −10"
"暗杠：其他三家各 −5"
Put a tiny separate caption "普通局示例" if there is room. Do not write that 明杠 charges all three players. No currency.
4. Reposition the main table's THREE "-5" feedback numerals to sit just INSIDE each OTHER player's tile lane, in the felt strip between their tiles and their discard grid. They belong in front of the player's tiles, not below an avatar. Use soft ivory-gold, no glow burst. The bottom kong player has no minus score.
5. Add one small exposed pung row near the top player's hand and one near the right player's hand, no central overlap, to demonstrate fixed seat-aligned positions. Shorten the top/right concealed hand by three tiles each accordingly. Use different tile kinds, coherent physical tile counts.
6. Remove the invented top-right marketing slogan; leave only small "南京麻将".
Everything else keep the same, restrained and highly legible. No decorative additional text. Keep final image as a finished product UI design proposal.
