// Pack reviewed imagegen engravings into precise, shared tile UVs.
// This is asset preparation: artwork comes from the approved raster masters.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const art = resolve(app, 'cocos-table/art-source/imagegen/dots-redesign-v3');
const out = resolve(app, 'cocos-table/art-source/ink');
const W = 512, H = 755; // Matches the solid's 0.658 × 0.970 planar UV scale.
// Layout fractions refer to the 0.76 × 1.08 ivory face, not the smaller UV
// projection. Compensate here so a 27% pip stays 27% of the rendered face.
const scaleX = .76 / .658, scaleY = 1.08 / .97;
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
const grid = (xs, ys, colors) => ys.flatMap((y, row) => xs.map((x, col) => [x, y, colors[row][col]]));
export const dotLayouts = [
  { n: 1, diameter: .76, pips: [[.5, .5, 'rosette']] },
  { n: 2, diameter: .43, pips: [[.5, .29, 'green'], [.5, .71, 'black']] },
  { n: 3, diameter: .31, pips: [[.27, .24, 'green'], [.5, .5, 'red'], [.73, .76, 'black']] },
  { n: 4, diameter: .30, pips: grid([.28, .72], [.28, .72], [['green', 'black'], ['black', 'green']]) },
  { n: 5, diameter: .29, pips: [...grid([.27, .73], [.24, .76], [['green', 'black'], ['black', 'green']]), [.5, .5, 'red']] },
  { n: 6, diameter: .27, pips: grid([.29, .71], [.23, .55, .77], [['green', 'green'], ['red', 'red'], ['red', 'red']]) },
  { n: 7, diameter: .24, pips: [[.24, .18, 'green'], [.5, .29, 'green'], [.76, .40, 'green'], ...grid([.29, .71], [.61, .81], [['red', 'red'], ['red', 'red']])] },
  { n: 8, diameter: .26, pips: grid([.29, .71], [.185, .395, .605, .815], Array.from({ length: 4 }, () => ['black', 'black'])) },
  { n: 9, diameter: .22, pips: grid([.24, .50, .76], [.22, .50, .78], [['black', 'black', 'black'], ['red', 'red', 'red'], ['green', 'green', 'green']]) },
];

async function engraving(file, rect) {
  const { data, info } = await sharp(resolve(art, file)).extract(rect).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Remove the ivory substrate from the sampled engraving only. The renderer
  // supplies the same physical ivory body for all suits, so no rectangle/decal
  // or pre-lit bevel gets pasted onto the tile. Keep the generated pigment.
  for (let i = 0; i < data.length; i += 4) {
    const light = Math.min(data[i], data[i + 1], data[i + 2]);
    const t = Math.max(0, Math.min(1, (light - 100) / 85));
    data[i + 3] = Math.round(data[i + 3] * (1 - t * t * (3 - 2 * t)));
  }
  return sharp(data, { raw: info }).trim({ threshold: 16 }).png().toBuffer();
}

export async function prepareDots() {
  await mkdir(out, { recursive: true });
  const motifs = {
    green: await engraving('dots-6-v3-preview.png', { left: 215, top: 267, width: 280, height: 280 }),
    red: await engraving('dots-6-v3-preview.png', { left: 215, top: 667, width: 280, height: 280 }),
    black: await engraving('dots-9-v3-preview.png', { left: 145, top: 255, width: 255, height: 255 }),
    rosette: await engraving('dots-1-v3-preview.png', { left: 165, top: 330, width: 745, height: 750 }),
  };
  const report = [];
  for (const layout of dotLayouts) {
    if (layout.n !== 1 && layout.pips.length !== layout.n) throw Error('Incorrect pip count');
    const size = Math.round(layout.diameter * W * scaleX);
    const layers = [];
    for (const [x, y, color] of layout.pips) {
      const left = Math.round((.5 + (x - .5) * scaleX) * W - size / 2);
      const top = Math.round((.5 + (y - .5) * scaleY) * H - size / 2);
      if (left < 0 || top < 0 || left + size > W || top + size > H) throw Error('Pip exceeds face');
      layers.push({ input: await sharp(motifs[color]).resize(size, size, { fit: 'fill' }).png().toBuffer(), left, top });
    }
    await sharp({ create: { width: W, height: H, channels: 4, background: clear } }).composite(layers).png().toFile(resolve(out, `${layout.n + 8}.png`));
    report.push({ kind: layout.n + 8, ...layout, pixelDiameter: size, canvas: [W, H], uvScale: [scaleX, scaleY] });
  }
  await writeFile(resolve(art, 'production-layouts.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Prepared nine reviewed imagegen dot faces with exact pip counts and circular UV scale.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareDots();
