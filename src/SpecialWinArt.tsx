import type { CSSProperties } from "react";
import { winTheme } from "./win-theme";
import "./special-win-art.css";

export function SpecialWinArt({
  label,
  names,
}: {
  label: string;
  names: string;
}) {
  const theme = winTheme(label);
  if (!theme) return null;
  return (
    <div
      className={`special-win-art theme-${theme}`}
      style={{ "--title-length": label.length } as CSSProperties}
    >
      <img
        className="special-win-ornament"
        src={`${import.meta.env.BASE_URL}art/win-v2/${theme}.webp`}
        alt=""
        draggable={false}
      />
      <div className="special-win-copy">
        <strong className="special-win-title">{label}</strong>
        <span className="special-win-player">{names}</span>
      </div>
    </div>
  );
}
