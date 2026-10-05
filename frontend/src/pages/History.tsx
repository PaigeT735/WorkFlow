import { useState, useEffect } from "react";
import { useApp } from "../App";
import { api, formatDuration } from "../api";
import { Raccoon } from "../components/Raccoon";
import { Calendar } from "../components/Calendar";
import { DailyChart, WeeklyChart, SubjectChart } from "../components/Charts";
import { StatCard } from "../components/StatsCards";
import type { Stats, Session, RaccoonState } from "../types";

type Range = "today" | "week" | "lastWeek" | "month";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  week: "This Week",
  lastWeek: "Last Week",
  month: "This Month",
};

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfWeek(d: Date): Date { const r = startOfDay(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); return r; }

function getRange(r: Range): { from: number; to: number } {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const tomorrowStart = todayStart + 86_400_000;
  switch (r) {
    case "today": return { from: todayStart, to: tomorrowStart };
    case "week": { const ws = startOfWeek(now).getTime(); return { from: ws, to: ws + 7 * 86_400_000 }; }
    case "lastWeek": { const ws = startOfWeek(now).getTime() - 7 * 86_400_000; return { from: ws, to: ws + 7 * 86_400_000 }; }
    case "month": { const ms = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return { from: ms, to: tomorrowStart }; }
  }
}

export function History() {
  const { preferences } = useApp();
  const [range, setRange] = useState<Range>("week");
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const { from, to } = getRange(range);
    api.getStats(from, to).then(setStats).catch(() => {});
    api.getSessions(from, to).then(setSessions).catch(() => {});
  }, [range]);

  const rangeTotal = stats?.rangeTotal ?? 0;
  const raccoonState: RaccoonState = rangeTotal === 0 ? "sleepy" : rangeTotal < 60 * 60_000 ? "happy" : "sparkly";
  const raccoonMessage =
    rangeTotal === 0 ? "we can start again today ♡" :
    rangeTotal < 2 * 60 * 60_000 ? "nice progress ♡" :
    "look how much we studied ♡";

  // Group sessions by date
  const grouped: { date: string; sessions: Session[] }[] = [];
  const groupMap = new Map<string, Session[]>();
  for (const s of sessions) {
    const d = new Date(s.endTime!);
    const key = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }
  for (const [date, sess] of groupMap) grouped.push({ date, sessions: sess });

  return (
    <div className="page">
      <div className="history-header">
        <Raccoon state={raccoonState} size="normal" animated={preferences?.animationsEnabled ?? true} />
        <div className="history-title">Your study {range === "today" ? "day" : range === "month" ? "month" : "week"} ✦</div>
        <div className="history-subtitle">{raccoonMessage}</div>
      </div>

      <div className="range-tabs">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            className={`range-tab ${range === r ? "active" : ""}`}
            onClick={() => setRange(r)}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="summary-grid">
        <StatCard label="Today" value={formatDuration(stats?.todayTotal ?? 0)} small />
        <StatCard label="Yesterday" value={formatDuration(stats?.yesterdayTotal ?? 0)} small />
        <StatCard label="This week" value={formatDuration(stats?.weekTotal ?? 0)} small />
        <StatCard label="Last week" value={formatDuration(stats?.lastWeekTotal ?? 0)} small />
        <StatCard label="Daily avg" value={formatDuration(stats?.dailyAverage ?? 0)} small />
        <StatCard label="Longest" value={formatDuration(stats?.longestSession ?? 0)} small />
      </div>

      <div className="card">
        <Calendar dailyTotals={stats?.dailyTotals ?? []} sessions={sessions} />
      </div>

      <div className="history-grid">
        <div>
          <div className="card">
            <DailyChart dailyTotals={stats?.dailyTotals ?? []} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <WeeklyChart weeklyTotals={stats?.weeklyTotals ?? []} />
          </div>
        </div>
        <div>
          <div className="card">
            <SubjectChart subjectTotals={stats?.subjectTotals ?? []} />
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Recent sessions</span>
          </div>
          {grouped.map((group) => (
            <div key={group.date}>
              <div className="session-date-group">{group.date}</div>
              <div className="session-list">
                {group.sessions.map((s) => (
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
            </div>
          ))}
        </>
      )}

      {sessions.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✦</div>
          <div className="empty-state-text">no sessions yet — let's study ♡</div>
        </div>
      )}
    </div>
  );
}
