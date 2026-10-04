import { useTheme } from "../state/theme.ts";
import { MoonIcon, SunIcon } from "./icons.tsx";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${className}`}
      onClick={toggle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
    >
      {theme === "light" ? <MoonIcon size={15} /> : <SunIcon size={15} />}
    </button>
  );
}
