import { actualDuration } from "./store.js";
import type { Session } from "./store.js";

export interface StatsResponse {
  todayTotal: number;
  yesterdayTotal: number;
  weekTotal: number;
  lastWeekTotal: number;
  dailyAverage: number;
  longestSession: number;
  thisWeekProgress: number; // 0-1 fraction of weekTotal / weeklyGoal (if no goal, fraction of dailyAverage*7)
  todaySessionCount: number;
  // range-based data
  dailyTotals: { date: string; total: number; sessions: number }[];
  subjectTotals: { subject: string; total: number }[];
  weeklyTotals: { weekStart: string; total: number }[];
  rangeTotal: number;
  rangeSessions: number;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  r.setDate(r.getDate() + diff);
  return r;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeStats(sessions: Session[], from?: number, to?: number): StatsResponse {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const tomorrowStart = todayStart + 86_400_000;
  const yesterdayStart = todayStart - 86_400_000;

  const weekStart = startOfWeek(now).getTime();
  const lastWeekStart = weekStart - 7 * 86_400_000;
  const nextWeekStart = weekStart + 7 * 86_400_000;

  const completed = sessions.filter((s) => s.status === "completed");

  const todayTotal = sum(completed.filter((s) => s.endTime! >= todayStart && s.endTime! < tomorrowStart));
  const yesterdayTotal = sum(completed.filter((s) => s.endTime! >= yesterdayStart && s.endTime! < todayStart));
  const weekTotal = sum(completed.filter((s) => s.endTime! >= weekStart && s.endTime! < nextWeekStart));
  const lastWeekTotal = sum(completed.filter((s) => s.endTime! >= lastWeekStart && s.endTime! < weekStart));

  // daily average over last 7 days
  const sevenDaysAgo = todayStart - 6 * 86_400_000;
  const last7 = completed.filter((s) => s.endTime! >= sevenDaysAgo && s.endTime! < tomorrowStart);
  const dailyAverage = Math.round(sum(last7) / 7);

  const longestSession = completed.reduce((mx, s) => Math.max(mx, actualDuration(s)), 0);
  const todaySessionCount = completed.filter((s) => s.endTime! >= todayStart && s.endTime! < tomorrowStart).length;

  const thisWeekProgress = dailyAverage > 0 ? Math.min(1, weekTotal / (dailyAverage * 7)) : weekTotal > 0 ? 1 : 0;

  // Range-based data
  const rangeFrom = from ?? sevenDaysAgo;
  const rangeTo = to ?? tomorrowStart;
  const rangeSessions = completed.filter((s) => s.endTime! >= rangeFrom && s.endTime! < rangeTo);
  const rangeTotal = sum(rangeSessions);

  // Daily totals within range
  const dailyMap = new Map<string, { total: number; sessions: number }>();
  for (const s of rangeSessions) {
    const key = dateKey(new Date(s.endTime!));
    const entry = dailyMap.get(key) ?? { total: 0, sessions: 0 };
    entry.total += actualDuration(s);
    entry.sessions += 1;
    dailyMap.set(key, entry);
  }
  const dailyTotals: { date: string; total: number; sessions: number }[] = [];
  const cursor = startOfDay(new Date(rangeFrom));
  const end = startOfDay(new Date(rangeTo));
  while (cursor <= end) {
    const key = dateKey(cursor);
    const entry = dailyMap.get(key);
    dailyTotals.push({ date: key, total: entry?.total ?? 0, sessions: entry?.sessions ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Subject totals within range
  const subjectMap = new Map<string, number>();
  for (const s of rangeSessions) {
    subjectMap.set(s.subject, (subjectMap.get(s.subject) ?? 0) + actualDuration(s));
  }
  const subjectTotals = [...subjectMap.entries()]
    .map(([subject, total]) => ({ subject, total }))
    .sort((a, b) => b.total - a.total);

  // Weekly totals (last 8 weeks)
  const weeklyTotals: { weekStart: string; total: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const ws = weekStart - i * 7 * 86_400_000;
    const we = ws + 7 * 86_400_000;
    const total = sum(completed.filter((s) => s.endTime! >= ws && s.endTime! < we));
    weeklyTotals.push({ weekStart: dateKey(new Date(ws)), total });
  }

  return {
    todayTotal,
    yesterdayTotal,
    weekTotal,
    lastWeekTotal,
    dailyAverage,
    longestSession,
    thisWeekProgress,
    todaySessionCount,
    dailyTotals,
    subjectTotals,
    weeklyTotals,
    rangeTotal,
    rangeSessions: rangeSessions.length,
  };
}

function sum(arr: Session[]): number {
  return arr.reduce((acc, s) => acc + actualDuration(s), 0);
}
