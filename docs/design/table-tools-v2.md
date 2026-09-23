# Table tools v2

The table toolbar now exposes only trustee/result. The top-left lobby button,
settings and the table/record toolbar entries were removed. Their underlying
commands, game rules and score calculations were not changed.

## Artwork

- Generation: built-in `image_gen`, one new transparent PNG.
- Web asset: `public/ui/table-tool-jade-v2.png`.
- Cocos asset: `cocos-table/assets/resources/art/table-tool-jade-v2.png`.
- Delivery preparation: resized to 256 × 256 with alpha preserved; no repainting.
- Icons and Chinese labels remain live UI/vector elements, not baked text.
- Web touch target: one 44 × 44 button aligned at the top-right.
- Cocos fallback target: `(1235, 35)`, 44 × 44.
- The original artwork prompt below mentioned two controls; the final approved
  interface now reuses that same skin for the single trustee/result control.

## Generation prompt (verbatim)

```text
Use case: stylized-concept
Asset type: production game UI button background sprite for a teal Chinese Mahjong table, intended to be reused for two small toolbar controls (autoplay and settings).
Primary request: design ONE small refined jade button background, not a complete interface or multiple variants.
Composition: single centered square button with generously rounded square corners (squircle), straight-on orthographic front view, parallel sides, fill nearly the entire square canvas with only 3 percent transparent safety margin. Uniformly plain and empty central 70 percent for crisp vector icon and short Chinese text added later in code.
Materials: deep dark petrol-teal jade enamel (#073f41 to #115659), extremely subtle satin jade grain, thin restrained champagne-gold perimeter hairline, a fine diffuse top-edge bevel highlight and a tiny soft contact shadow below. Only a very shallow tactile edge, not a chunky block.
Style: clean premium mobile board-game control, understated and calm, readable at 44 to 50 pixels. The center must remain dark, visually quiet and low contrast. It should sit naturally over deep turquoise-green felt.
Background: genuinely transparent alpha channel outside the silhouette and contact shadow.
Constraints: exactly one blank button; NO letters, NO Chinese characters, NO icon, NO logo, NO pictogram, NO decorative pattern, NO flourish, NO chess or Mahjong tile, NO external rings, NO glare, NO glow, NO framed page, NO mockup, NO table background, NO watermark. Square output.
```
