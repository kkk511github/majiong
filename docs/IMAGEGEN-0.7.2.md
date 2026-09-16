# 胡牌提示设计与 ImageGen 记录

使用内置 image_gen，未使用 CLI/API 回退。原图保存在本项目，生产素材保留透明 alpha。

- UI 概念图：`docs/design/win-hints-concept-v1.png`（设计参考，不用于识别牌或计数）。
- 胡牌徽章原图：`docs/design/hu-badge-v1-source.png`。
- 实际使用的透明素材：`public/art/hu-badge-v1.webp`，256px，WinHintPanel 可胡牌状态调用。
- 真实界面：React 大牌面提示、实时规则听口、公开未见数、横滑及明确的照直确认；不是把生成图片当作交互界面。

## 概念图完整提示词

Use case: ui-mockup. Create a polished landscape mobile Chinese Mahjong UI design study focused on a completely redesigned listening/winning hint panel. Dark emerald felt game table, vivid ivory jade 3D mahjong tiles with bright red and green engraved faces. Show a compact elegant ivory and emerald card directly ABOVE the player's bottom hand without covering the hand or center discard piles. Panel left has small gold '听' badge, clear readable title '打出后可听', selected discard tile preview; right shows a row of five clearly separated large upright mahjong tile thumbnails, each with small neutral text below '未见 2', '未见 3', '未见 1', '未见 2', '未见 4'. Fine warm brass borders, subtle dimensional shadows, high contrast typography, restrained premium Chinese game design. Separate small prominent emerald-gold '胡' button at lower right when eligible. This is a UI concept reference for code implementation, not an advertisement. Wide 1536 by 1024 composition with the relevant bottom table portion large and legible. No people, no mascots, no lens flares, no tiny dense labels, no floating yellow sentence covering tiles. Text verbatim as specified. Palette matches emerald mahjong felt, ivory tile faces, gold accents.

## 徽章完整提示词

Use case: stylized-concept. Asset type: production mobile Mahjong winning indicator emblem. Create ONE circular deep emerald jade medallion with a finely beveled warm gold rim and the single bold Chinese character 胡 in raised ivory-gold centered inside. Beautiful dimensional carved jade and brushed gold, clearly readable at 48 pixels, front-facing orthographic, restrained classic Chinese game craftsmanship, softly lit upper left, very clean crisp silhouette. Genuine transparent alpha background, no opaque backdrop, no checkerboard baked in. No other letters, no extra text, no other objects, no long flourishes, no particles, no lens flare, no cast shadow outside the emblem. Emblem fills 85% of a square image. Character text verbatim: 胡.
