import { useApp } from "../App";
import { THEMES } from "../themes";
import type { Preferences } from "../types";

const DURATIONS = [
  { label: "25m", ms: 25 * 60_000 },
  { label: "45m", ms: 45 * 60_000 },
  { label: "60m", ms: 60 * 60_000 },
  { label: "90m", ms: 90 * 60_000 },
];

const SUBJECTS = ["Finance", "Economics", "Statistics", "Spanish", "Operations", "Business", "Other"];

export function Settings() {
  const { preferences, updatePrefs } = useApp();
  if (!preferences) return null;
  const p = preferences;

  return (
    <div className="page">
      <div className="history-header">
        <div className="history-title">Settings</div>
        <div className="history-subtitle">Make it yours ✦</div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Theme</div>
        <div className="theme-grid">
          {THEMES.map((t) => {
            const bg = t.vars["--bg"];
            const accent = t.vars["--accent"];
            const surface = t.vars["--surface-solid"];
            return (
              <div
                key={t.id}
                className={`theme-card ${p.theme === t.id ? "selected" : ""}`}
                onClick={() => updatePrefs({ theme: t.id })}
              >
                <div
                  className="theme-preview"
                  style={{ background: `linear-gradient(135deg, ${bg} 0%, ${surface} 40%, ${accent} 100%)` }}
                />
                <div className="theme-name">{t.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Time format</div>
        <div className="chip-row">
          <button
            className={`chip ${p.timeFormat === "12h" ? "selected" : ""}`}
            onClick={() => updatePrefs({ timeFormat: "12h" })}
          >12 hour</button>
          <button
            className={`chip ${p.timeFormat === "24h" ? "selected" : ""}`}
            onClick={() => updatePrefs({ timeFormat: "24h" })}
          >24 hour</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Default focus duration</div>
        <div className="chip-row">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              className={`chip ${p.defaultDuration === d.ms ? "selected" : ""}`}
              onClick={() => updatePrefs({ defaultDuration: d.ms })}
            >{d.label}</button>
          ))}
          <button
            className={`chip ${p.defaultDuration === null ? "selected" : ""}`}
            onClick={() => updatePrefs({ defaultDuration: null })}
          >Open</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Default subject</div>
        <div className="chip-row">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              className={`chip ${p.defaultSubject === s ? "selected" : ""}`}
              onClick={() => updatePrefs({ defaultSubject: s })}
            >{s}</button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Animations</div>
        <div className="settings-row">
          <span className="settings-label">Show animations</span>
          <button
            className={`toggle ${p.animationsEnabled ? "on" : ""}`}
            onClick={() => updatePrefs({ animationsEnabled: !p.animationsEnabled })}
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Sound</div>
        <div className="settings-row">
          <span className="settings-label">Enable sound</span>
          <button
            className={`toggle ${p.soundEnabled ? "on" : ""}`}
            onClick={() => updatePrefs({ soundEnabled: !p.soundEnabled })}
          />
        </div>
      </div>
    </div>
  );
}
