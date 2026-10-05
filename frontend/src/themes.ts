export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: "lavender-night",
    name: "Lavender Night",
    vars: {
      "--bg": "#1a1b3a",
      "--bg-grad": "#252659",
      "--surface": "#23254e",
      "--surface-2": "#2d2f5e",
      "--surface-border": "#3a3c6e",
      "--text": "#ece8f8",
      "--text-muted": "#a8a4c8",
      "--text-subtle": "#7c7aa0",
      "--accent": "#b8a4f0",
      "--accent-soft": "#b8a4f033",
      "--accent-hover": "#c9b8ff",
      "--star": "#d4c5ff",
      "--star-glow": "#b8a4f0",
      "--raccoon-mask": "#4a4570",
      "--raccoon-fur": "#9b96b8",
      "--raccoon-light": "#c4c0d8",
      "--desk": "#5a4a7a",
    },
  },
  {
    id: "cozy-cafe",
    name: "Cozy Café",
    vars: {
      "--bg": "#f5ede0",
      "--bg-grad": "#efe4d2",
      "--surface": "#fbf6ee",
      "--surface-2": "#f0e6d6",
      "--surface-border": "#e0d4c0",
      "--text": "#4a3826",
      "--text-muted": "#8a7460",
      "--text-subtle": "#b09a82",
      "--accent": "#a8743f",
      "--accent-soft": "#a8743f22",
      "--accent-hover": "#c4854a",
      "--star": "#c49a6a",
      "--star-glow": "#d4a87a",
      "--raccoon-mask": "#6b5238",
      "--raccoon-fur": "#9a8270",
      "--raccoon-light": "#c4b0a0",
      "--desk": "#8b6a48",
    },
  },
  {
    id: "cloudy-morning",
    name: "Cloudy Morning",
    vars: {
      "--bg": "#e8eef4",
      "--bg-grad": "#dde7f0",
      "--surface": "#f4f8fc",
      "--surface-2": "#e8eef4",
      "--surface-border": "#d0dae4",
      "--text": "#3a4858",
      "--text-muted": "#7888a0",
      "--text-subtle": "#a0b0c0",
      "--accent": "#6a8eb8",
      "--accent-soft": "#6a8eb822",
      "--accent-hover": "#7aa0cc",
      "--star": "#8ab0d0",
      "--star-glow": "#a0c4e0",
      "--raccoon-mask": "#5a6a80",
      "--raccoon-fur": "#90a0b0",
      "--raccoon-light": "#c0d0dc",
      "--desk": "#7a8a9c",
    },
  },
  {
    id: "strawberry-milk",
    name: "Strawberry Milk",
    vars: {
      "--bg": "#fce8ec",
      "--bg-grad": "#f8dde4",
      "--surface": "#fef2f4",
      "--surface-2": "#fce8ec",
      "--surface-border": "#f0d0d8",
      "--text": "#5a3848",
      "--text-muted": "#9a7080",
      "--text-subtle": "#c0a0ac",
      "--accent": "#d47090",
      "--accent-soft": "#d4709022",
      "--accent-hover": "#e080a0",
      "--star": "#e098b0",
      "--star-glow": "#f0b0c8",
      "--raccoon-mask": "#7a5060",
      "--raccoon-fur": "#a88898",
      "--raccoon-light": "#d0b8c4",
      "--desk": "#b0708a",
    },
  },
  {
    id: "forest-desk",
    name: "Forest Desk",
    vars: {
      "--bg": "#e8efe6",
      "--bg-grad": "#dde8da",
      "--surface": "#f4f8f2",
      "--surface-2": "#e8efe6",
      "--surface-border": "#c8d8c4",
      "--text": "#3a4a38",
      "--text-muted": "#6a8068",
      "--text-subtle": "#98b094",
      "--accent": "#5a8a4a",
      "--accent-soft": "#5a8a4a22",
      "--accent-hover": "#6aa05a",
      "--star": "#7ab068",
      "--star-glow": "#9ac888",
      "--raccoon-mask": "#4a5e48",
      "--raccoon-fur": "#889880",
      "--raccoon-light": "#c0d0b8",
      "--desk": "#6a8060",
    },
  },
];

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", themeId);
}
