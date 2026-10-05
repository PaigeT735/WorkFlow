import { FocusOrb } from "./FocusOrb";
import { formatDuration } from "../api";

interface Props {
  durationMs: number;
  subject: string;
  onDone: () => void;
}

export function SessionComplete({ durationMs, subject, onDone }: Props) {
  return (
    <div className="completion-screen page">
      <FocusOrb completing size="normal" animated sparkles />
      <div className="completion-title">✦ Focus complete</div>
      <div className="completion-time">{formatDuration(durationMs)}</div>
      <div className="completion-subject">{subject}</div>
      <button className="focus-btn primary" onClick={onDone} style={{ marginTop: 12 }}>
        Back home
      </button>
    </div>
  );
}
