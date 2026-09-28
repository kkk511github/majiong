import {describe,it,expect} from 'vitest';
import {toneTileInk} from '../cocos-table/assets/scripts/tile-ink-tone';
describe('soft jade ink tone',()=>{
  it('reduces bamboo chroma without changing alpha or hue ordering',()=>{
    const pixel=new Uint8ClampedArray([10,210,20,187]);
    toneTileInk(pixel,19);
    expect(pixel[3]).toBe(187);
    expect(pixel[1]).toBeLessThan(210);
    expect(pixel[1]-pixel[0]).toBeLessThan(160);
    expect(pixel[1]).toBeGreaterThan(pixel[2]);
    expect(pixel[2]).toBeGreaterThan(pixel[0]);
  });
  it('softens green more for bamboo than for other suits',()=>{
    const bamboo=new Uint8ClampedArray([0,200,0,255]),dots=bamboo.slice();
    toneTileInk(bamboo,26);toneTileInk(dots,17);
    expect(bamboo[1]-bamboo[0]).toBeLessThan(dots[1]-dots[0]);
  });
  it('preserves black lettering, transparency and the white dragon',()=>{
    const pixels=new Uint8ClampedArray([0,0,0,255,45,70,90,0]);
    toneTileInk(pixels,27);
    expect([...pixels]).toEqual([0,0,0,255,45,70,90,0]);
    const dragon=new Uint8ClampedArray([255,255,255,255,10,10,10,200]),before=dragon.slice();
    toneTileInk(dragon,33);expect(dragon).toEqual(before);
  });
  it('does not clip highlights or introduce a tint to neutral ink',()=>{
    const pixel=new Uint8ClampedArray([255,255,255,255]);toneTileInk(pixel,18);
    expect(pixel[0]).toBeGreaterThan(220);expect(pixel[0]).toBeLessThan(250);
    expect(pixel[0]).toBe(pixel[1]);expect(pixel[1]).toBe(pixel[2]);
  });
});
