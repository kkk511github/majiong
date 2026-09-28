import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
it('action sprites are real transparent, correctly sized, checksummed production assets',async()=>{
 const root='public/ui/actions-jade-v2/',manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 expect(manifest.sprites.map((s:any)=>s.name).sort()).toEqual(['hu','kong','pass','plate','pung']);
 for(const sprite of manifest.sprites){const bytes=readFileSync(root+sprite.file),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();expect(meta.hasAlpha).toBe(true);expect(meta.width).toBe(sprite.width);expect(meta.height).toBe(sprite.height);expect(stats.channels[3].min).toBe(0);expect(stats.channels[3].max).toBeGreaterThanOrEqual(250);expect(createHash('sha256').update(bytes).digest('hex')).toBe(sprite.sha256);}
});
it('crystal button base preserves real transparency and its release checksum',async()=>{
 const root='public/ui/actions-crystal-v3/',m=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 for(const s of m.sprites){const b=readFileSync(root+s.file),meta=await sharp(b).metadata(),stats=await sharp(b).stats();expect(meta.hasAlpha).toBe(true);expect(meta.width).toBe(256);expect(stats.channels[3].min).toBe(0);expect(createHash('sha256').update(b).digest('hex')).toBe(s.sha256);}
});
