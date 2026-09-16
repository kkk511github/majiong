import { WinHintPanel } from "./WinHintPanel";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TableSceneCommand, TableSceneState } from '../shared/table-scene';
import './cocos-table.css';
import { createTableChannel } from './cocos-channel';

/** One canvas and one renderer for Android, iOS and the browser. The iframe
 * receives only the public view and explicit local UI state, never the wall. */
export function CocosTable({ state, onCommand, children, embedded=false }: {
  state: TableSceneState;
  onCommand: (command: TableSceneCommand) => void;
  children?: ReactNode; embedded?:boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [channel] = useState(createTableChannel);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef({ state, onCommand });
  latest.current = { state, onCommand };
  const send = () => frame.current?.contentWindow?.postMessage({
    scope: 'jinling-table-v1', channel, type: 'state', state: latest.current.state,
  }, location.origin === 'null' ? '*' : location.origin);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.scope !== 'jinling-table-v1' || data.channel !== channel) return;
      if (data.type === 'ready') { setStatus('ready'); send(); }
      if (data.type === 'error') setStatus('error');
      if (data.type === 'command' && data.command && typeof data.command.type === 'string')
        latest.current.onCommand(data.command);
    };
    const resume = () => { if (!document.hidden) send(); };
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [channel]);
  useEffect(() => { if (status === 'ready') send(); }, [state, status]);
  return <main className={`cocos-game${embedded?" cocos-embedded":""}`} id={embedded?undefined:"cocos-table-board"} aria-label="南京麻将牌桌">
    <iframe ref={frame} title="金陵麻将牌桌" src={`${import.meta.env.BASE_URL}cocos-table/index.html?channel=${encodeURIComponent(channel)}`}
      allow="autoplay" onError={() => setStatus('error')} />
    {status !== 'ready' && <div className="cocos-loading" role="status">
      <strong>{status === 'error' ? '牌桌加载失败' : '正在摆好牌桌…'}</strong>
      {status === 'error' && <button onClick={() => { setStatus('loading'); if (frame.current) frame.current.src = `${import.meta.env.BASE_URL}cocos-table/index.html?channel=${encodeURIComponent(channel)}&retry=${Date.now()}`; }}>重新加载</button>}
      {!embedded&&<button onClick={() => onCommand({ type: 'menu', menu: 'leave' })}>返回大厅</button>}
    </div>}
    {status === "ready" && !embedded && <WinHintPanel state={state} onCommand={onCommand}/>}
    {children && <div className="cocos-voice">{children}</div>}
  </main>;
}
