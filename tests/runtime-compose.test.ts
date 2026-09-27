import {it,expect} from 'vitest';
// Operator-only JS is intentionally also executable without a TypeScript loader.
// @ts-expect-error standalone operator module
import {runtimeCompose} from '../scripts/runtime-compose.mjs';
it('keeps the public upstream stable and isolates worker aliases, ports and database mounts',()=>{
 const base={name:'server',services:{mahjong:{image:'jinling-mahjong:previous',ports:['8787:8787'],container_name:'original',environment:{DATABASE_PATH:'/app/data/mahjong.sqlite',MANAGEMENT_API_TOKEN_FILE:'/run/secrets/key'},volumes:[{type:'volume',source:'data',target:'/app/data'}],networks:{private:{aliases:['mahjong','public-name']}}}},networks:{private:{external:true}},volumes:{data:{external:true}}};
 const result=runtimeCompose(base,{image:'jinling-mahjong:release1',release:'release1',node:'release1'});
 expect(result.services.mahjong.networks.private.aliases).toContain('mahjong');
 expect(result.services['mahjong-blue'].networks.private).toBeNull();expect(result.services['mahjong-blue'].ports).toBeUndefined();
 expect(result.services['mahjong-blue'].volumes).toEqual(base.services.mahjong.volumes);
 expect(result.services['mahjong-blue'].environment.MAHJONG_RUNTIME_ENDPOINT).toBe('http://mahjong-blue:8787');
 expect(base.services.mahjong.image).toBe('jinling-mahjong:previous');
 expect(()=>runtimeCompose(result,{image:'jinling-mahjong:release1',release:'release1',node:'release1'})).toThrow();
});
