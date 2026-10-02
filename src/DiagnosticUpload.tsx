import {useRef,useState} from 'react';
import {appDiagnostics} from './app-diagnostics';
import {createTableChannel} from './cocos-channel';
import {client} from './game-client';

/** Separate from feedback text so errors can be uploaded without a description. */
export function DiagnosticUpload({accountId}:{accountId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState('');
 const attempt=useRef(''),locked=useRef(false);
 async function upload(){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   attempt.current||=createTableChannel();
   const report=await appDiagnostics.manualReport(accountId);
   if(client.state.account?.id!==accountId)throw Error('登录已变化，请重新上传日志');
   let result:{id:string;received:boolean};
   try{result=await client.api('/api/diagnostics',{id:attempt.current,report});}
   catch(error){
    // Old single-table runtimes understand only v1. A format rejection writes
    // nothing, and the same receipt ID keeps retries idempotent.
    if((error as {status?:number})?.status!==400)throw error;
    const legacy=await appDiagnostics.manualReport(accountId,1);
    if(client.state.account?.id!==accountId)throw Error('登录已变化，请重新上传日志');
    result=await client.api('/api/diagnostics',{id:attempt.current,report:legacy});
   }
   if(!result.received)throw Error('服务器未确认收到，请重试');
   setReceipt(result.id);attempt.current='';
  }catch(e){setError(e instanceof Error?e.message:'上传失败，请检查网络后重试');}
  finally{locked.current=false;setBusy(false);}
 }
 return <section className="profile-diagnostic-upload" aria-label="故障日志上传">
  <h3>故障日志</h3><p>遇到连接、操作确认或牌桌加载问题，可上传本 App 最近24小时内保留的诊断（最多256条，上传大小有限，并非全天完整日志）。包含设备与版本、房号、连接重试、心跳耗时和脱敏错误，不含密码、聊天或完整手牌。后台保存7天。</p>
  <button className="secondary" disabled={busy||!accountId||!appDiagnostics.enabled()} onClick={()=>void upload()}>{busy?'正在上传日志…':'上传日志'}</button>
  {!appDiagnostics.enabled()&&<p>请使用支持日志采集的新版 iOS 或安卓 App。</p>}
  {error&&<p role="alert">{error}</p>}
  {receipt&&<p role="status">日志上传成功，管理员可在后台查看。<br/>编号：{receipt}</p>}
 </section>;
}
