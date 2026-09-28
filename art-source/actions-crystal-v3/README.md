# Crystal operation buttons v3 — 2026-09-27

Latest user direction supersedes the earlier non-glass/no-fire button direction.
Original transparent crystal base: OpenAI built-in image_gen, no external stock art.
Master: plate.png. Runtime: public/ui/actions-crystal-v3/plate.png, 256 × 256 RGBA.
Packaging: scripts/build-action-art.mjs (trim/resize only; manifest SHA-256).
Existing authored jade-v2 glyphs retained for consistent readable Chinese text.
Fire uses a separate generated transparent ring; blue arcs use code-native SVG in ActionButtonAura.tsx;
not baked into the image and never used as authoritative action announcements.
Button/input anchors and hit areas unchanged. These are the actual App React
operation controls over its Cocos table, not a separate HTML demonstration.
The standalone Cocos fallback retains its existing jade resources.

Hu: warm crystal tint, continuous 360-degree burning perimeter; two low-opacity
counter-flow texture layers with subtle breathing. No detached radial flame icons.
Master fire-ring.png; runtime fire-ring.png 256 × 256, center and exterior transparent.
Pung: blue single traveling arc. Kong: paired blue arc with slower heavy cadence.
Pass: neutral crystal, restrained intermittent sheen. No new ambient sound.
Pending/disabled, reduced-motion and simplified settings stop decorative motion.

## Final prompt (built-in mode)

Use case: stylized-concept. Asset type: production mobile mahjong UI button base sprite. Create ONE exquisitely polished rounded circular crystal-jade button, perfectly front facing, centered, real transparent background with generous clear margin. No text, no symbol, no icon. Material: translucent blue-green optical crystal, watery clear edges, soft rounded dome, subtle internal caustics and refracted highlights, deep teal central area for an ivory Chinese character to be composited later. Delicate pale cyan rim, thin construction, not thick metal. The surface should feel rounded, luminous and transparent, not a flat web button. Clean readable quiet center. Only localized restrained specular highlights near upper-left and lower-right curved edges. No rectangular backing, no gold frame, no pedestal, no environment, no baked fire, no particles, no outer glow haze, no cast shadow outside silhouette, no chessboard pattern. Symmetric circular silhouette, large enough to occupy roughly 85 percent of square canvas. Render a premium usable game UI asset, not a product photo at an angle.

## Continuous fire-ring prompt (built-in mode)

Use case: stylized-concept. Production game UI effect sprite: ONE continuous circular ring of living orange-gold fire, front-on perfectly round, centered. True transparent background and fully transparent empty center. The flame forms a narrow uninterrupted burning circumference around a circular button; a coherent flowing fire rim with many small irregular fine tongues bending tangentially along the rim. NOT eight separate flames, NOT petals, NOT a sun symbol, NOT spikes in radial symmetry. Organic varied filaments and molten amber eddies, pale yellow hot inner seam, orange outer tips. Keep fire within a thin annulus: inner opening diameter about 75 percent of outer silhouette diameter. The ring occupies 86 percent of the square canvas leaving transparent margin. Clear empty round center for a Chinese character button beneath, no text, no button base, no symbol, no objects. Refined mobile game VFX texture that reads at 70px wide. Crisp enough at small size, no smoke, no dark background, no checkerboard, no huge bloom, no sparks far outside the circumference. The fire must be a complete continuous 360 degree burning border, not isolated flame icons.
