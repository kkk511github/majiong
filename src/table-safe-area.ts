import type { TableSafeArea } from "../shared/table-scene";

/** Translate viewport CSS insets into the letterboxed canvas's coordinates. */
export function tableSafeArea(
  insets: TableSafeArea,
  frame: { left:number; top:number; width:number; height:number },
  viewport: { width:number; height:number },
): TableSafeArea {
  const scale=Math.min(frame.width/1280,frame.height/590);
  if(scale<=0)return {left:0,right:0,top:0,bottom:0};
  const left=frame.left+(frame.width-1280*scale)/2;
  const top=frame.top+(frame.height-590*scale)/2;
  const overlap=(pixels:number)=>pixels>0.5?pixels/scale:0;
  return {
    left:overlap(insets.left-left),
    right:overlap(left+1280*scale-(viewport.width-insets.right)),
    top:overlap(insets.top-top),
    bottom:overlap(top+590*scale-(viewport.height-insets.bottom)),
  };
}
