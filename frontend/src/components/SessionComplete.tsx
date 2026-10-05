import { Raccoon } from "./Raccoon";
import { formatDuration } from "../api";

interface Props {
  durationMs: number;
  subject: string;
  onDone: () => void;
}

export function SessionComplete({ durationMs, subject, onDone }: Props) {
  return (
    <div className="focus-screen page">
      <Raccoon state="celebrating" size="large" />
      <div className="celebration">
        <div className="celebration-title">✦ Focus complete!</div>
        <div className="celebration-time">{formatDuration(durationMs)} studied</div>
        <div className="celebration-msg">look at you ♡</div>
        <p style={{ color: "var(--text-subtle)", marginTop: 4 }}>{subject}</p>
      </div>
      <button className="focus-btn primary" onClick={onDone} style={{ marginTop: 16 }}>
        Back home
      </button>
    </div>
  );
}
