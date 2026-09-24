# New porcelain action buttons

Generated with built-in image_gen, not CLI. These are new circular action sprites and do not reuse the toolbar / phrase button background.

- Pung / Kong: `public/ui/action-disc-normal-v1.png` with live deep-teal text.
- Hu: `public/ui/action-disc-hu-v1.png` with live cinnabar text.
- Pass: `public/ui/action-disc-pass-v1.png` with live pale slate text.
- Chinese labels and accessibility/command IDs remain live; alpha and original PNGs preserved.
- Removed captions below the four action characters. If multiple self-kongs are possible, a tiny actual tile thumbnail identifies each choice without restoring text captions.
- Gentle readiness rings on pung/kong/Hu and a much slower, subtler ring on pass; press feedback does not move the click target. No captions or hover-description tooltips. Reduced-motion disables the loops. Confirmed pung uses a short, one-shot cyan cue placed away from hand faces.

## Final prompt set

### normal

Use case: stylized-concept. Asset type: production mobile Mahjong ACTION BUTTON sprite, not a whole UI screen. A SINGLE perfectly circular tactile porcelain medallion viewed dead-on, centered, on a genuinely transparent background. Circle fills 94% of square canvas. New circular visual language, completely unlike a rectangular toolbar button. Fine rounded porcelain rim, very shallow realistic relief, soft upper-left studio highlight, barely visible contact shadow immediately underneath. Broad EMPTY central face reserved for a large Chinese character rendered later by game code. Clean luxury game interface but restrained: no patterns, no symbols, no letters, no Chinese text, no logo, no ornament, no gold, no yellow, no spiky glow, no square base, no background scene, no checkerboard. Actual alpha outside the circle. Designed to stay clean at 50 pixels. Normal action (pung / kong) family: luminous warm-white ivory ceramic central disc (#eaf3f1) with a narrow deep blue-teal glazed edge (#215368), a subtle silver-cyan inner rim. Matte/satin face, not metallic. The blue rim is fine, no heavy frame. Future dark teal character will be highly readable.

### hu

Use case: stylized-concept. Asset type: production mobile Mahjong ACTION BUTTON sprite, not a whole UI screen. A SINGLE perfectly circular tactile porcelain medallion viewed dead-on, centered, on a genuinely transparent background. Circle fills 94% of square canvas. New circular visual language, completely unlike a rectangular toolbar button. Fine rounded porcelain rim, very shallow realistic relief, soft upper-left studio highlight, barely visible contact shadow immediately underneath. Broad EMPTY central face reserved for a large Chinese character rendered later by game code. Clean luxury game interface but restrained: no patterns, no symbols, no letters, no Chinese text, no logo, no ornament, no gold, no yellow, no spiky glow, no square base, no background scene, no checkerboard. Actual alpha outside the circle. Designed to stay clean at 50 pixels. Primary winning action (Hu) family: luminous very pale celadon central disc (#d7f1ef), polished teal-blue rim (#287991) and a restrained bright ice-cyan highlight along the rim. Slightly brighter and more dimensional than the normal action, but no glow outside. Future deep cinnabar-red character will be highly readable.

### pass

Use case: stylized-concept. Asset type: production mobile Mahjong ACTION BUTTON sprite, not a whole UI screen. A SINGLE perfectly circular tactile porcelain medallion viewed dead-on, centered, on a genuinely transparent background. Circle fills 94% of square canvas. New circular visual language, completely unlike a rectangular toolbar button. Fine rounded porcelain rim, very shallow realistic relief, soft upper-left studio highlight, barely visible contact shadow immediately underneath. Broad EMPTY central face reserved for a large Chinese character rendered later by game code. Clean luxury game interface but restrained: no patterns, no symbols, no letters, no Chinese text, no logo, no ornament, no gold, no yellow, no spiky glow, no square base, no background scene, no checkerboard. Actual alpha outside the circle. Designed to stay clean at 50 pixels. Secondary pass action family: understated desaturated slate-blue ceramic central disc (#23475a), subtle fine blue-silver rim (#7697a5), low visual emphasis, satin finish. Future pale blue-gray character will be clearly readable. Same circular geometry, no glass transparency inside the disc.
