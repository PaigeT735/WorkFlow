import type { Session, Preferences, Stats } from "./types";

const base = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
  return res.json() as Promise<T>;
}

export const api = {
  async getActiveSession(): Promise<Session | null> {
    const res = await fetch(`${base}/sessions/active`);
    return json<Session | null>(res);
  },

  async startSession(subject: string, plannedDuration: number | null): Promise<Session> {
    const res = await fetch(`${base}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, plannedDuration }),
    });
    return json<Session>(res);
  },

  async pauseSession(id: string): Promise<Session> {
    const res = await fetch(`${base}/sessions/${id}/pause`, { method: "POST" });
    return json<Session>(res);
  },

  async resumeSession(id: string): Promise<Session> {
    const res = await fetch(`${base}/sessions/${id}/resume`, { method: "POST" });
    return json<Session>(res);
  },

  async finishSession(id: string): Promise<Session> {
    const res = await fetch(`${base}/sessions/${id}/finish`, { method: "POST" });
    return json<Session>(res);
  },

  async cancelSession(id: string): Promise<Session> {
    const res = await fetch(`${base}/sessions/${id}/cancel`, { method: "POST" });
    return json<Session>(res);
  },

  async getSessions(from?: number, to?: number): Promise<Session[]> {
    const params = new URLSearchParams();
    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));
    const res = await fetch(`${base}/sessions?${params}`);
    return json<Session[]>(res);
  },

  async getStats(from?: number, to?: number): Promise<Stats> {
    const params = new URLSearchParams();
    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));
    const res = await fetch(`${base}/stats?${params}`);
    return json<Stats>(res);
  },

  async getPreferences(): Promise<Preferences> {
    const res = await fetch(`${base}/preferences`);
    return json<Preferences>(res);
  },

  async updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
    const res = await fetch(`${base}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return json<Preferences>(res);
  },
};

// ---- Time helpers ----
export function computeElapsed(s: Session, now: number): number {
  const wall = now - s.startTime;
  const currentPause = s.status === "paused" && s.lastPauseTime !== null ? now - s.lastPauseTime : 0;
  return Math.max(0, wall - s.pausedDuration - currentPause);
}

export function computeRemaining(s: Session, now: number): number | null {
  if (s.plannedDuration === null) return null;
  return Math.max(0, s.plannedDuration - computeElapsed(s, now));
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatClock(date: Date, fmt: "12h" | "24h"): string {
  if (fmt === "24h") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Still up? ♡";
  if (h < 12) return "Good morning ♡";
  if (h < 17) return "Good afternoon ♡";
  if (h < 21) return "Good evening ♡";
  return "Good night ♡";
}
