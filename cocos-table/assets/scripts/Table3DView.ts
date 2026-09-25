import { sceneOffset, tileKind, type TableSceneState } from './table-scene';
import * as engine from 'cc';
import {roundedRectPath} from './canvas-compat';
const cc:any=engine;
import { standingHandLayout, planeAt, TABLE_CAMERA, type Table3DTile } from './table-3d-layout';

const SCALE = 100;
const PITCH = TABLE_CAMERA.pitch;
export type Table3DView = { render(state:TableSceneState,tiles:Table3DTile[]):void; update():void; destroy():void };

/** Production display only. Tile identity and legal actions remain in TableScene. */
export async function createTable3DView(table:any):Promise<Table3DView> {
  const win:any=window;
  const scene=table.node.scene;
  await new Promise((resolve,reject)=>cc.resources.load('table-standard',cc.Material,(e:Error,value:any)=>e?reject(e):resolve(value)));
  const layer = 1 << 1; // Dedicated study layer, excluded from the production UI camera.
  const root = new cc.Node('Table 3D models'); root.layer = layer; scene.addChild(root);
  const cameraNode = new cc.Node('Table model camera'); scene.addChild(cameraNode);
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
  backCtx.strokeStyle='#b0cf9470';backCtx.lineWidth=3;backCtx.beginPath();roundedRectPath(backCtx,12,12,232,328,14);backCtx.stroke();
  backCtx.strokeStyle='#244f3150';backCtx.lineWidth=2;backCtx.beginPath();roundedRectPath(backCtx,18,18,220,316,11);backCtx.stroke();
  const backTexture=new cc.Texture2D();backTexture.image=new cc.ImageAsset(backCanvas);textures.push(backTexture);
  const enamelBack=material('#ffffff',backTexture);
  const originalBackground=table.root.getChildByName('table').getComponent(cc.Sprite).spriteFrame;
  const loadImage=(path:string):Promise<any>=>new Promise((resolve,reject)=>cc.resources.load(path,cc.ImageAsset,(error:Error,asset:any)=>error?reject(error):resolve(asset)));
  const uiTexture=async(path:string)=>{
    const tex=new cc.Texture2D();tex.image=await loadImage(path);textures.push(tex);return tex;
  };
  const boardFrame=new cc.SpriteFrame();boardFrame.texture=await uiTexture('art/table3d-background');
  const texture = async (kind: number) => {
    const image = await loadImage(`face-source/${kind}`);
    const canvas = win.document.createElement('canvas'); canvas.width = 192; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, 192, 256);
    if(kind===33){ctx.strokeStyle='#282722';ctx.lineWidth=5;ctx.strokeRect(34,38,124,180);ctx.lineWidth=2;ctx.strokeRect(42,46,108,164);}
    else ctx.drawImage(image.data, 10, 12, 172, 232);
    const tex = new cc.Texture2D(); tex.image = new cc.ImageAsset(canvas); textures.push(tex); return tex;
  };
  const faceTextures=await Promise.all(Array.from({length:42},(_,k)=>texture(k)));
  const faces=faceTextures.map(tex=>material('#ffffff',tex));
  const anchorFaces=faceTextures.map(tex=>material('#ffe16a',tex));
  const inspectedFaces=faceTextures.map(tex=>material('#fff7b1',tex));
  const anchorBody=material('#ffe16a'),claimOutline=material('#ffd765');

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
  const outlinePositions:number[]=[],outlineNormals:number[]=[],outlineUvs:number[]=[],outlineIndices:number[]=[];
  faceRing.forEach(([x,z],i)=>{
    for(const scale of [1.06,.94]){outlinePositions.push(x*scale,0,z*scale);outlineNormals.push(0,1,0);outlineUvs.push(x+.5,z+.5);}
    const a=i*2,b=((i+1)%faceRing.length)*2;outlineIndices.push(a,b+1,b,a,a+1,b+1);
  });
  const outlineMesh=cc.utils.createMesh({positions:outlinePositions,normals:outlineNormals,uvs:outlineUvs,indices:outlineIndices});
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
  const overlayLayer=1<<2;
  const overlayNode=new cc.Node('Table overlay camera');scene.addChild(overlayNode);
  const overlay=overlayNode.addComponent(cc.Camera);overlay.priority=camera.priority+1;
  overlay.projection=cc.Camera.ProjectionType.ORTHO;overlay.clearFlags=cc.Camera.ClearFlag.DEPTH_ONLY;overlay.visibility=overlayLayer;overlay.near=uiCamera.near;overlay.far=uiCamera.far;
  let alive=true,enabled=false,models=new Map<string,{node:any,tile:Table3DTile}>();
  const setLayer=(n:any,value:number)=>{if(!n?.isValid)return;n.layer=value;for(const child of n.children)setLayer(child,value);};
  function update() {
    if(!alive)return;
    const layer=enabled?overlayLayer:cc.Layers.Enum.UI_2D;
    for(const n of [table.hud,table.marks,table.effectsRoot])setLayer(n,layer);
    for(const t of Array.from(table.tileLayout.values()) as Table3DTile[])
      if(t.area==='hand'&&t.seat===table.state?.me)setLayer(table.nodes.get(t.id),layer);
    if(!enabled)return;
    camera.fov=2*Math.atan(uiCamera.orthoHeight/SCALE/TABLE_CAMERA.distance)*180/Math.PI;
    overlay.orthoHeight=uiCamera.orthoHeight;overlayNode.setWorldPosition(uiCamera.node.worldPosition);overlayNode.setWorldRotation(uiCamera.node.worldRotation);
    for(const {node,tile} of Array.from(models.values())){
      const sprite=table.nodes.get(tile.id);if(!sprite?.isValid||!node.isValid)continue;
      const x=sprite.position.x+640,y=295-sprite.position.y,at=planeAt(x,y,tile.modelThickness/2);
      const end=planeAt(tile.x,tile.y,tile.modelThickness/2);
      node.setPosition(tile.groundX+at.x-end.x,tile.stack?tile.modelThickness:0,tile.groundZ+at.z-end.z);
      const size=sprite.getComponent(cc.UITransform);
      node.setScale(size.width*sprite.scale.x/tile.w,1,size.height*sprite.scale.y/tile.h);
    }
  }
  function render(state:TableSceneState,placements:Table3DTile[]) {
    if(!alive)return;
    enabled=state.tableStyle==='reference-3d';
    root.active=enabled;camera.enabled=enabled;light.enabled=enabled;overlay.enabled=enabled;
    table.racks.active=!enabled;
    const background=table.root.getChildByName('table');
    background.getComponent(cc.Sprite).spriteFrame=enabled?boardFrame:originalBackground;
    const grade=table.root.getChildByName('table-color-grade');if(grade)grade.active=!enabled;
    for(const node of [...root.children])node.destroy();models.clear();
    for(const t of placements){
      const visibleHand=t.area==='hand'&&(t.seat===state.me||t.tile===undefined&&sceneOffset(t.seat,state.me)===2);
      const node=table.nodes.get(t.id);if(node)node.active=!enabled||visibleHand;
      const shadow=table.shadows.get(t.id);if(shadow)shadow.active=!enabled;
    }
    if(!enabled){update();return;}
    camera.fov=2*Math.atan(uiCamera.orthoHeight/SCALE/TABLE_CAMERA.distance)*180/Math.PI;
    const handModels:any[]=[];
    for(const p of state.players){
      const offset=sceneOffset(p.seat,state.me);if(offset%2===0)continue;
      const row=placements.filter(t=>t.area==='hand'&&t.seat===p.seat&&t.tile===undefined).sort((a,b)=>a.y-b.y);
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
      // Keep the upper tile's projected bounds: replacing them with the base
      // bounds makes update() apply the stack's visual lift a second time.
      const t=middle?{...original,yaw:middle.yaw,pose:middle.pose}:original;
      if(t.area==='hand'&&(t.seat===state.me||t.tile===undefined))continue;
      const w=t.modelWidth,length=t.modelLength,thickness=t.modelThickness;
      const holder = new cc.Node(t.id); holder.layer=layer; root.addChild(holder);
      models.set(t.id,{node:holder,tile:t});
      const x=t.groundX,z=t.groundZ;
      holder.setPosition(x,t.stack?thickness:0,z);
      holder.setRotationFromEuler(0,t.yaw,0);
      if(!t.stack){const shadow=meshNode(holder,'Table contact',faceMesh,shadowMaterial);shadow.setPosition(.025,.002,.035);shadow.setScale(w*1.2,1,length*1.2);}
      else {const shadow=meshNode(holder,'Stack contact on middle tile',faceMesh,shadowMaterial);shadow.setPosition(0,.002,0);shadow.setScale(w*1.08,1,length*1.08);}
      const tile = new cc.Node('Physical tile'); tile.layer=layer; holder.addChild(tile);
      const concealed=t.tile===undefined;
      const base=meshNode(tile,concealed?'Ivory backing':'Jade backing',bodyMesh,concealed?ivory:jade); base.setScale(w,thickness*.34,length);
      const wall=meshNode(tile,concealed?'Enamel sidewall':'Ivory sidewall',bodyMesh,concealed?jade:t.globalAnchor?anchorBody:ivory); wall.setPosition(0,thickness*.25,0); wall.setScale(w,thickness*.75,length);
      const face=meshNode(tile,'Face',roundedFaceMesh,t.tile===undefined?enamelBack:(t.globalAnchor?anchorFaces:t.highlight?inspectedFaces:faces)[tileKind(t.tile)]);
      face.setPosition(0,thickness+.002,0); face.setScale(w*.94,1,length*.94);
      if(t.claimTarget){const outline=meshNode(holder,'Claim face outline',outlineMesh,claimOutline);outline.setPosition(0,thickness+.007,0);outline.setScale(w,1,length);}
      const top=new cc.Vec3();cc.Vec3.transformQuat(top,new cc.Vec3(0,0,-1),holder.worldRotation);
      diagnostics.push({id:t.id,seat:t.seat,area:t.area,yaw:t.yaw,alignmentAngle:t.alignmentAngle,top:[top.x,top.z],model:true,stack:!!t.stack,globalAnchor:!!t.globalAnchor,claimTarget:!!t.claimTarget,x,z,width:w,length,thickness,height:t.stack?thickness:0});
    }
    (window as any).__JINLING_TABLE_3D__={enabled:true,meshTiles:diagnostics.length,tiles:diagnostics,handModels};
    update();
  }
  return { render,update, destroy() {
    alive=false; root.destroy(); cameraNode.destroy(); lightNode.destroy();overlayNode.destroy();
    for (const m of materials) m.destroy(); for (const t of textures) t.destroy(); bodyMesh.destroy(); faceMesh.destroy();roundedFaceMesh.destroy();outlineMesh.destroy();
    for (const node of Array.from(table.nodes.values()) as any[]) node.active=true;
    for (const node of Array.from(table.shadows.values()) as any[]) node.active=true;
    delete (window as any).__JINLING_TABLE_3D__;
  } };
}
