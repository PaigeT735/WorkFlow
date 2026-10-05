import type { RaccoonState } from "../types";

interface Props {
  state: RaccoonState;
  size?: "normal" | "large";
  animated?: boolean;
}

export function Raccoon({ state, size = "normal", animated = true }: Props) {
  const showSparkles = state === "sparkly" || state === "celebrating";
  const showDesk = state === "focused" || state === "happy" || state === "sparkly";
  const showCoffee = state === "sparkly";
  const celebrating = state === "celebrating";

  return (
    <div className={`raccoon-container ${size} ${!animated ? "no-anim" : ""}`}>
      <svg className={`raccoon-svg ${celebrating ? "raccoon-celebrate" : ""}`} viewBox="0 0 240 240">
        {/* Sparkles (behind) */}
        {showSparkles && (
          <g className={animated ? "sparkle-anim" : ""} style={{ transformOrigin: "center" }}>
            <Sparkle x={40} y={50} delay={0} />
            <Sparkle x={200} y={55} delay={0.5} />
            <Sparkle x={30} y={130} delay={1} />
            <Sparkle x={210} y={140} delay={1.5} />
            <Sparkle x={120} y={25} delay={0.8} />
          </g>
        )}

        {/* Tail */}
        <path
          d="M168,175 Q215,155 205,110 Q198,88 182,95 Q188,130 162,158"
          fill="var(--raccoon-fur)"
          stroke="var(--raccoon-mask)"
          strokeWidth="1.5"
        />
        <path d="M196,118 Q188,116 186,124" stroke="var(--raccoon-mask)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M200,135 Q190,133 188,142" stroke="var(--raccoon-mask)" strokeWidth="5" fill="none" strokeLinecap="round" />

        {/* Body */}
        <ellipse cx="120" cy="182" rx="52" ry="46" fill="var(--raccoon-fur)" />
        <ellipse cx="120" cy="190" rx="34" ry="28" fill="var(--raccoon-light)" opacity="0.6" />

        {/* Arms */}
        {celebrating ? (
          <>
            <ellipse cx="74" cy="148" rx="13" ry="20" fill="var(--raccoon-fur)" transform="rotate(-25 74 148)" />
            <ellipse cx="166" cy="148" rx="13" ry="20" fill="var(--raccoon-fur)" transform="rotate(25 166 148)" />
            {/* Paws up */}
            <circle cx="62" cy="128" r="11" fill="var(--raccoon-light)" />
            <circle cx="178" cy="128" r="11" fill="var(--raccoon-light)" />
          </>
        ) : (
          <>
            <ellipse cx="76" cy="178" rx="13" ry="22" fill="var(--raccoon-fur)" />
            <ellipse cx="164" cy="178" rx="13" ry="22" fill="var(--raccoon-fur)" />
            <circle cx="76" cy="196" r="10" fill="var(--raccoon-light)" />
            <circle cx="164" cy="196" r="10" fill="var(--raccoon-light)" />
          </>
        )}

        {/* Ears (outer) */}
        <path d="M72,78 C58,48 66,28 86,40 C95,46 96,56 92,64 Z" fill="var(--raccoon-fur)" />
        <path d="M168,78 C182,48 174,28 154,40 C145,46 144,56 148,64 Z" fill="var(--raccoon-fur)" />
        {/* Inner ears */}
        <path d="M78,72 C72,54 76,42 86,48 C91,53 91,58 88,62 Z" fill="var(--raccoon-mask)" />
        <path d="M162,72 C168,54 164,42 154,48 C149,53 149,58 152,62 Z" fill="var(--raccoon-mask)" />

        {/* Head */}
        <circle cx="120" cy="108" r="60" fill="var(--raccoon-fur)" />

        {/* Forehead cream marking */}
        <path d="M98,72 Q120,64 142,72 Q142,80 120,78 Q98,80 98,72" fill="var(--raccoon-light)" opacity="0.5" />

        {/* Face mask */}
        <ellipse cx="96" cy="106" rx="25" ry="19" fill="var(--raccoon-mask)" />
        <ellipse cx="144" cy="106" rx="25" ry="19" fill="var(--raccoon-mask)" />
        <ellipse cx="120" cy="104" rx="16" ry="11" fill="var(--raccoon-mask)" />

        {/* Snout */}
        <ellipse cx="120" cy="130" rx="24" ry="19" fill="var(--raccoon-light)" opacity="0.7" />

        {/* Eyes */}
        {state === "sleepy" ? (
          <>
            <path d="M88,106 Q96,112 104,106" stroke="#1a1a2e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M136,106 Q144,112 152,106" stroke="#1a1a2e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : state === "happy" || state === "celebrating" ? (
          <>
            <path d="M88,106 Q96,100 104,106" stroke="#1a1a2e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M136,106 Q144,100 152,106" stroke="#1a1a2e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <g className={animated ? "raccoon-eyes" : ""}>
              <circle cx="96" cy="106" r="8" fill="#1a1a2e" />
              <circle cx="144" cy="106" r="8" fill="#1a1a2e" />
              <circle cx="99" cy="103" r="2.5" fill="white" />
              <circle cx="147" cy="103" r="2.5" fill="white" />
            </g>
          </>
        )}

        {/* Nose */}
        <ellipse cx="120" cy="124" rx="6" ry="4.5" fill="#1a1a2e" />

        {/* Mouth */}
        {state === "sleepy" ? (
          <path d="M116,134 Q120,137 124,134" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : state === "celebrating" ? (
          <path d="M110,134 Q120,146 130,134" stroke="#1a1a2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        ) : state === "happy" || state === "sparkly" ? (
          <path d="M113,134 Q120,140 127,134" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M115,134 Q120,138 125,134" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}

        {/* Cheek blush (happy states) */}
        {(state === "happy" || state === "sparkly" || state === "celebrating") && (
          <>
            <circle cx="82" cy="122" r="6" fill="var(--accent)" opacity="0.3" />
            <circle cx="158" cy="122" r="6" fill="var(--accent)" opacity="0.3" />
          </>
        )}

        {/* Sleep Z */}
        {state === "sleepy" && (
          <text x="165" y="60" fontSize="20" fill="var(--text-muted)" fontWeight="700" className={animated ? "float-anim" : ""}>z</text>
        )}

        {/* Desk + book (focused states) */}
        {showDesk && !celebrating && (
          <>
            {/* Desk */}
            <rect x="55" y="205" width="130" height="10" rx="3" fill="var(--desk)" />
            <rect x="62" y="215" width="6" height="18" rx="2" fill="var(--desk)" />
            <rect x="172" y="215" width="6" height="18" rx="2" fill="var(--desk)" />
            {/* Book */}
            <rect x="92" y="196" width="56" height="12" rx="2" fill="var(--accent)" opacity="0.9" />
            <line x1="120" y1="197" x2="120" y2="207" stroke="var(--bg)" strokeWidth="1.5" />
            <line x1="98" y1="200" x2="116" y2="200" stroke="var(--bg)" strokeWidth="0.8" opacity="0.5" />
            <line x1="124" y1="200" x2="142" y2="200" stroke="var(--bg)" strokeWidth="0.8" opacity="0.5" />
            <line x1="98" y1="203" x2="116" y2="203" stroke="var(--bg)" strokeWidth="0.8" opacity="0.5" />
            <line x1="124" y1="203" x2="142" y2="203" stroke="var(--bg)" strokeWidth="0.8" opacity="0.5" />
          </>
        )}

        {/* Coffee cup (sparkly state) */}
        {showCoffee && !celebrating && (
          <>
            <rect x="175" y="188" width="16" height="16" rx="2" fill="var(--desk)" />
            <path d="M191,191 Q197,191 197,196 Q197,201 191,201" stroke="var(--desk)" strokeWidth="2" fill="none" />
            <path d="M180,184 Q182,180 180,176 M185,184 Q187,180 185,176" stroke="var(--text-muted)" strokeWidth="1.5" fill="none" opacity="0.5" className={animated ? "float-anim" : ""} />
          </>
        )}

        {/* Celebration stars */}
        {celebrating && (
          <>
            <text x="45" y="70" fontSize="18" className={animated ? "sparkle-anim" : ""} style={{ animationDelay: "0s" }}>✦</text>
            <text x="195" y="75" fontSize="16" className={animated ? "sparkle-anim" : ""} style={{ animationDelay: "0.3s" }}>✦</text>
            <text x="25" y="140" fontSize="14" className={animated ? "sparkle-anim" : ""} style={{ animationDelay: "0.6s" }}>✦</text>
            <text x="210" y="145" fontSize="16" className={animated ? "sparkle-anim" : ""} style={{ animationDelay: "0.9s" }}>✦</text>
            <text x="120" y="35" fontSize="20" className={animated ? "sparkle-anim" : ""} style={{ animationDelay: "0.4s" }}>✦</text>
          </>
        )}
      </svg>
    </div>
  );
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <text
      x={x}
      y={y}
      fontSize="14"
      fill="var(--star)"
      style={{ animationDelay: `${delay}s` }}
    >
      ✦
    </text>
  );
}
