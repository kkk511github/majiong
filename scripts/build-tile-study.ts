import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Embed the shared study image once. Do not use String.replace with image
// markup as a replacement string: SVG content can contain replacement tokens.
const tileKinds = [4, 9, 19, 27];
const names = ["五萬", "一筒", "二条", "東"];
const positions = [43, 499, 950, 1400];
function source(file: string, inline: boolean) {
  if (!inline) return "/" + file;
  const type = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${type};base64,${readFileSync(resolve("public", file)).toString("base64")}`;
}
function study(inline: boolean) {
  const studyImage = source("tile-study-carved.png", inline);
  const bodyImage = source("tiles/tile-material.png", inline);
  const mask = source("tiles/tile-mask.svg", inline);
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>麻将牌面 · 材质对照</title><style>
:root{--study:url("${studyImage}");--body:url("${bodyImage}");--mask:url("${mask}")}
*{box-sizing:border-box}body{margin:0;background:#123c31;color:#f4edd8;font-family:"PingFang SC",sans-serif}main{max-width:1120px;margin:auto;padding:28px}h1{font-size:27px;font-weight:650;margin:0 0 12px}header p{color:#becdba;font-size:14px;line-height:1.8}.hero{width:100%;aspect-ratio:1881/836;background:var(--study) center/100% 100%;border-radius:14px;margin:15px 0 20px;display:block}.control{display:flex;align-items:center;gap:14px;font-size:13px;color:#e8dbb5;margin-bottom:17px}input{width:min(260px,45vw);accent-color:#e9bd68}.comparisons{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel{padding:18px;background:#275b48;border:1px solid #6e916956;border-radius:14px}.panel h2{font-size:16px;margin:0 0 24px;font-weight:500}.row{display:flex;justify-content:center;align-items:end;gap:8px;min-height:100px}figure{margin:0}.tile{display:block;width:var(--size,56px);height:calc(var(--size,56px)*1.523);flex-shrink:0}figcaption{font-size:10px;color:#bfccb8;text-align:center;margin-top:12px}.old{position:relative;height:calc(var(--size,56px)*1.375);margin-bottom:calc(var(--size,56px)*.148)}.body{position:absolute;width:113%;height:109%;left:-6.5%;top:-3.8%;background:var(--body) center/100% 100%;mask:var(--mask) center/100% 100%;-webkit-mask:var(--mask) center/100% 100%}.ink{width:100%;height:100%;position:absolute;inset:0}.new{background-image:var(--study);background-repeat:no-repeat;background-size:${1881 / 437 * 100}% ${836 / 666 * 100}%;border-radius:5px}footer{font-size:12px;line-height:1.8;color:#adc2b2;margin-top:20px}@media(max-width:700px){main{padding:18px}.comparisons{grid-template-columns:1fr}.panel h2{margin-bottom:15px}.row{min-height:0}h1{font-size:23px}}
</style><main><header><h1>牌身材质与雕刻对照</h1><p>五萬、一筒、二条、東。已选定雕刻质感方向；实际游戏已使用完整新牌组。</p></header><div class="hero" role="img" aria-label="四张雕刻麻将材质试样"></div><label class="control">牌面大小<input aria-label="牌面大小" type="range" min="36" max="92" value="56"><output>56 px</output></label><div class="comparisons"><section class="panel"><h2>上一版 · 图案叠加牌身</h2><div class="row">${tileKinds.map((kind, i) => `<figure><span class="tile old"><span class="body"></span><img class="ink" src="${source(`tiles/${kind}.svg`, inline)}" alt="旧${names[i]}"></span><figcaption>${names[i]}</figcaption></figure>`).join("")}</div></section><section class="panel"><h2>新方向 · 漆色雕刻</h2><div class="row">${positions.map((x, i) => `<figure><span class="tile new" role="img" aria-label="新${names[i]}" style="background-position:${x / (1881 - 437) * 100}% ${72 / (836 - 666) * 100}%"></span><figcaption>${names[i]}</figcaption></figure>`).join("")}</div></section></div><footer>这是已选定的材质研究图。当前完整牌组请查看「麻将牌面设计.html」。</footer></main><script>const slider=document.querySelector('input');slider.oninput=()=>{document.documentElement.style.setProperty('--size',slider.value+'px');document.querySelector('output').textContent=slider.value+' px'};</script></html>`;
}
writeFileSync(resolve("public/tile-material-study.html"), study(false));
writeFileSync(resolve("../麻将牌面-新旧对照.html"), study(true));
console.log("Built material study with one shared image reference.");
