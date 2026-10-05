import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { api } from "./api";
import { applyTheme } from "./themes";
import type { Session, Preferences } from "./types";
import { Nav } from "./components/Nav";
import { Home } from "./pages/Home";
import { Focus } from "./pages/Focus";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

// ---- Context ----
interface AppCtx {
  preferences: Preferences | null;
  updatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  activeSession: Session | null;
  refreshActive: () => Promise<void>;
}

const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  // Load preferences once
  useEffect(() => {
    api.getPreferences().then(setPreferences).catch(() => {});
  }, []);

  // Apply theme when preferences change
  useEffect(() => {
    if (preferences) applyTheme(preferences.theme);
  }, [preferences?.theme]);

  // Poll active session
  const refreshActive = useCallback(async () => {
    try {
      const s = await api.getActiveSession();
      setActiveSession(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshActive();
    const interval = setInterval(refreshActive, 3000);
    return () => clearInterval(interval);
  }, [refreshActive]);

  const updatePrefs = useCallback(async (patch: Partial<Preferences>) => {
    const updated = await api.updatePreferences(patch);
    setPreferences(updated);
  }, []);

  return (
    <Ctx.Provider value={{ preferences, updatePrefs, activeSession, refreshActive }}>
      <BrowserRouter>
        <div className="app">
          <Nav />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/focus" element={<Focus />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </Ctx.Provider>
  );
}
