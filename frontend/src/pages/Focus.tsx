import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { api, computeRemaining, computeElapsed, formatTimer, formatDuration } from "../api";
import { Raccoon } from "../components/Raccoon";
import { SessionComplete } from "../components/SessionComplete";
import type { RaccoonState } from "../types";

export function Focus() {
  const { activeSession, refreshActive, preferences } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [completed, setCompleted] = useState<{ duration: number; subject: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fast local tick for smooth timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Faster polling on focus page
  useEffect(() => {
    refreshActive();
    pollRef.current = setInterval(refreshActive, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refreshActive]);

  // Detect auto-completion from backend
  useEffect(() => {
    if (activeSession?.status === "completed") {
      const dur = activeSession.endTime! - activeSession.startTime - activeSession.pausedDuration;
      setCompleted({ duration: dur, subject: activeSession.subject });
    }
  }, [activeSession?.status, activeSession?.id]);

  if (completed) {
    return (
      <SessionComplete
        durationMs={completed.duration}
        subject={completed.subject}
        onDone={() => { setCompleted(null); navigate("/"); }}
      />
    );
  }

  if (!activeSession || (activeSession.status !== "active" && activeSession.status !== "paused")) {
    return (
      <div className="focus-screen page">
        <Raccoon state="sleepy" animated={preferences?.animationsEnabled ?? true} />
        <div className="raccoon-message">no active session ♡</div>
        <button className="start-btn" onClick={() => navigate("/")}>✦ Start Focus</button>
      </div>
    );
  }

  const s = activeSession;
  const remaining = computeRemaining(s, now);
  const elapsed = computeElapsed(s, now);
  const isPaused = s.status === "paused";
  const isOpen = s.plannedDuration === null;

  // Raccoon state based on elapsed time
  let raccoonState: RaccoonState = "focused";
  if (elapsed >= 60 * 60_000) raccoonState = "sparkly";
  else if (elapsed >= 30 * 60_000) raccoonState = "happy";

  const displayMs = isOpen ? elapsed : (remaining ?? 0);

  async function handlePauseResume() {
    if (s.status === "active") await api.pauseSession(s.id);
    else await api.resumeSession(s.id);
    await refreshActive();
  }

  async function handleFinish() {
    await api.finishSession(s.id);
    await refreshActive();
    const dur = s.endTime ? s.endTime - s.startTime - s.pausedDuration : elapsed;
    setCompleted({ duration: dur, subject: s.subject });
  }

  async function handleCancel() {
    await api.cancelSession(s.id);
    await refreshActive();
    navigate("/");
  }

  return (
    <div className="focus-screen page">
      <div className="focus-subject">{s.subject}</div>
      <div className="focus-mode-tag">{isOpen ? "Open Focus" : "Deep Focus"}</div>

      <div className={`focus-timer ${isPaused ? "paused" : ""} ${isOpen ? "open-ended" : ""}`}>
        {isOpen ? formatTimer(elapsed) : formatTimer(displayMs)}
      </div>

      <Raccoon state={raccoonState} animated={preferences?.animationsEnabled ?? true} />

      <div className="focus-controls">
        <button className="focus-btn primary" onClick={handlePauseResume}>
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button className="focus-btn secondary" onClick={handleFinish}>
          Finish Session
        </button>
        <button className="focus-btn danger" onClick={handleCancel}>
          Cancel
        </button>
      </div>

      {isPaused && (
        <div style={{ color: "var(--text-subtle)", fontFamily: "var(--font-hand)", fontSize: "1.2rem", marginTop: 4 }}>
          paused ♡ take your time
        </div>
      )}
    </div>
  );
}
