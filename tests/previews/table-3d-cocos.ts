import { sceneOffset, tileKind, type TableSceneState } from '../../shared/table-scene';
import { referenceTiles, standingHandLayout, TABLE_CAMERA } from './table-reference-layout';

const SCALE = 100;
const PITCH = TABLE_CAMERA.pitch;
type Handle = { sync(state: TableSceneState, enabled: boolean): void; destroy(): void };

/** Runs against the real Creator renderer inside its own iframe. Only this
 * local study replaces tile sprites; production TableScene is never patched. */
export async function install3DStudy(frame: HTMLIFrameElement): Promise<Handle> {
  const win = frame.contentWindow as any;
  const cc = await win.System.import('cc');
  if (!cc.MeshRenderer || !cc.utils?.createMesh) throw Error('预览运行时缺少 Cocos 3D 模块，请先运行构建脚本');
  const scene = cc.director.getScene();
  await new Promise((resolve, reject) => cc.resources.load('preview-standard', cc.Material, (e: Error, value: any) => e ? reject(e) : resolve(value)));
  const table = scene.getChildByName('Canvas').getComponent('TableScene');
  const layer = 1 << 1; // Dedicated study layer, excluded from the production UI camera.
  const root = new cc.Node('Local 3D tile study'); root.layer = layer; scene.addChild(root);
  const cameraNode = new cc.Node('3D study camera'); scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(cc.Camera);
  const uiCamera = scene.getComponentsInChildren(cc.Camera).find((c: any) => c !== camera);
  camera.priority = uiCamera.priority + 1;
  camera.projection = cc.Camera.ProjectionType.PERSPECTIVE;
  camera.clearFlags = cc.Camera.ClearFlag.DEPTH_ONLY;
  camera.visibility = layer; camera.near = .1; camera.far = 100; camera.orthoHeight = 2.95;
  cameraNode.setPosition(0, TABLE_CAMERA.distance*Math.sin(PITCH), TABLE_CAMERA.distance*Math.cos(PITCH)); cameraNode.lookAt(new cc.Vec3(0, 0, 0));
  const lightNode = new cc.Node('Soft tabletop light'); scene.addChild(lightNode);
  lightNode.setRotationFromEuler(-55, -30, 0);
  const light = lightNode.addComponent(cc.DirectionalLight); light.illuminance = 65000;
  scene.globals.ambient.skyLightingColor = new cc.Color('#e6ebe4');
  scene.globals.ambient.skyIllum = 11000;
  scene.globals.ambient.groundLightingColor = new cc.Color('#879b88');

  const materials: any[] = [], textures: any[] = [];
  const material = (color: string, texture?: any) => {
    const m = new cc.Material();
    m.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: !!texture } });
    m.setProperty('mainColor', new cc.Color(color));
    m.setProperty('roughness', .30); m.setProperty('metallic', 0);
    if (texture) m.setProperty('mainTexture', texture);
    materials.push(m); return m;
  };
  const ivory = material('#f4efdf'), jade = material('#397d36');
  // Procedural enamel, not a flat green placeholder: restrained inset border,
  // soft corner highlights and a darker perimeter make concealed tiles legible.
  const backCanvas=win.document.createElement('canvas');backCanvas.width=256;backCanvas.height=352;
  const backCtx=backCanvas.getContext('2d')!;
  const enamel=backCtx.createLinearGradient(0,0,256,352);
  enamel.addColorStop(0,'#84b779');enamel.addColorStop(.18,'#559b50');enamel.addColorStop(.76,'#468440');enamel.addColorStop(1,'#326b31');
  backCtx.fillStyle=enamel;backCtx.fillRect(0,0,256,352);
  backCtx.strokeStyle='#b0cf9470';backCtx.lineWidth=3;backCtx.beginPath();backCtx.roundRect(12,12,232,328,14);backCtx.stroke();
  backCtx.strokeStyle='#244f3150';backCtx.lineWidth=2;backCtx.beginPath();backCtx.roundRect(18,18,220,316,11);backCtx.stroke();
  const backTexture=new cc.Texture2D();backTexture.image=new cc.ImageAsset(backCanvas);textures.push(backTexture);
  const enamelBack=material('#ffffff',backTexture);
  const originalBackground=table.root.getChildByName('table').getComponent(cc.Sprite).spriteFrame;
  const uiTexture=async(url:string)=>{
    const img=new win.Image();img.src=url;await img.decode();const tex=new cc.Texture2D();tex.image=new cc.ImageAsset(img);textures.push(tex);return tex;
  };
  const boardFrame=new cc.SpriteFrame();boardFrame.texture=await uiTexture('/cocos-table/art-source/imagegen/reference-table-v1/table-background.png');
  const avatarTexture=await uiTexture('/tests/assets/table-reference/reference-3.jpg');
  const hud=new cc.Node('Measured reference HUD');hud.layer=cc.Layers.Enum.UI_2D;table.root.addChild(hud);
  const uiNode=(name:string,x:number,y:number,w:number,h:number)=>{const n=new cc.Node(name);n.layer=cc.Layers.Enum.UI_2D;hud.addChild(n);n.addComponent(cc.UITransform).setContentSize(w,h);n.setPosition(x-640,295-y,0);return n;};
  const label=(text:string,x:number,y:number,w:number,h:number,size=17,color='#e7e5da')=>{const n=uiNode(text,x,y,w,h),l=n.addComponent(cc.Label);l.string=text;l.fontSize=size;l.lineHeight=size+3;l.color=new cc.Color(color);l.horizontalAlign=cc.Label.HorizontalAlign.CENTER;l.verticalAlign=cc.Label.VerticalAlign.CENTER;return n;};
  const panel=(name:string,x:number,y:number,w:number,h:number,color:string)=>{const n=uiNode(name,x,y,w,h),g=n.addComponent(cc.Graphics);g.fillColor=new cc.Color(color);g.roundRect(-w/2,-h/2,w,h,4);g.fill();return g;};
  const portraitFrames=[[69,355,60,61],[1151,112,60,60],[881,25,60,60],[69,112,60,60]].map(([x,y,w,h])=>{const f=new cc.SpriteFrame();f.texture=avatarTexture;f.rect=new cc.Rect(x,y,w,h);return f;});
  function referenceHud(state:TableSceneState){
    for(const child of [...hud.children])child.destroy();
    const g=panel('Wind panel',640,247,124,100,'#172027');g.lineWidth=3;g.strokeColor=new cc.Color('#3b454a');g.roundRect(-59,-47,118,94,5);g.stroke();
    g.fillColor=new cc.Color('#a94918');g.moveTo(-56,-39);g.lineTo(-25,-16);g.lineTo(-25,16);g.lineTo(-56,39);g.close();g.fill();
    g.fillColor=new cc.Color('#0d1c25');g.circle(0,0,24);g.fill();
    label('西',640,215,25,24,19);label('东',640,280,25,24,19);label('北',597,247,22,26,19);label('南',681,247,22,26,19);label(state.countdown,640,247,42,34,28,'#00d1ee');
    panel('Flower count',538,269,72,31,'#0351689c');label(`余花: ${Math.max(0,20-state.players.reduce((n,p)=>n+p.flowers.length,0))}`,538,269,72,30,18);
    panel('Wall count',744,247,64,31,'#06495f99');panel('Wall icon',720,247,14,25,'#568e13');label(String(state.remaining),755,247,38,30,21);
    const anchors=[[99,386],[1180,142],[911,54],[99,142]];
    for(const p of state.players){const offset=sceneOffset(p.seat,state.me),[x,y]=anchors[offset];
      const n=uiNode(`Portrait ${p.seat}`,x,y,60,60),sp=n.addComponent(cc.Sprite);sp.sizeMode=cc.Sprite.SizeMode.CUSTOM;sp.spriteFrame=portraitFrames[p.seat];
      label(p.name,x,y-43,100,20,13,'#b7b4ad');label(String(p.score),x,y+40,88,25,18,'#ffe298');
      if(p.seat===state.dealer){panel('Dealer',x+27,y-25,19,21,'#bc3519');label('庄',x+27,y-25,20,21,16,'#ffed8b');}
    }
    panel('Trustee',95,36,48,46,'#302a27');label('托管',95,36,44,30,15,'#f1d691');
    panel('Chat',1186,332,46,43,'#493b2a');label('•••',1186,328,44,28,22,'#f4dc9e');
    panel('Hints',1186,394,46,49,'#493b2a');label('查听',1186,395,42,30,16,'#f2d99c');
  }
  const texture = async (kind: number) => {
    const image = new win.Image(); image.src = new URL(`face-source/${kind}.png`, frame.src).href;
    await image.decode();
    const canvas = win.document.createElement('canvas'); canvas.width = 192; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, 192, 256);
    if(kind===33){ctx.strokeStyle='#282722';ctx.lineWidth=5;ctx.strokeRect(34,38,124,180);ctx.lineWidth=2;ctx.strokeRect(42,46,108,164);}
    else ctx.drawImage(image, 10, 12, 172, 232);
    const tex = new cc.Texture2D(); tex.image = new cc.ImageAsset(canvas); textures.push(tex); return tex;
  };
  const faces = await Promise.all(Array.from({ length: 42 }, async (_, k) => material('#ffffff', await texture(k))));

  // Bevelled rectangular prism in normalized local coordinates. The cap is
  // textured separately, so rotating a tile preserves the real sidewalls.
  const roundedRing=(radius=.055)=>{
    const points:number[][]=[];
    for(const [cx,cz,start]of [[.5-radius,-.5+radius,-90],[.5-radius,.5-radius,0],[-.5+radius,.5-radius,90],[-.5+radius,-.5+radius,180]])
      for(let i=0;i<=6;i++){const angle=(start+i*15)*Math.PI/180;points.push([cx+radius*Math.cos(angle),cz+radius*Math.sin(angle)]);}
    return points;
  };
  function solid() {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const ring = roundedRing();
    for (let side = 0; side < ring.length; side++) {
      const a = ring[side], b = ring[(side+1)%ring.length], dx = b[0]-a[0], dz = b[1]-a[1], len = Math.hypot(dx,dz), start = positions.length/3;
      for (const [x,z,y] of [[a[0],a[1],0],[a[0],a[1],.83],[b[0],b[1],.83],[b[0],b[1],0]]) {
        positions.push(x,y,z); normals.push(dz/len,0,-dx/len); uvs.push(x+.5,z+.5);
      }
      indices.push(start,start+1,start+2,start,start+2,start+3);
      const bevel = positions.length/3;
      for (const [x,z,y] of [[a[0],a[1],.83],[a[0]*.94,a[1]*.94,1],[b[0]*.94,b[1]*.94,1],[b[0],b[1],.83]]) {
        positions.push(x,y,z); normals.push(dz/len*.707,.707,-dx/len*.707); uvs.push(x+.5,z+.5);
      }
      indices.push(bevel,bevel+1,bevel+2,bevel,bevel+2,bevel+3);
    }
    for (const y of [0,1]) {
      const start = positions.length/3; positions.push(0,y,0); normals.push(0,y?1:-1,0); uvs.push(.5,.5);
      for (const [x,z] of ring) { positions.push(x*(y?.94:1),y,z*(y?.94:1)); normals.push(0,y?1:-1,0); uvs.push(x+.5,z+.5); }
      for (let i=0;i<ring.length;i++) { const a=start+1+i,b=start+1+(i+1)%ring.length; indices.push(...(y?[start,b,a]:[start,a,b])); }
    }
    return cc.utils.createMesh({ positions,normals,uvs,indices });
  }
  const bodyMesh = solid();
  const faceRing=roundedRing(),facePositions=[0,0,0],faceNormals=[0,1,0],faceUvs=[.5,.5],faceIndices:number[]=[];
  faceRing.forEach(([x,z],i)=>{facePositions.push(x,0,z);faceNormals.push(0,1,0);faceUvs.push(x+.5,z+.5);faceIndices.push(0,(i+1)%faceRing.length+1,i+1);});
  const roundedFaceMesh=cc.utils.createMesh({positions:facePositions,normals:faceNormals,uvs:faceUvs,indices:faceIndices});
  // Canvas textures use their first row at V=0. The glyph's top is local -Z.
  const faceMesh = cc.utils.createMesh({ positions: [-.5,0,.5,.5,0,.5,.5,0,-.5,-.5,0,-.5], normals:[0,1,0,0,1,0,0,1,0,0,1,0], uvs:[0,1,1,1,1,0,0,0], indices:[0,1,2,0,2,3] });
  const shadowCanvas=win.document.createElement('canvas'); shadowCanvas.width=128; shadowCanvas.height=128;
  const shadowContext=shadowCanvas.getContext('2d')!;
  const gradient=shadowContext.createRadialGradient(64,64,20,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,0.28)'); gradient.addColorStop(.7,'rgba(0,0,0,0.16)'); gradient.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=gradient; shadowContext.fillRect(0,0,128,128);
  const shadowTexture=new cc.Texture2D(); shadowTexture.image=new cc.ImageAsset(shadowCanvas); textures.push(shadowTexture);
  const shadowMaterial=new cc.Material(); shadowMaterial.initialize({effectName:'builtin-standard',technique:1,defines:{USE_ALBEDO_MAP:true}});
  shadowMaterial.setProperty('mainTexture',shadowTexture); shadowMaterial.setProperty('mainColor',new cc.Color('#ffffff')); materials.push(shadowMaterial);
  const meshNode = (parent: any, name: string, mesh: any, mat: any) => {
    const node = new cc.Node(name); node.layer=layer; parent.addChild(node);
    const renderer=node.addComponent(cc.MeshRenderer); renderer.mesh=mesh; renderer.setMaterial(mat,0); return node;
  };
  let alive = true;
  function sync(state: TableSceneState, enabled: boolean) {
    if (!alive) return;
    cc.view.setDesignResolutionSize(1280,enabled?589:590,cc.ResolutionPolicy.SHOW_ALL);
    table.skipNextTransition = true; table.state = state; table.draw();
    // Keep the approved standing hands intact for this first in-context study.
    // Only face-up tiles are replaced; this is deliberately not a shipped skin.
    const placements = referenceTiles(state);
    // Standing hands have one upright presentation in every fixture. Never
    // mix screenshot crops, tilted sprites and perspective meshes by meld count.
    const hands = new Set(placements.filter(t=>t.area==='hand'&&sceneOffset(t.seat!,state.me)%2===0).map(t=>t.id));
    for (const [id,node] of table.nodes) node.active = !enabled || hands.has(id);
    for (const [id,node] of table.shadows) node.active = !enabled || hands.has(id);
    root.active = enabled; camera.enabled = enabled; light.enabled = enabled;
    table.racks.active=!enabled;
    table.hud.active=!enabled;hud.active=enabled;if(enabled)referenceHud(state);
    const watermark=table.root.getChildByName('金陵麻将');if(watermark)watermark.active=!enabled;
    const background=table.root.getChildByName('table');background?.getComponent(cc.UITransform).setContentSize(1280,enabled?589:590);
    background.getComponent(cc.Sprite).spriteFrame=enabled?boardFrame:originalBackground;
    const grade=table.root.getChildByName('table-color-grade')?.getComponent(cc.Graphics);
    if(grade){
      const half=295;grade.clear();grade.fillColor=new cc.Color(enabled?'#00000000':'#007b7890');grade.rect(-640,-half,1280,half*2);grade.fill();
      if(enabled){}
      else{grade.fillColor=new cc.Color('#00252d24');grade.roundRect(-610,-277,1220,554,18);grade.fill();grade.strokeColor=new cc.Color('#8bc9b64a');grade.lineWidth=1.2;grade.roundRect(-610,-277,1220,554,18);grade.stroke();}
    }
    for(const name of ['table-room-title','table-room-rules','table-round-multiplier']) {
      const label=table.hud.getChildByName(name);if(label)label.setPosition((enabled?100:80)-640,label.position.y,0);
    }
    const handDiagnostics:any[]=[];
    if(enabled)for(const t of placements.filter(t=>t.area==='hand')) {
      const node=table.nodes.get(t.id);if(node){node.setPosition(t.x-640,295-t.y,0);node.getComponent(cc.UITransform).setContentSize(t.w,t.h);node.setScale(1,1,1);node.setRotationFromEuler(0,0,0);
        const offset=sceneOffset(t.seat!,state.me),pose=['own','back-right','back-top','back-left'][offset];
        const sprite=node.getComponent(cc.Sprite);sprite.spriteFrame=table.frames.get(`${pose}-${t.tile===undefined?0:tileKind(t.tile)}`)||table.frames.get(`${pose}-0`);sprite.color=new cc.Color('#ffffff');
        handDiagnostics.push({id:t.id,seat:t.seat,offset,pose,rotation:node.angle,x:t.x,y:t.y,width:t.w,height:t.h,bottom:t.y+t.h/2});}
      const shadow=table.shadows.get(t.id),old=table.tileLayout.get(t.id);
      if(shadow&&old)shadow.setPosition(shadow.position.x+t.x-old.x,shadow.position.y-t.y+old.y,shadow.position.z);
    }
    for (const node of [...root.children]) node.destroy();
    if (!enabled) return;
    // The UI camera expands its view when the window aspect changes.
    camera.fov=2*Math.atan(uiCamera.orthoHeight/SCALE/TABLE_CAMERA.distance)*180/Math.PI;
    const handModels:any[]=[];
    for(const p of state.players){
      const offset=sceneOffset(p.seat,state.me);if(offset%2===0)continue;
      const row=placements.filter(t=>t.area==='hand'&&t.seat===p.seat).sort((a,b)=>a.y-b.y);
      if(!row.length)continue;
      for(const t of standingHandLayout(row,offset)){
        const {width,height,depth}=t;
        const holder=new cc.Node(`standing-${t.id}`);holder.layer=layer;root.addChild(holder);
        holder.setPosition(t.x,0,t.z);holder.setRotationFromEuler(0,t.yaw,0);
        // A normal rounded rectangular tile, stood on its short edge. Reuse
        // the physical tile body instead of drawing a sliced green ribbon.
        const upright=new cc.Node('Upright rectangular tile');upright.layer=layer;holder.addChild(upright);
        upright.setPosition(0,height/2,depth/2);upright.setRotationFromEuler(-90,0,0);
        const faceSide=meshNode(upright,'Ivory face and sidewall',bodyMesh,ivory);faceSide.setScale(width,depth*.74,height);
        const backBody=meshNode(upright,'Green backing',bodyMesh,jade);backBody.setPosition(0,depth*.70,0);backBody.setScale(width,depth*.30,height);
        const back=meshNode(upright,'Rounded rectangular enamel back',roundedFaceMesh,enamelBack);back.setPosition(0,depth+.002,0);back.setScale(width*.94,1,height*.94);
        const shadow=meshNode(holder,'Individual standing contact',faceMesh,shadowMaterial);shadow.setPosition(0,.002,0);shadow.setScale(width*1.08,1,depth*1.2);
        const up=new cc.Vec3();cc.Vec3.transformQuat(up,new cc.Vec3(0,1,0),holder.worldRotation);
        handModels.push({...t,seat:p.seat,up:[up.x,up.y,up.z]});
      }
    }
    const diagnostics: any[] = [];
    const slots=new Map(placements.map(t=>[t.id,t]));
    for (const original of placements) {
      const middle=original.stack?slots.get(original.id.replace(/-3$/,'-1')):undefined;
      const t=middle?{...original,x:middle.x,y:middle.y,w:middle.w,h:middle.h,yaw:middle.yaw,pose:middle.pose}:original;
      if(t.area==='hand')continue;
      const w=t.modelWidth,length=t.modelLength,thickness=t.modelThickness;
      const holder = new cc.Node(t.id); holder.layer=layer; root.addChild(holder);
      const x=t.groundX,z=t.groundZ;
      holder.setPosition(x,t.stack?thickness:0,z);
      holder.setRotationFromEuler(0,t.yaw,0);
      if(!t.stack){const shadow=meshNode(holder,'Table contact',faceMesh,shadowMaterial);shadow.setPosition(.025,.002,.035);shadow.setScale(w*1.2,1,length*1.2);}
      else {const shadow=meshNode(holder,'Stack contact on middle tile',faceMesh,shadowMaterial);shadow.setPosition(0,.002,0);shadow.setScale(w*1.08,1,length*1.08);}
      const tile = new cc.Node('Physical tile'); tile.layer=layer; holder.addChild(tile);
      const concealed=t.tile===undefined;
      const base=meshNode(tile,concealed?'Ivory backing':'Jade backing',bodyMesh,concealed?ivory:jade); base.setScale(w,thickness*.34,length);
      const wall=meshNode(tile,concealed?'Enamel sidewall':'Ivory sidewall',bodyMesh,concealed?jade:ivory); wall.setPosition(0,thickness*.25,0); wall.setScale(w,thickness*.75,length);
      const face=meshNode(tile,'Face',roundedFaceMesh,t.tile===undefined?enamelBack:faces[tileKind(t.tile)]);
      face.setPosition(0,thickness+.002,0); face.setScale(w*.94,1,length*.94);
      const top=new cc.Vec3();cc.Vec3.transformQuat(top,new cc.Vec3(0,0,-1),holder.worldRotation);
      diagnostics.push({id:t.id,seat:t.seat,area:t.area,yaw:t.yaw,alignmentAngle:t.alignmentAngle,top:[top.x,top.z],model:true,stack:!!t.stack,x,z,width:w,length,thickness,height:t.stack?thickness:0});
    }
    win.__JINLING_3D_STUDY__ = { realCocos: true, layout:'reference-1280x589', standingHands:'individual-rectangular-tiles', hands:handDiagnostics,handModels,meshTiles: diagnostics.length, tiles: diagnostics, me:state.me };
  }
  return { sync, destroy() {
    alive=false; root.destroy(); cameraNode.destroy(); lightNode.destroy();hud.destroy();
    for (const m of materials) m.destroy(); for (const t of textures) t.destroy(); bodyMesh.destroy(); faceMesh.destroy();roundedFaceMesh.destroy();
    for (const node of table.nodes.values()) node.active=true;
    for (const node of table.shadows.values()) node.active=true;
    delete win.__JINLING_3D_STUDY__;
  } };
}
