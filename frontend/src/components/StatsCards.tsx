import { formatDuration } from "../api";

interface DayData { date: string; total: number }

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function StreakRow({ dailyTotals }: { dailyTotals: DayData[] }) {
  const last7 = dailyTotals.slice(-7);

  return (
    <div className="streak-row">
      {last7.map((d, i) => {
        const date = new Date(d.date + "T00:00:00");
        const dow = (date.getDay() + 6) % 7;
        const active = d.total > 0;
        return (
          <div key={i} className="streak-dot-item">
            <span className={`streak-dot ${active ? "active" : "inactive"}`} />
            <span className="streak-dot-label">{DOW[dow]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="stat-item">
      <div className="stat-label">{label}</div>
      <div className={small ? "stat-value stat-value-sm" : "stat-value"}>{value}</div>
    </div>
  );
}

export { formatDuration };
