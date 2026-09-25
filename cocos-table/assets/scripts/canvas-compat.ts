/** Positive tile-border rectangles, with a fallback for Android WebView <99. */
export function roundedRectPath(ctx:any,x:number,y:number,w:number,h:number,r:number):void {
 if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,w,h,r);return;}
 const radius=Math.max(0,Math.min(r,w/2,h/2));
 ctx.moveTo(x+radius,y);ctx.lineTo(x+w-radius,y);ctx.arcTo(x+w,y,x+w,y+radius,radius);
 ctx.lineTo(x+w,y+h-radius);ctx.arcTo(x+w,y+h,x+w-radius,y+h,radius);
 ctx.lineTo(x+radius,y+h);ctx.arcTo(x,y+h,x,y+h-radius,radius);
 ctx.lineTo(x,y+radius);ctx.arcTo(x,y,x+radius,y,radius);ctx.closePath();
}
