import type {RoundRecord} from './types';
export function explainTransfer(record:RoundRecord,index:number){
 const entry=record.result.transfers?.[index];if(!entry)return null;
 const multiplier=record.multiplier??1;
 let before=(record.scores[entry.from]??0)-(record.result.deltas[entry.from]??0);
 for(const t of record.result.transfers!.slice(0,index))if(t.scope!=='external'){
  if(t.from===entry.from)before-=t.amount;if(t.to===entry.from)before+=t.amount;
 }
 let expected:number|undefined;
 if(entry.reason==='自摸'||entry.reason==='点炮')expected=record.result.details[entry.to]?.total;
 const side={直杠:10,补杠:10,暗杠:5,花杠:10,四连风:5,四家跟牌:5,四张同牌:5} as const;
 if(record.rules?.id==='nj-garden-b-v3'&&entry.reason in side)expected=side[entry.reason as keyof typeof side]*(record.rules.doubleSidePayments?multiplier:1);
 const notes=[entry.scope==='external'?'本笔为桌外记分，不扣桌内余额。':`本笔前桌内余额 ${before} 分。`];
 if(expected!==undefined){notes.push(`规则参考 ${expected} 分；本笔实际 ${entry.amount} 分。`);
  if(entry.scope!=='external'&&record.rules?.twoBankrupt&&before<expected)notes.push('付款方桌内余额不足，按可用余额封顶；多人收款时还需按整组应付款分摊。');
  else if(entry.amount!==expected)notes.push('实际与参考金额不同，请结合整把的责任赔付、余额分摊和保米分录核对。');
 }else notes.push('旧记录或特殊责任分录只展示已保存的实际金额，不反推未保存的应付金额。');
 return{from:record.names[entry.from],to:record.names[entry.to],amount:entry.amount,reason:entry.reason,multiplier,
  flowers:record.hands?.[entry.to]?.flowers.length,items:record.result.details[entry.to]?.items??[],notes};
}
