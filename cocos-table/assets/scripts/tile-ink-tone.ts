/** Match render_tiles.py in linear light, before compositing onto white jade.
 * Source art/alpha and semantic identities stay untouched. */
const linear = Array.from({length:256},(_,v)=>{
  const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
});
const srgb=(v:number)=>Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));
export function toneTileInk(data:Uint8ClampedArray,kind:number):void {
  // The white dragon's inset is white porcelain, not coloured enamel.
  if(kind===33)return;
  const saturation=kind>=18&&kind<=26?.78:.90;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue;
    const r=linear[data[i]],g=linear[data[i+1]],b=linear[data[i+2]];
    const peak=Math.max(r,g,b);
    data[i]=srgb((peak+(r-peak)*saturation)*.82);
    data[i+1]=srgb((peak+(g-peak)*saturation)*.82);
    data[i+2]=srgb((peak+(b-peak)*saturation)*.82);
  }
}
