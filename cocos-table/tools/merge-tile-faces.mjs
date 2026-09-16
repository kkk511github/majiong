// Update selected faces without changing atlas metrics or any other suit.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const input = resolve(process.argv[2]);
const kinds = (process.argv[3] || '').split(',').map(Number);
if (!kinds.length || kinds.some(k => !Number.isInteger(k) || k < 0 || k > 41)) throw Error('Valid face IDs required');
const res = resolve(app, 'cocos-table/assets/resources');
const atlas = JSON.parse(await readFile(resolve(res, 'tile-atlas.json'), 'utf8'));
const poses = JSON.parse(await readFile(resolve(input, 'poses.json'), 'utf8'));
const pending = [], report = [];
for (const [name, pose] of Object.entries(poses)) {
  if (!atlas[name]) throw Error('Unregistered atlas: ' + name);
  const cells = [];
  let left = pose.cell, top = pose.cell, right = 0, bottom = 0;
  for (const k of kinds) {
    const { data, info } = await sharp(resolve(input, pose.file)).extract({ left: k % pose.columns * pose.cell, top: Math.floor(k / pose.columns) * pose.cell, width: pose.cell, height: pose.cell }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    cells.push({ k, data, info });
    for (let y = 0; y < pose.cell; y++) for (let x = 0; x < pose.cell; x++) if (data[(y * pose.cell + x) * 4 + 3] > 8) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  const width = right - left + 1, height = bottom - top + 1;
  const dest = resolve(res, 'tiles', name + '.png');
  const old = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = Buffer.from(old.data);
  const allowed = new Uint8Array(old.info.width * old.info.height);
  for (const { k, data: cell, info } of cells) {
    const r = atlas[name].rects[k];
    if (width !== r.w || height !== r.h) throw Error(`${name}: crop changed from ${r.w}x${r.h} to ${width}x${height}; refusing geometry change`);
    const patch = await sharp(cell, { raw: info }).extract({ left, top, width, height }).raw().toBuffer();
    for (let y = 0; y < height; y++) {
      const pixel = (r.y + y) * old.info.width + r.x;
      patch.copy(data, pixel * 4, y * width * 4, (y + 1) * width * 4);
      allowed.fill(1, pixel, pixel + width);
    }
  }
  for (let i = 0; i < data.length; i++) if (!allowed[Math.floor(i / 4)] && data[i] !== old.data[i]) throw Error('Changed a non-target atlas pixel');
  pending.push({ dest, png: await sharp(data, { raw: old.info }).png().toBuffer() });
  report.push({ pose: name, kinds, width, height, crop: { left, top }, otherFacesUnchanged: true });
}
// Validate every pose before writing any atlas.
for (const { dest, png } of pending) await writeFile(dest, png);
await writeFile(resolve(input, 'merge-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Updated ${kinds.length} faces in ${pending.length} poses; all other faces and metrics preserved.`);
