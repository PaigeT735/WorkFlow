import { formatDuration } from "../api";

interface DailyTotal { date: string; total: number; sessions: number }
interface SubjectTotal { subject: string; total: number }
interface WeeklyTotal { weekStart: string; total: number }

export function DailyChart({ dailyTotals }: { dailyTotals: DailyTotal[] }) {
  const max = Math.max(...dailyTotals.map((d) => d.total), 1);
  const labels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="chart-section">
      <div className="chart-title">Daily study time</div>
      <div className="bar-chart">
        {dailyTotals.slice(-7).map((d, i) => {
          const date = new Date(d.date + "T00:00:00");
          const dow = (date.getDay() + 6) % 7;
          const heightPct = d.total > 0 ? (d.total / max) * 100 : 0;
          return (
            <div key={i} className="bar-col">
              {d.total > 0 && <span className="bar-value">{formatDuration(d.total)}</span>}
              <div className={`bar ${d.total === 0 ? "empty" : ""}`} style={{ height: `${Math.max(heightPct, 2)}%` }} />
              <span className="bar-label">{labels[dow]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklyChart({ weeklyTotals }: { weeklyTotals: WeeklyTotal[] }) {
  const max = Math.max(...weeklyTotals.map((w) => w.total), 1);
  const recent = weeklyTotals.slice(-6);

  return (
    <div className="chart-section">
      <div className="chart-title">Weekly study time</div>
      <div className="bar-chart">
        {recent.map((w, i) => {
          const date = new Date(w.weekStart + "T00:00:00");
          const heightPct = w.total > 0 ? (w.total / max) * 100 : 0;
          return (
            <div key={i} className="bar-col">
              {w.total > 0 && <span className="bar-value">{formatDuration(w.total)}</span>}
              <div className={`bar ${w.total === 0 ? "empty" : ""}`} style={{ height: `${Math.max(heightPct, 2)}%` }} />
              <span className="bar-label">{date.getMonth() + 1}/{date.getDate()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SubjectChart({ subjectTotals }: { subjectTotals: SubjectTotal[] }) {
  const max = Math.max(...subjectTotals.map((s) => s.total), 1);

  if (subjectTotals.length === 0) {
    return (
      <div className="chart-section">
        <div className="chart-title">Subject breakdown</div>
        <div className="empty-state">
          <div className="empty-state-text">No sessions yet ♡</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-section">
      <div className="chart-title">Subject breakdown</div>
      {subjectTotals.map((s) => (
        <div key={s.subject} className="subject-bar-row">
          <span className="subject-bar-label">{s.subject}</span>
          <div className="subject-bar-track">
            <div className="subject-bar-fill" style={{ width: `${(s.total / max) * 100}%` }} />
          </div>
          <span className="subject-bar-value">{formatDuration(s.total)}</span>
        </div>
      ))}
    </div>
  );
}
