"""Optional asset-authoring step; requires fonttools, not needed to run the app."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

root = Path(__file__).resolve().parent.parent
font = TTFont(root / "public/fonts/mahjong-brush.ttf")
traditional = TTFont(root / "public/fonts/mahjong-brush-traditional.ttf")
result = {}
for char in "一二三四五六七八九萬東南西北中發春夏秋冬梅蘭竹菊":
    selected = traditional if char in "萬東南西北中發" or ord(char) not in font.getBestCmap() else font
    glyphs, cmap = selected.getGlyphSet(), selected.getBestCmap()
    glyph = glyphs[cmap[ord(char)]]
    pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    glyph.draw(pen)
    glyph.draw(bounds)
    result[char] = {"path": pen.getCommands(), "bounds": bounds.bounds}
(root / "scripts/tile-glyphs.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
