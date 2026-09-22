import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { gameAudio } from "./audio";
import { storage } from "./game-client";
import { useLiveRecords } from "./useLiveRecords";

export function LobbyRecordSound({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(() => storage.get(`recordsSound:${accountId}`, true));
  useLiveRecords(true, accountId, (_page, arrivals, notify) => {
    if (enabled && notify && arrivals.length) gameAudio.play("records");
  });
  return <button
    type="button"
    className="icon-button"
    aria-label="新战绩提示音"
    aria-pressed={enabled}
    title={`新整桌战绩提示音：${enabled ? "开" : "关"}`}
    onClick={() => {
      const next = !enabled;
      setEnabled(next);
      storage.set(`recordsSound:${accountId}`, next);
      if (next) gameAudio.unlock();
    }}
  >{enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>;
}
