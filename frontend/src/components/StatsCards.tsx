import { formatDuration } from "../api";

interface DayData { date: string; total: number }

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function StarRow({ dailyTotals }: { dailyTotals: DayData[] }) {
  const last7 = dailyTotals.slice(-7);

  return (
    <div className="star-row">
      {last7.map((d, i) => {
        const date = new Date(d.date + "T00:00:00");
        const dow = (date.getDay() + 6) % 7;
        const active = d.total > 0;
        const big = d.total >= 60 * 60_000;
        return (
          <div key={i} className="star-row-item">
            <span
              className={`star-row-icon ${active ? "active" : "inactive"}`}
              style={{ fontSize: big ? "1.5rem" : "1.1rem" }}
            >
              {active ? (big ? "★" : "✦") : "·"}
            </span>
            <span className="star-row-day">{DOW[dow]}</span>
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
