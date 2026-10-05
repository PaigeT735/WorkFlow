import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type SessionStatus = "active" | "paused" | "completed" | "cancelled";

export interface Session {
  id: string;
  subject: string;
  startTime: number; // epoch ms
  endTime: number | null;
  plannedDuration: number | null; // ms, null = open-ended
  status: SessionStatus;
  pausedDuration: number; // accumulated paused ms (completed pauses only)
  lastPauseTime: number | null; // when current pause started
  createdAt: number;
}

export interface Preferences {
  theme: string;
  timeFormat: "12h" | "24h";
  defaultDuration: number | null; // ms, null = open-ended
  defaultSubject: string;
  animationsEnabled: boolean;
  soundEnabled: boolean;
}

interface StoreData {
  sessions: Session[];
  preferences: Preferences;
}

const DEFAULT_PREFS: Preferences = {
  theme: "lavender-night",
  timeFormat: "12h",
  defaultDuration: 25 * 60_000,
  defaultSubject: "Finance",
  animationsEnabled: true,
  soundEnabled: false,
};

export class Store {
  private data: StoreData = { sessions: [], preferences: { ...DEFAULT_PREFS } };
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "store.json");
  }

  init(): void {
    const dir = join(this.filePath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<StoreData>;
        this.data = {
          sessions: parsed.sessions ?? [],
          preferences: { ...DEFAULT_PREFS, ...parsed.preferences },
        };
      } catch {
        // corrupt file — start fresh
      }
    }
    this.persist();
  }

  private persist(): void {
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.filePath);
  }

  // ---- Preferences ----
  getPreferences(): Preferences {
    return { ...this.data.preferences };
  }

  updatePreferences(patch: Partial<Preferences>): Preferences {
    this.data.preferences = { ...this.data.preferences, ...patch };
    this.persist();
    return this.getPreferences();
  }

  // ---- Sessions ----
  getActiveSession(): Session | null {
    return (
      this.data.sessions.find((s) => s.status === "active" || s.status === "paused") ?? null
    );
  }

  getSession(id: string): Session | null {
    return this.data.sessions.find((s) => s.id === id) ?? null;
  }

  startSession(subject: string, plannedDuration: number | null): Session {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      subject: subject || "Other",
      startTime: now,
      endTime: null,
      plannedDuration,
      status: "active",
      pausedDuration: 0,
      lastPauseTime: null,
      createdAt: now,
    };
    this.data.sessions.push(session);
    this.persist();
    return session;
  }

  pauseSession(id: string): Session | null {
    const s = this.getSession(id);
    if (!s || s.status !== "active") return null;
    s.status = "paused";
    s.lastPauseTime = Date.now();
    this.persist();
    return s;
  }

  resumeSession(id: string): Session | null {
    const s = this.getSession(id);
    if (!s || s.status !== "paused" || s.lastPauseTime === null) return null;
    s.pausedDuration += Date.now() - s.lastPauseTime;
    s.lastPauseTime = null;
    s.status = "active";
    this.persist();
    return s;
  }

  finishSession(id: string): Session | null {
    const s = this.getSession(id);
    if (!s || (s.status !== "active" && s.status !== "paused")) return null;
    const now = Date.now();
    if (s.status === "paused" && s.lastPauseTime !== null) {
      s.pausedDuration += now - s.lastPauseTime;
      s.lastPauseTime = null;
    }
    s.endTime = now;
    s.status = "completed";
    this.persist();
    return s;
  }

  cancelSession(id: string): Session | null {
    const s = this.getSession(id);
    if (!s || (s.status !== "active" && s.status !== "paused")) return null;
    const now = Date.now();
    if (s.status === "paused" && s.lastPauseTime !== null) {
      s.pausedDuration += now - s.lastPauseTime;
      s.lastPauseTime = null;
    }
    s.endTime = now;
    s.status = "cancelled";
    this.persist();
    return s;
  }

  getSessions(from?: number, to?: number): Session[] {
    return this.data.sessions
      .filter((s) => s.status === "completed")
      .filter((s) => (from ? s.endTime! >= from : true))
      .filter((s) => (to ? s.endTime! <= to : true))
      .sort((a, b) => (b.endTime! - a.endTime!));
  }

  getAllCompleted(): Session[] {
    return this.data.sessions.filter((s) => s.status === "completed");
  }
}

// ---- Time computation helpers (shared logic) ----
export function actualDuration(s: Session): number {
  if (s.endTime === null) return 0;
  return Math.max(0, s.endTime - s.startTime - s.pausedDuration);
}

export function computeElapsed(s: Session, now: number): number {
  const wall = now - s.startTime;
  const currentPause = s.status === "paused" && s.lastPauseTime !== null ? now - s.lastPauseTime : 0;
  return Math.max(0, wall - s.pausedDuration - currentPause);
}

export function computeRemaining(s: Session, now: number): number | null {
  if (s.plannedDuration === null) return null;
  return Math.max(0, s.plannedDuration - computeElapsed(s, now));
}
