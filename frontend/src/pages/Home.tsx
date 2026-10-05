import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { api, formatDuration, getGreeting } from "../api";
import { FocusOrb } from "../components/FocusOrb";
import { StartFocusModal } from "../components/StartFocusModal";
import { StreakRow } from "../components/StatsCards";
import type { Session, Stats } from "../types";

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

  // Count streak days
  const streak = (() => {
    if (!stats?.dailyTotals) return 0;
    let count = 0;
    for (let i = stats.dailyTotals.length - 1; i >= 0; i--) {
      if (stats.dailyTotals[i].total > 0) count++;
      else break;
    }
    return count;
  })();

  return (
    <div className="page">
      <div className="home-hero">
        <div className="home-greeting">{getGreeting(now)}</div>
        <div className="home-subtitle">Ready to focus?</div>
      </div>

      {/* Stats — quiet typography */}
      <div className="home-stats">
        <div className="home-stat">
          <div className="home-stat-label">Today</div>
          <div className="home-stat-value">{formatDuration(todayTotal)}</div>
        </div>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <div className="home-stat-label">This week</div>
          <div className="home-stat-value">{formatDuration(stats?.weekTotal ?? 0)}</div>
        </div>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <div className="home-stat-label">Streak</div>
          <div className="home-stat-value">{streak} {streak === 1 ? "day" : "days"}</div>
        </div>
      </div>

      {/* Focus Orb */}
      <div className="orb-wrapper">
        {activeSession && activeSession.status !== "completed" ? (
          <FocusOrb
            idle
            size="normal"
            animated={preferences?.animationsEnabled ?? true}
            onClick={() => navigate("/focus")}
          />
        ) : (
          <FocusOrb
            idle
            size="normal"
            animated={preferences?.animationsEnabled ?? true}
            onClick={() => setShowModal(true)}
          />
        )}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="home-streak">
          <span className="sparkle">✦</span> {streak} day streak
        </div>
      )}

      {/* Progress link */}
      <div className="home-progress-link">
        <Link to="/history">View progress →</Link>
      </div>

      {/* Weekly streak dots */}
      {stats && (
        <StreakRow dailyTotals={stats.dailyTotals} />
      )}

      {/* Today's sessions */}
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
