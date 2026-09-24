import type {TableSceneState} from '../../shared/table-scene';
// Preview and shipped clients share one layout; fixes cannot drift between them.
export {REFERENCE,TABLE_CAMERA,groundAt,planeAt,screenAt,footprint,standingHandLayout,layout3DTable as referenceTiles} from '../../shared/table-3d-layout';

/** Visible reference pose, not a playable deal or production room. */
export function referenceSnapshot():TableSceneState {
  return { key:'reference-image-3',revision:1,me:0,turn:3,dealer:2,phase:'playing',code:'参考布局',round:3,rounds:8,remaining:41,rulesName:'进园子',roundMultiplier:1,countdown:'8',connected:true,disabled:true,practice:false,canDiscard:false,selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',actions:[],effects:[],trusteeDisabled:true,externalControls:true,
    players:[
      {seat:0,name:'自己',score:3988,bot:false,trustee:false,online:true,hand:[4,8,12,16,17,24,28,76,80,84,88,100,104],handCount:13,flowers:[124,132],discards:[108,112,36,56,40,113,57,105],melds:[]},
      {seat:1,name:'下家',score:9874,bot:true,trustee:false,online:true,hand:[],handCount:13,flowers:[125,142,136],discards:[41,58,37,18,32,20,106,59],melds:[]},
      {seat:2,name:'对家',score:2564,bot:true,trustee:false,online:true,hand:[],handCount:7,flowers:[139,138,137,128,136,133],discards:[116,92,84,72,77,120,60,107,5,42],melds:[{type:'pung',tiles:[61,62,63],from:0,concealed:false},{type:'pung',tiles:[48,49,50],from:0,concealed:false}]},
      {seat:3,name:'上家',score:1500,bot:true,trustee:false,online:true,hand:[],handCount:7,flowers:[141,126,134,135],discards:[38,117,109,121,110,122,6,78,7],melds:[{type:'pung',tiles:[48,49,50],from:1,concealed:false},{type:'pung',tiles:[9,10,11],from:1,concealed:false}]},
    ] };
}
