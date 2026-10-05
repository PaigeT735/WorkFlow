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

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function intensityForMs(ms: number): number {
  if (ms <= 0) return 0;
  if (ms < 30 * 60_000) return 1;
  if (ms < 60 * 60_000) return 2;
  if (ms < 120 * 60_000) return 3;
  return 4;
}

export function Calendar({ dailyTotals, sessions }: Props) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<{ key: string; total: number; sessions: number; subjects: Map<string, number> } | null>(null);

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

  function handleDayClick(cell: { day: number; key: string }) {
    if (cell.day === 0) return;
    const data = dataMap.get(cell.key);
    const total = data?.total ?? 0;
    const sess = data?.sessions ?? 0;
    const subs = subjectByDay.get(cell.key) ?? new Map<string, number>();
    setSelectedDay({ key: cell.key, total, sessions: sess, subjects: subs });
  }

  const selectedDate = selectedDay ? parseDate(selectedDay.key) : null;

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={prevMonth}>‹</button>
        <div className="calendar-month">{MONTHS[viewMonth]} {viewYear}</div>
        <button className="calendar-nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-grid">
        {DOW.map((d, i) => (
          <div key={i} className="calendar-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (cell.day === 0) return <div key={i} className="calendar-day empty" />;
          const data = dataMap.get(cell.key);
          const total = data?.total ?? 0;
          const intensity = intensityForMs(total);
          const isToday = cell.key === todayKey;
          const subs = subjectByDay.get(cell.key);
          return (
            <div
              key={i}
              className={`calendar-day intensity-${intensity} ${isToday ? "today" : ""}`}
              onClick={() => handleDayClick(cell)}
            >
              <span className="calendar-day-num">{cell.day}</span>
              {total > 0 && (
                <div className="calendar-day-tooltip">
                  <div style={{ fontWeight: 600 }}>{formatDuration(total)} focused</div>
                  <div style={{ color: "var(--text-muted)" }}>{data?.sessions ?? 0} session{(data?.sessions ?? 0) !== 1 ? "s" : ""}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail sheet */}
      {selectedDay && selectedDate && (
        <div className="day-detail-sheet" onClick={() => setSelectedDay(null)}>
          <div className="day-detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="day-detail-title">
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            {selectedDay.total > 0 ? (
              <>
                <div className="day-detail-total">{formatDuration(selectedDay.total)} focused</div>
                <div className="day-detail-count">{selectedDay.sessions} session{selectedDay.sessions !== 1 ? "s" : ""}</div>
                {[...selectedDay.subjects.entries()].length > 0 && (
                  <div>
                    {[...selectedDay.subjects.entries()].map(([sub, t]) => (
                      <div key={sub} className="day-detail-row">
                        <span className="day-detail-row-label">{sub}</span>
                        <span className="day-detail-row-value">{formatDuration(t)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="day-detail-count">No sessions this day</div>
            )}
            <button className="day-detail-close" onClick={() => setSelectedDay(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
