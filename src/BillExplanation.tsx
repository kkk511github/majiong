import type {RoundRecord} from '../shared/types';
import {explainTransfer} from '../shared/bill-explanation';
import './bill-explanation.css';
export function BillExplanation({record,index,close,replay}:{record:RoundRecord;index:number;close:()=>void;replay?:()=>void}){
 const bill=explainTransfer(record,index);if(!bill)return null;
 return <section className="score-note bill-explanation" aria-label="本笔账单解释"><h4>{bill.from} → {bill.to}：{bill.amount} 分</h4>
  <p>{bill.reason} · 本把倍率 ×{bill.multiplier}{bill.flowers!==undefined?` · 收款方硬花 ${bill.flowers} 朵`:''}</p>
  {bill.notes.map((note,i)=><p key={i}>{note}</p>)}
  {!!bill.items.length&&<p>收款方保存的胡牌构成：{bill.items.map(x=>`${x.label} ${x.value}`).join('；')}。不是每笔杠费都按此构成计算。</p>}
  {replay&&<button onClick={replay}>查看对应回放</button>} <button onClick={close}>收起解释</button>
 </section>;
}
