import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";

const SUBJECTS = ["Finance", "Economics", "Statistics", "Spanish", "Operations", "Business", "Other"];
const DURATIONS = [
  { label: "25m", ms: 25 * 60_000 },
  { label: "45m", ms: 45 * 60_000 },
  { label: "60m", ms: 60 * 60_000 },
  { label: "90m", ms: 90 * 60_000 },
];

interface Props {
  onClose: () => void;
}

export function StartFocusModal({ onClose }: Props) {
  const { preferences, refreshActive } = useApp();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(preferences?.defaultSubject ?? "Finance");
  const [customSubject, setCustomSubject] = useState("");
  const [duration, setDuration] = useState<number | null>(preferences?.defaultDuration ?? 25 * 60_000);
  const [customDur, setCustomDur] = useState("");
  const [starting, setStarting] = useState(false);

  const activeSubject = customSubject || subject;

  async function handleStart() {
    setStarting(true);
    try {
      let dur: number | null = duration;
      if (customDur) {
        const min = parseInt(customDur, 10);
        if (!isNaN(min) && min > 0) dur = min * 60_000;
      }
      await api.startSession(activeSubject, dur);
      await refreshActive();
      onClose();
      navigate("/focus");
    } catch (e) {
      console.error(e);
    }
    setStarting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>What are you studying?</h2>
        <p className="modal-sub">Choose your focus ✦</p>

        <div className="modal-section">
          <div className="modal-section-label">Subject</div>
          <div className="chip-row">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                className={`chip ${!customSubject && subject === s ? "selected" : ""}`}
                onClick={() => { setSubject(s); setCustomSubject(""); }}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            className="chip-input"
            style={{ marginTop: 8, width: "100%" }}
            placeholder="Or type your own..."
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
          />
        </div>

        <div className="modal-section">
          <div className="modal-section-label">How long?</div>
          <div className="chip-row">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                className={`chip ${!customDur && duration === d.ms ? "selected" : ""}`}
                onClick={() => { setDuration(d.ms); setCustomDur(""); }}
              >
                {d.label}
              </button>
            ))}
            <button
              className={`chip ${duration === null && !customDur ? "selected" : ""}`}
              onClick={() => { setDuration(null); setCustomDur(""); }}
            >
              Open
            </button>
            <input
              className="chip-input"
              style={{ width: 80 }}
              placeholder="Custom"
              type="number"
              value={customDur}
              onChange={(e) => setCustomDur(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="start-btn" onClick={handleStart} disabled={starting}>
            ✦ Start Focus
          </button>
        </div>
      </div>
    </div>
  );
}
