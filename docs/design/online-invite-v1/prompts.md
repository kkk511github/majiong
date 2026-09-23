# image_gen prompts

Mode: built-in image_gen; generate; ui-mockup; two separate calls.
No source image was edited. Screens are design references, not runtime assets.

## Sender

```text
Use case: ui-mockup
Asset type: high-fidelity landscape mobile app screen, invitation sender, design proposal only.
Primary request: Design the online-player invitation interface for the existing Chinese Mahjong app 金陵麻将. This is an in-app interaction after the inviter has already taken a seat in a waiting room, not a share-to-social sheet. Render one coherent finished app screen, wide landscape roughly 2.16:1, no device bezel, no mockup perspective.
Style: restrained premium Chinese board-game UI. Deep petrol-teal (#073f41) waiting-room background, warm ivory (#faf5e5) dialog surface, champagne-gold (#d4b772) primary buttons, dark teal Chinese sans-serif text, tiny satin bevels, thin fine borders. Practical readable mobile typography and generous touch targets. No ornate decorative dragons, no heavy 3D.
Layout: A dimmed waiting room remains visible behind a centered large warm-ivory rounded modal, about 73 percent of screen width and 90 percent of screen height. Behind it only subtle hints of the seated waiting room and empty seat cards; no dealt Mahjong tiles. Modal content is the focus.
Modal header: large readable Chinese title exactly "邀请在线牌友"; top-right simple close X icon. Subtitle exactly "房间 248619 · 已入座 2/4 · 还差 2 位".
Below header: full-width quiet search box with a magnifier and placeholder exactly "搜索昵称 / ID".
Then four well-spaced horizontal user rows with fictional small round portrait avatars, name, smaller online status, right-aligned action. Do NOT use names or photos of real public people:
Row 1: name "清风", green online dot + text "在线 · 空闲", warm-gold button "邀请".
Row 2: name "秦淮月", green online dot + text "在线 · 空闲", warm-gold button "邀请".
Row 3: name "老王", green online dot + text "在线 · 空闲", muted outlined pill "等待回应 48s" (disabled sent state).
Row 4: name "钟山", muted status "对局中", disabled gray button "不可邀请".
Keep name and status aligned consistently; subtle hairline dividers. Make the actionable buttons clearly differentiated from disabled and waiting states.
Modal footer: secondary text action "复制房号" on the left; quiet explanatory text "邀请 60 秒内有效" on the right.
Background header reads "南京好友桌" and a discreet waiting state "等待牌友入座". All text must be faithful, well-spaced simplified Chinese, correctly spelled and not cut off. Exact four rows only, no duplicated controls. No batch-select or send-all controls. No QR code, no share icons, no real account identifiers, no extra toolbar buttons. This is a screenshot-like UI design, not an infographic, no annotations outside the app.
```

## Recipient

```text
Use case: ui-mockup
Asset type: high-fidelity landscape mobile app screen, invitation recipient, design proposal only.
Primary request: Design the matching incoming-table-invitation dialog for the Chinese Mahjong app 金陵麻将. Render ONE finished landscape mobile app screen roughly 2.16:1, straight-on, no device bezel. A user who is online and idle receives this invitation. They can explicitly reject or accept and sit at the table; never automatically move them.
Style: understated premium Chinese board-game UI, matching a petrol-teal (#073f41) app with cream (#faf5e5) rounded dialog and warm champagne-gold (#d4b772) primary button. Dark teal readable Chinese sans-serif text. Extremely restrained satin bevels and fine borders, no ornate dragons and no oversized illustration.
Layout: dimmed app lobby as background. One calm centered ivory invitation card occupies about 57 percent screen width and 86 percent screen height. Background page hints at "约局" and a waiting-table list, but subdued and not visually competing.
Top of card: small kicker "牌桌邀请", small unobtrusive "48 秒后失效" at top right. Below, a small round fictional friendly Chinese player's portrait and main headline exactly "老沈 邀请你来一桌". Supporting text exactly "南京好友桌".
Middle: a tinted pale-green compact information block, aligned two-column labels and values:
"房间号" -> "248619"
"本桌玩法" -> "进园子 B档 · 8 把"
"当前人数" -> "2/4 人"
Below block a compact row of four seat indicators: two occupied round portraits then two dashed empty seat icons. Keep all indicators contained inside card.
Under them show one short neutral line exactly "接受后自动入座，按本桌规则准备".
Bottom: two full-height mobile-friendly buttons on the SAME baseline and comparable generous touch-target size: left ivory outlined "拒绝"; right warm-gold filled primary "接受并入座". Both labels must be large and readable; refusal must not be hidden or tiny. A tiny bottom note "仅限本次邀请" optional if space permits.
Exact simplified Chinese, clean aligned typography, no clipped text. No automatic countdown acceptance, no forced full-screen alert, no purchase or monetary prompts, no QR code, no social sharing icons, no additional buttons, no feature implementation implied, no external annotations.
```
