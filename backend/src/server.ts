import process from "node:process";
import express from "express";
import cors from "cors";
import {
  Store,
  computeElapsed,
  computeRemaining,
  type Session,
} from "./store.js";
import { computeStats } from "./stats.js";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const DATA_DIR = process.env.DATA_DIR ?? "./data";

const store = new Store(DATA_DIR);
store.init();

const app = express();
app.use(cors());
app.use(express.json());

// ---- Helpers ----
function sessionWithComputed(s: Session) {
  const now = Date.now();
  return {
    ...s,
    elapsedMs: computeElapsed(s, now),
    remainingMs: computeRemaining(s, now),
  };
}

// ---- Health ----
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// ---- Preferences ----
app.get("/api/preferences", (_req, res) => {
  res.json(store.getPreferences());
});

app.put("/api/preferences", (req, res) => {
  res.json(store.updatePreferences(req.body));
});

// ---- Active session ----
app.get("/api/sessions/active", (_req, res) => {
  const s = store.getActiveSession();
  if (!s) return res.json(null);

  // Auto-complete if planned duration reached
  if (s.status === "active" && s.plannedDuration !== null) {
    const remaining = computeRemaining(s, Date.now());
    if (remaining <= 0) {
      const completed = store.finishSession(s.id);
      if (completed) return res.json(sessionWithComputed(completed));
    }
  }
  res.json(sessionWithComputed(s));
});

// ---- Start session ----
app.post("/api/sessions/start", (req, res) => {
  if (store.getActiveSession()) {
    return res.status(409).json({ error: "A session is already active" });
  }
  const { subject, plannedDuration } = req.body as {
    subject?: string;
    plannedDuration?: number | null;
  };
  const session = store.startSession(subject ?? "Other", plannedDuration ?? null);
  res.json(sessionWithComputed(session));
});

// ---- Session actions ----
app.post("/api/sessions/:id/pause", (req, res) => {
  const s = store.pauseSession(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found or not active" });
  res.json(sessionWithComputed(s));
});

app.post("/api/sessions/:id/resume", (req, res) => {
  const s = store.resumeSession(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found or not paused" });
  res.json(sessionWithComputed(s));
});

app.post("/api/sessions/:id/finish", (req, res) => {
  const s = store.finishSession(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found or already finished" });
  res.json(sessionWithComputed(s));
});

app.post("/api/sessions/:id/cancel", (req, res) => {
  const s = store.cancelSession(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found or already finished" });
  res.json(sessionWithComputed(s));
});

// ---- Session history ----
app.get("/api/sessions", (req, res) => {
  const from = req.query.from ? parseInt(req.query.from as string, 10) : undefined;
  const to = req.query.to ? parseInt(req.query.to as string, 10) : undefined;
  res.json(store.getSessions(from, to));
});

// ---- Stats ----
app.get("/api/stats", (req, res) => {
  const from = req.query.from ? parseInt(req.query.from as string, 10) : undefined;
  const to = req.query.to ? parseInt(req.query.to as string, 10) : undefined;
  res.json(computeStats(store.getAllCompleted(), from, to));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Study timer backend listening on :${PORT}`);
});
