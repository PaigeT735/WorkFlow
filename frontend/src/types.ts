export type SessionStatus = "active" | "paused" | "completed" | "cancelled";

export interface Session {
  id: string;
  subject: string;
  startTime: number;
  endTime: number | null;
  plannedDuration: number | null;
  status: SessionStatus;
  pausedDuration: number;
  lastPauseTime: number | null;
  createdAt: number;
  elapsedMs?: number;
  remainingMs?: number | null;
}

export interface Preferences {
  theme: string;
  timeFormat: "12h" | "24h";
  defaultDuration: number | null;
  defaultSubject: string;
  animationsEnabled: boolean;
  soundEnabled: boolean;
}

export interface Stats {
  todayTotal: number;
  yesterdayTotal: number;
  weekTotal: number;
  lastWeekTotal: number;
  dailyAverage: number;
  longestSession: number;
  thisWeekProgress: number;
  todaySessionCount: number;
  dailyTotals: { date: string; total: number; sessions: number }[];
  subjectTotals: { subject: string; total: number }[];
  weeklyTotals: { weekStart: string; total: number }[];
  rangeTotal: number;
  rangeSessions: number;
}

export type RaccoonState = "sleepy" | "focused" | "happy" | "sparkly" | "celebrating";
