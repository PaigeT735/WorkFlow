import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { api, computeRemaining, computeElapsed, formatTimer } from "../api";
import { FocusOrb } from "../components/FocusOrb";
import { SessionComplete } from "../components/SessionComplete";

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
        <FocusOrb
          idle
          size="normal"
          animated={preferences?.animationsEnabled ?? true}
          onClick={() => navigate("/")}
        />
        <div className="focus-paused-hint">No active session</div>
        <button className="focus-btn primary" onClick={() => navigate("/")}>Start Focus</button>
      </div>
    );
  }

  const s = activeSession;
  const remaining = computeRemaining(s, now);
  const elapsed = computeElapsed(s, now);
  const isPaused = s.status === "paused";
  const isOpen = s.plannedDuration === null;

  // Progress for ring (0 to 1)
  const progress = isOpen ? null : (s.plannedDuration! > 0 ? elapsed / s.plannedDuration! : 0);

  const displayMs = isOpen ? elapsed : (remaining ?? 0);
  const timerStr = formatTimer(displayMs);

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
      <div className="focus-context">
        <div className="focus-subject">{s.subject}</div>
        <div className="focus-mode-tag">{isOpen ? "Open Focus" : "Deep Focus"}</div>
      </div>

      <FocusOrb
        timer={timerStr}
        paused={isPaused}
        progress={progress}
        size="large"
        animated={preferences?.animationsEnabled ?? true}
        sparkles={!isPaused && elapsed > 30 * 60_000}
      />

      <div className="focus-controls">
        <button className="focus-btn glass-btn" onClick={handlePauseResume}>
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button className="focus-btn primary" onClick={handleFinish}>
          Finish
        </button>
        <button className="focus-btn end-btn" onClick={handleCancel}>End</button>
      </div>

      {isPaused && (
        <div className="focus-paused-hint">paused — take your time</div>
      )}
    </div>
  );
}
