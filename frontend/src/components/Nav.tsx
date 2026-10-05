import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Focus", icon: "✦" },
  { to: "/history", label: "Progress", icon: "◷" },
  { to: "/settings", label: "Settings", icon: "◌" },
];

export function Nav() {
  return (
    <>
      <nav className="nav">
        <div className="nav-brand">
          Focus <span className="sparkle">✦</span>
        </div>
        <div className="nav-links">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              end={l.to === "/"}
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <nav className="nav-bottom">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `nav-bottom-item ${isActive ? "active" : ""}`}
            end={l.to === "/"}
          >
            <span className="nav-icon">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
