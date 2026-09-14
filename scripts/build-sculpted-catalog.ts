import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BACK_FRAME, TILE_FRAMES, frameStyle, type TileFrame } from "../src/tile-art";
import { tileName } from "../shared/tiles";

const rows = [
  ["万子", "墨黑数目 · 朱红萬字", 0, 9],
  ["筒子", "清晰分色 · 漆光筒花", 9, 18],
  ["条子", "六条上三下三 · 七条红一绿六 · 八条上 W 下 M", 18, 27],
  ["字牌", "四方风位 · 中发白", 27, 34],
  ["花牌", "春夏秋冬 · 梅兰竹菊", 34, 42],
] as const;
const label = (index: number) => tileName(index < 34 ? index * 4 : index + 102);
const files = [...new Set([...TILE_FRAMES, BACK_FRAME].map(f => f.file))];
const css = readFileSync(resolve("scripts/sculpted-catalog.css"), "utf8");
function artwork(frame: TileFrame) {
  const style = frameStyle(frame);
  return `<span class="tile-art sculpted-tile" style="background-image:var(--${frame.file});background-size:${style.backgroundSize};background-position:${style.backgroundPosition}"></span>`;
}
function card(frame: TileFrame, name: string, index: number) {
  return `<button class="swatch" data-kind="${index}" aria-label="放大${name}">${artwork(frame)}<span class="label">${name}</span></button>`;
}
function catalog(inline: boolean) {
  const variables = files.map(file => `--${file}:url("${inline ? "data:image/png;base64," + readFileSync(resolve(`public/tiles/sculpted/${file}.png`)).toString("base64") : `/tiles/sculpted/${file}.png`}");`).join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>南京麻将 · 雕刻牌面</title><style>:root{${variables}}${css}</style>
<main><header><div><small>金陵麻将 / 全套牌面</small><h1>温润牌身，立体雕刻。</h1><p>42 种牌面 · 漆色雕纹 · 翡翠牌背</p></div><div class="sample">${card(BACK_FRAME, "翡翠牌背", 42)}</div></header>
${rows.map(([title, note, start, end]) => `<section><div class="section-head"><h2>${title}</h2><span>${note}</span></div><div class="cards">${TILE_FRAMES.slice(start, end).map((frame, i) => card(frame, label(start + i), start + i)).join("")}</div></section>`).join("")}
<footer><span>点击任意一张，放大查看。</span><span>与游戏使用同一套素材</span></footer></main>
<dialog><button aria-label="关闭">×</button><div class="detail"></div><p></p></dialog>
<script>const d=document.querySelector('dialog');document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{d.querySelector('.detail').replaceChildren(b.querySelector('.tile-art').cloneNode(true));d.querySelector('p').textContent=b.querySelector('.label').textContent;d.showModal()});d.querySelector('button').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close()};</script></html>`;
}
writeFileSync(resolve("public/tile-catalog.html"), catalog(false));
writeFileSync(resolve("../麻将牌面设计.html"), catalog(true));
writeFileSync(resolve("public/tiles/sculpted/manifest.json"), JSON.stringify({version: 5, atlasSize: [1024, 1536], tiles: TILE_FRAMES.map((f, kind) => ({kind, name: label(kind), ...f})), back: BACK_FRAME}, null, 2));
console.log("Built sculpted catalog: 42 faces + back, with corrected six, seven and eight bamboo.");
