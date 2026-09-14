import { Music2, Volume2, VolumeX, Speech } from "lucide-react";
import { gameAudio, type AudioPreferences } from "./audio";

export function AudioSettings({
  value,
  change,
}: {
  value: AudioPreferences;
  change: (patch: Partial<AudioPreferences>) => void;
}) {
  return (
    <div className="audio-settings">
      {(
        [
          {
            key: "music",
            volume: "musicVolume",
            label: "背景音乐",
            detail: "秦淮小调 · 轻柔弦乐",
            icon: Music2,
          },
          {
            key: "sound",
            volume: "soundVolume",
            label: "游戏音效",
            detail: "摸牌、落牌与碰杠胡提示",
            icon: value.sound ? Volume2 : VolumeX,
          },
          {
            key: "voice",
            volume: "voiceVolume",
            label: "南京话报牌",
            detail: "出牌、碰杠、补花与胡牌",
            icon: Speech,
          },
        ] as const
      ).map(({ key, volume, label, detail, icon: Icon }) => (
        <div className="audio-setting" key={key}>
          <button
            className="setting-row"
            role="switch"
            aria-checked={value[key]}
            aria-label={label}
            onClick={() => change({ [key]: !value[key] })}
          >
            <span>
              <Icon size={20} />
              <span className="audio-label">
                {label}
                <small>{detail}</small>
              </span>
            </span>
            <span className={`switch ${value[key] ? "on" : ""}`} />
          </button>
          <label className="audio-volume">
            <span>音量</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(value[volume] * 100)}
              aria-label={`${label}音量`}
              disabled={!value[key]}
              onChange={(event) =>
                change({ [volume]: Number(event.target.value) / 100 })
              }
            />
            <output>{Math.round(value[volume] * 100)}%</output>
          </label>
          {key === "voice" && (
            <button
              className="voice-preview"
              disabled={!value.voice}
              onClick={() => gameAudio.previewVoice()}
            >
              试听南京话
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
