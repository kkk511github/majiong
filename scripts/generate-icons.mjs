import sharp from "sharp";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";

const source = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const androidOnly = process.argv.includes("--android-only");
const iconBackground = "#0A442E";

// An optional source is cut out with an edge-connected flood fill. Never make
// every white pixel transparent: the white mahjong tile and blossoms are artwork.
if (source) {
  const { data, info } = await sharp(source).rotate().removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const outside = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 0;
  const visit = (x, y) => {
    const pixel = y * width + x;
    if (outside[pixel]) return;
    const offset = pixel * channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    if (Math.min(r, g, b) < 200 || Math.max(r, g, b) - Math.min(r, g, b) > 50) return;
    outside[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) visit(x - 1, y);
    if (x + 1 < width) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y + 1 < height) visit(x, y + 1);
  }
  const rgba = Buffer.alloc(width * height * 4);
  let left = width, top = height, right = 0, bottom = 0;
  for (let pixel = 0; pixel < outside.length; pixel++) {
    if (outside[pixel]) continue;
    const x = pixel % width, y = Math.floor(pixel / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    rgba[pixel * 4] = data[pixel * channels];
    rgba[pixel * 4 + 1] = data[pixel * channels + 1];
    rgba[pixel * 4 + 2] = data[pixel * channels + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  if (left >= right || top >= bottom) throw new Error("Source has no icon artwork");
  const cutout = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(1024, 1024, { fit: "contain", background: "#00000000" })
    .png().toBuffer();
  await writeFile("public/android-icon-foreground.png", cutout);
  await sharp(cutout).flatten({ background: iconBackground }).removeAlpha()
    .png().toFile("public/brand-icon.png");
  console.log(`Removed ${tail} edge-connected background pixels; crop ${left},${top}–${right},${bottom}.`);
}

const brand = await readFile("public/brand-icon.png");
if (!androidOnly) await sharp(brand).resize(1024, 1024).flatten({ background: iconBackground })
  .removeAlpha().png()
  .toFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
const res = "android/app/src/main/res";
const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';
const bg = `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#0A442E"/></shape>`;
await mkdir(`${res}/drawable`, { recursive: true });
await writeFile(
  `${res}/drawable/jinling_icon_background.xml`,
  xmlHeader + bg + "\n",
);
// A single-color tile silhouette with a cut-out 中. Android 13+ supplies the tint.
const monoPath =
  "M38,28 H70 Q75,28 75,34 V75 Q75,80 70,80 H38 Q33,80 33,75 V34 Q33,28 38,28 Z M51,38 V44 H42 V60 H51 V70 H57 V60 H66 V44 H57 V38 Z M47,49 H51 V55 H47 Z M57,49 H61 V55 H57 Z";
await writeFile(
  `${res}/drawable/jinling_icon_monochrome.xml`,
  xmlHeader +
    `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${monoPath}"/></vector>\n`,
);
const wrap = (inside) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 108 108">${inside}</svg>`;
let previewComposite;
for (const [density, scale] of Object.entries({
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
})) {
  const dir = `${res}/mipmap-${density}`;
  await mkdir(dir, { recursive: true });
  const canvas = 108 * scale;
  // Android masks the central 72 dp of its 108 dp adaptive layers. Fill that
  // entire viewport with the artwork, then extend edge pixels into the 18 dp
  // motion area. Do not shrink the framed image onto a solid-color backdrop.
  const viewportPixels = await sharp(brand)
    .resize(72 * scale, 72 * scale, { fit: "cover" })
    .flatten({ background: iconBackground }).removeAlpha().png().toBuffer();
  const foreground = await sharp(viewportPixels)
    .extend({ top: 18 * scale, bottom: 18 * scale, left: 18 * scale, right: 18 * scale, extendWith: "copy" })
    .png().toBuffer();
  await writeFile(`${dir}/ic_launcher_foreground.png`, foreground);
  const viewport = await sharp(foreground)
    .extract({
      left: 18 * scale,
      top: 18 * scale,
      width: 72 * scale,
      height: 72 * scale,
    })
    .png()
    .toBuffer();
  for (const [name, shape] of Object.entries({
    ic_launcher: '<rect width="72" height="72" rx="16" fill="white"/>',
    ic_launcher_round: '<circle cx="36" cy="36" r="36" fill="white"/>',
  })) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${72 * scale}" height="${72 * scale}" viewBox="0 0 72 72">${shape}</svg>`,
    );
    const masked = await sharp(viewport)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    await sharp(masked)
      .resize(48 * scale, 48 * scale)
      .png()
      .toFile(`${dir}/${name}.png`);
  }
  if (scale === 4) previewComposite = viewport;
}
for (const api of [26, 33]) {
  const dir = `${res}/mipmap-anydpi-v${api}`;
  await mkdir(dir, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    await writeFile(
      `${dir}/${name}.xml`,
      xmlHeader +
        `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/jinling_icon_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/>${api >= 33 ? '<monochrome android:drawable="@drawable/jinling_icon_monochrome"/>' : ""}</adaptive-icon>\n`,
    );
  }
}
// Remove unused Capacitor/Android template artwork so it cannot reappear via stale references.
await rm(`${res}/drawable-v24/ic_launcher_foreground.xml`, { force: true });
await writeFile(
  `${res}/values/ic_launcher_background.xml`,
  xmlHeader +
    '<resources><color name="ic_launcher_background">#0A442E</color></resources>\n',
);

await mkdir("public/icon-preview", { recursive: true });
await writeFile("public/icon-preview/adaptive.png", previewComposite);
for (const [name, mask] of Object.entries({
  circle: '<circle cx="256" cy="256" r="256" fill="white"/>',
  rounded: '<rect width="512" height="512" rx="114" fill="white"/>',
})) {
  await sharp(previewComposite).resize(512, 512)
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${mask}</svg>`), blend: "dest-in" }])
    .png().toFile(`public/icon-preview/${name}.png`);
}
if (!androidOnly) await sharp(brand).resize(512, 512)
  .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="114" fill="white"/></svg>'), blend: "dest-in" }])
  .png().toFile("public/icon-preview/ios.png");
await sharp(
  Buffer.from(
    wrap(`<path fill="#174C3A" fill-rule="evenodd" d="${monoPath}"/>`),
  ),
)
  .extract({ left: 72, top: 72, width: 288, height: 288 })
  .png()
  .toFile("public/icon-preview/monochrome.png");
if (!androidOnly) {
const mark = await sharp(brand).resize(330, 330).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: iconBackground },
})
  .composite([{ input: mark, gravity: "centre" }])
  .png()
  .toBuffer();
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
])
  await writeFile(
    `ios/App/App/Assets.xcassets/Splash.imageset/${name}`,
    splash,
  );
}
console.log(
  androidOnly ? "Generated full-viewport Android adaptive/legacy icons and previews." : "Generated iOS icon, full-viewport Android adaptive/legacy icons and previews.",
);
