import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { api, formatDuration, formatClock, getGreeting } from "../api";
import { Raccoon } from "../components/Raccoon";
import { StartFocusModal } from "../components/StartFocusModal";
import { StarRow, StatCard } from "../components/StatsCards";
import type { RaccoonState, Session, Stats } from "../types";

export function Home() {
  const { preferences, activeSession } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    api.getSessions(todayStart.getTime()).then(setRecent).catch(() => {});
  }, [activeSession]);

  const todayTotal = stats?.todayTotal ?? 0;
  const raccoonState: RaccoonState = todayTotal === 0 ? "sleepy" : todayTotal < 30 * 60_000 ? "happy" : "sparkly";
  const raccoonMessage =
    todayTotal === 0 ? "we could study a little? ♡" :
    todayTotal < 30 * 60_000 ? "nice start! ♡" :
    todayTotal < 60 * 60_000 ? "you're doing great ♡" :
    "look at you go! ♡";

  return (
    <div className="page">
      <div className="home-hero">
        <div className="clock">{formatClock(now, preferences?.timeFormat ?? "12h")}</div>
        <div className="greeting">{getGreeting(now)}</div>
      </div>

      <div className="home-grid">
        <div className="home-left">
          <div className="stats-grid">
            <StatCard label="Today" value={formatDuration(stats?.todayTotal ?? 0)} />
            <StatCard label="Daily avg" value={formatDuration(stats?.dailyAverage ?? 0)} />
            <StatCard label="This week" value={formatDuration(stats?.weekTotal ?? 0)} />
          </div>

          {activeSession && activeSession.status !== "completed" ? (
            <button className="start-btn continue-btn" onClick={() => navigate("/focus")}>
              ◷ Continue Focus
            </button>
          ) : (
            <button className="start-btn" onClick={() => setShowModal(true)}>
              ✦ Start Focus
            </button>
          )}

          {stats && (
            <>
              <div className="section-header">
                <span className="section-title">This week</span>
                <Link to="/history" className="section-link">View study history →</Link>
              </div>
              <StarRow dailyTotals={stats.dailyTotals} />
            </>
          )}
        </div>

        <div className="home-right">
          <div className="raccoon-area">
            <Raccoon state={raccoonState} animated={preferences?.animationsEnabled ?? true} />
            <div className="raccoon-message">{raccoonMessage}</div>
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Today's sessions</span>
          </div>
          <div className="session-list">
            {recent.map((s) => (
              <div key={s.id} className="session-item">
                <span className="session-time">
                  {new Date(s.endTime!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: preferences?.timeFormat !== "24h" })}
                </span>
                <span className="session-subject">{s.subject}</span>
                <span className="session-duration">{formatDuration(s.endTime! - s.startTime - s.pausedDuration)}</span>
                <span className="session-star">✦</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && <StartFocusModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
