import sharp from "sharp";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";

const brand = await readFile("public/brand-icon.png");
// Keep the established iOS artwork. Android uses an isolated, padded foreground.
await sharp(brand)
  .resize(1024, 1024)
  .flatten({ background: "#084c37" })
  .png()
  .toFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
const cutout = await sharp("public/android-icon-foreground.png")
  .trim({ threshold: 24 })
  .png()
  .toBuffer();
const metadata = await sharp(cutout).metadata();
if (!metadata.hasAlpha)
  throw new Error("Adaptive icon foreground must have transparency");
const res = "android/app/src/main/res";
const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';
const bg = `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><gradient android:angle="270" android:startColor="#21805A" android:endColor="#064534"/></shape>`;
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
const svgBg = `<defs><linearGradient id="jade" x2="0" y2="1"><stop stop-color="#21805A"/><stop offset="1" stop-color="#064534"/></linearGradient></defs><path fill="url(#jade)" d="M0 0H108V108H0Z"/>`;
const previewBg = await sharp(Buffer.from(wrap(svgBg)))
  .png()
  .toBuffer();
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
  // The complete subject fits a 40 x 52 dp box, inside the 66 dp safe circle.
  const tile = await sharp(cutout)
    .resize(Math.round(40 * scale), Math.round(52 * scale), { fit: "inside" })
    .png()
    .toBuffer();
  const foreground = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite([{ input: tile, gravity: "centre" }])
    .png()
    .toBuffer();
  await writeFile(`${dir}/ic_launcher_foreground.png`, foreground);
  const background = await sharp(previewBg)
    .resize(canvas, canvas)
    .png()
    .toBuffer();
  const composited = await sharp(background)
    .composite([{ input: foreground }])
    .png()
    .toBuffer();
  const viewport = await sharp(composited)
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
    '<resources><color name="ic_launcher_background">#084C37</color></resources>\n',
);

await mkdir("public/icon-preview", { recursive: true });
await writeFile("public/icon-preview/adaptive.png", previewComposite);
await sharp(
  Buffer.from(
    wrap(`<path fill="#174C3A" fill-rule="evenodd" d="${monoPath}"/>`),
  ),
)
  .extract({ left: 72, top: 72, width: 288, height: 288 })
  .png()
  .toFile("public/icon-preview/monochrome.png");
const mark = await sharp(brand).resize(330, 330).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: "#084c37" },
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
console.log(
  "Generated iOS icon, Android 108 dp adaptive icons, legacy masks and Android 13 monochrome icon.",
);
