import { useState } from "react";
import { formatDuration } from "../api";

interface DayData {
  date: string; // YYYY-MM-DD
  total: number;
  sessions: number;
  subjects?: { subject: string; total: number }[];
}

interface Props {
  dailyTotals: DayData[];
  sessions: { startTime: number; subject: string; endTime: number }[];
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function starForMs(ms: number): { icon: string; className: string } {
  if (ms <= 0) return { icon: "", className: "" };
  if (ms < 30 * 60_000) return { icon: "✦", className: "star-small" };
  if (ms < 60 * 60_000) return { icon: "✦", className: "star-medium" };
  if (ms < 120 * 60_000) return { icon: "★", className: "star-large" };
  return { icon: "★", className: "star-glow" };
}

export function Calendar({ dailyTotals, sessions }: Props) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const dataMap = new Map(dailyTotals.map((d) => [d.date, d]));

  // Build subject breakdown per day from sessions
  const subjectByDay = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    if (!s.endTime) continue;
    const key = dateKey(new Date(s.endTime));
    const dayMap = subjectByDay.get(key) ?? new Map();
    const dur = s.endTime - s.startTime;
    dayMap.set(s.subject, (dayMap.get(s.subject) ?? 0) + dur);
    subjectByDay.set(key, dayMap);
  }

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: { day: number; key: string }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: 0, key: "" });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: dateKey(new Date(viewYear, viewMonth, d)) });
  }

  const todayKey = dateKey(today);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={prevMonth}>‹</button>
        <div className="calendar-month">{MONTHS[viewMonth]} {viewYear}</div>
        <button className="calendar-nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-grid">
        {DOW.map((d) => (
          <div key={d} className="calendar-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (cell.day === 0) return <div key={i} className="calendar-day empty" />;
          const data = dataMap.get(cell.key);
          const total = data?.total ?? 0;
          const star = starForMs(total);
          const isToday = cell.key === todayKey;
          const subs = subjectByDay.get(cell.key);
          return (
            <div key={i} className={`calendar-day ${isToday ? "today" : ""}`}>
              <span className="calendar-day-num">{cell.day}</span>
              {star.icon && (
                <span className="calendar-star" style={{
                  color: total >= 120 * 60_000 ? "var(--star-glow)" : "var(--star)",
                  fontSize: total >= 120 * 60_000 ? "1rem" : total >= 60 * 60_000 ? "0.85rem" : "0.7rem",
                }}>{star.icon}</span>
              )}
              {total > 0 && subs && (
                <div className="calendar-day-tooltip">
                  <div style={{ fontWeight: 700 }}>{formatDuration(total)} studied</div>
                  <div style={{ color: "var(--text-muted)" }}>{data?.sessions ?? 0} session{(data?.sessions ?? 0) !== 1 ? "s" : ""}</div>
                  {[...subs.entries()].map(([sub, t]) => (
                    <div key={sub} style={{ color: "var(--text-muted)" }}>{sub}: {formatDuration(t)}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
