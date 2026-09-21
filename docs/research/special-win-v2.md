# Special win art v2

Generated with the built-in imagegen tool on 2026-09-18. Each asset was generated individually with transparent alpha, then resized to 768 x 512 WebP without changing the alpha. The four production files total approximately 546 KiB and are preloaded when the table mounts.

Assets: `public/art/win-v2/sea.webp`, `jade.webp`, `bloom.webp`, `celestial.webp`.

Prompt set:

- Sea: production Chinese Nanjing mahjong VFX overlay for 海底捞月; luminous pearl full moon nested within sweeping turquoise ocean waves, delicate silver droplets and tiny gold particles, wide oval around an empty central title area; high-end painterly 3D Chinese fantasy, cyan and sapphire with pale gold, crisp at 300px. Transparent 3:2 canvas, no text, panel, scenery, tiles, people or watermark.
- Jade: individual 全球独钓 VFX emblem; luminous emerald fishing line curves around a wide empty center, small golden hook holding one jade pearl, jade ripples and bamboo leaves, fine golden dust; glossy translucent jade, mint and amber, transparent 3:2 canvas, no text, people, scenery, rectangle, globe or watermark.
- Bloom: individual 杠上开花 VFX overlay; horizontal oval wreath of ruby-pink and peach magnolia blossoms on gold branches, translucent floating petals, amber sparkles; painterly 3D, fine gold ribbons, large empty title area, asymmetrical lower-left and upper-right clusters; transparent 3:2 canvas, no letters, people, tiles or solid backdrop.
- Celestial: rare-win VFX emblem; amethyst crystal clouds with fine golden celestial filigree, two star jewels at upper right, sweeping golden silk ribbon below; luminous lavender, violet and champagne, large empty title center, transparent 3:2 canvas, no text, people, cards, solid backdrop or watermark.

Original PNGs remain in `/Users/kk/.codex/generated_images/01a0ad10-9fd7-7182-a980-41909ca4cb95/`:

- Sea: `exec-1860bba9-85f0-4df6-9d97-d64a9e070fc1.png`
- Jade: `exec-a0b3667e-c5ff-4efc-8ed6-41f6c19eb39b.png`
- Bloom: `exec-49774223-cc60-4881-a9d5-1a7f33d6b5c7.png`
- Celestial: `exec-901fe95c-398f-4594-858e-5986c9b05acb.png`

The central overlay groups equal hand names and preserves seat-specific winner/discarder labels. Ordinary self-draw/discard wins keep their existing presentation. Scoring, payments, sound and server behavior are unchanged.

## September 18 morning revision

Ordinary 胡 and 自摸 now use `public/art/win-v2/gold.webp`, generated with the built-in imagegen tool. Original: `exec-2bbcd48d-dd3d-4b02-a79e-d35e7b57bad9.png` in the same generated_images directory. The opaque central plaque was removed from all themes; text uses a thin outline and shadow for contrast, with a small separate player-name label.

Prompt: production Chinese mahjong winning VFX sprite, genuine transparent alpha, horizontal 3:2 canvas; refined sweep of molten champagne-gold calligraphic energy, amber ribbons and a few crimson jewel sparks; empty center for live Chinese brush lettering; open asymmetric burst instead of oval medallion, crisp at 320px over green felt; no dark plaque, opaque backdrop, rectangle, circular border, plants, people, watermark or letters.

This revision also changes rules separately: B-profile same-kind four-discard penalty is 5 per opponent, 10 at 2x; kong-caused two-bankrupt endings protect the kong recipient; mobile zhaozhi declarations and their live rule effects are removed. The full unit suite passed 530 tests, followed by two additional concealed/flower-kong protection cases. The revised Word document was rendered and all seven pages inspected.

Local preview: `http://127.0.0.1:5180/output/design-v2/index.html`. It imports the actual table and effects, with controls for pattern, winner seat, replay and multiple winners. It is outside the production entry point and uses test fixtures only.
