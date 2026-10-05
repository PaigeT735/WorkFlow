import { useEffect, useRef, useState } from "react";

interface FocusOrbProps {
  /** Pre-session: show "Focus" label, clickable */
  idle?: boolean;
  /** Active session: show timer inside orb */
  timer?: string;
  /** Paused state */
  paused?: boolean;
  /** Progress 0-1 for the ring (planned duration sessions) */
  progress?: number | null;
  /** Show completion flash */
  completing?: boolean;
  /** Size variant */
  size?: "small" | "normal" | "large";
  /** Enable breathing animations */
  animated?: boolean;
  /** Click handler (idle mode) */
  onClick?: () => void;
  /** Show sparkle particles */
  sparkles?: boolean;
}

export function FocusOrb({
  idle = false,
  timer,
  paused = false,
  progress = null,
  completing = false,
  size = "normal",
  animated = true,
  onClick,
  sparkles = false,
}: FocusOrbProps) {
  const showRing = progress !== null && progress >= 0;
  const ringRadius = 50;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = showRing
    ? ringCircumference * (1 - Math.min(Math.max(progress!, 0), 1))
    : ringCircumference;

  return (
    <div
      className={`orb-container ${size} ${!animated ? "no-anim" : ""} ${idle ? "clickable" : ""} ${paused ? "paused" : ""} ${completing ? "completing" : ""}`}
      onClick={idle ? onClick : undefined}
    >
      {/* Ambient glow */}
      <div className="orb-ambient" />

      {/* Progress ring */}
      {showRing && (
        <svg className="orb-ring-svg" viewBox="0 0 112 112">
          <circle
            className="orb-ring-track"
            cx="56"
            cy="56"
            r={ringRadius}
          />
          <circle
            className="orb-ring-progress"
            cx="56"
            cy="56"
            r={ringRadius}
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringOffset}
          />
        </svg>
      )}

      {/* The orb body */}
      <div className="orb">
        <div className="orb-highlight" />
        <div className="orb-reflection" />
      </div>

      {/* Content overlay */}
      <div className="orb-content">
        {idle && (
          <>
            <span className="orb-icon">✦</span>
            <span className="orb-label">Focus</span>
          </>
        )}
        {timer && !paused && (
          <span className={`orb-timer ${progress === null ? "open" : ""}`}>{timer}</span>
        )}
        {timer && paused && (
          <>
            <span className={`orb-timer ${progress === null ? "open" : ""}`}>{timer}</span>
            <span className="orb-paused-label">Paused</span>
          </>
        )}
      </div>

      {/* Sparkle particles */}
      {sparkles && animated && (
        <>
          <span className="orb-sparkle" style={{ top: "15%", right: "20%", fontSize: "0.8rem", animationDelay: "0s" }}>✦</span>
          <span className="orb-sparkle" style={{ bottom: "20%", left: "18%", fontSize: "0.6rem", animationDelay: "1.2s" }}>✦</span>
        </>
      )}
    </div>
  );
}
