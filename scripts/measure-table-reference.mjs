// Read-only pixel measurements of the user-provided screenshots. No image edits.
import sharp from 'sharp';
const paths=process.argv.slice(2);
for(const path of paths){
  const {data,info}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const regions=[
    ['own-hand',125,466,940,111,'ivory'],['top-hand',478,17,327,47,'green'],
    ['compass',574,190,133,112,'dark'],['own-flowers',328,402,125,66,'ivory'],
    ['top-melds',690,16,181,46,'ivory'],['left-melds',243,45,88,169,'ivory'],
    ['right-flowers',929,214,90,190,'ivory'],
  ];
  const out={image:path,width:info.width,height:info.height,regions:[]};
  for(const [name,x,y,w,h,kind] of regions){
    let left=info.width,top=info.height,right=-1,bottom=-1,count=0;
    for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
      const at=(py*info.width+px)*info.channels,r=data[at],g=data[at+1],b=data[at+2];
      const ivory=r>155&&g>145&&b>120&&Math.max(r,g,b)-Math.min(r,g,b)<72;
      const hit=kind==='ivory'?ivory:kind==='green'?ivory||g>65&&g>r*1.25&&g>b*1.15:r<100&&g<100&&b<112;
      if(hit){left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);count++;}
    }
    out.regions.push({name,pixelBounds:count?{left,top,right,bottom,width:right-left+1,height:bottom-top+1}:null});
  }
  console.log(JSON.stringify(out,null,2));
}
