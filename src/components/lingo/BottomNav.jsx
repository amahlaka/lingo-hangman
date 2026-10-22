import React from "react";
import { NavLink } from "react-router-dom";
import { BookOpen, ChartNoAxesColumn, Gem, House, Play } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";

// Tab bar at the bottom of Home and the other top-level screens (Lessons,
// Shop, Profile). Play in the middle starts Quick play. Game screens leave it
// out so it never covers a game's own tray.
export default function BottomNav() {
  const { t } = useSettings();
  const n = t.nav;
  const tabs = [
    { to: "/", label: n.home, Icon: House, end: true },
    { to: "/lessons", label: n.lessons, Icon: BookOpen },
    { to: "/quick", label: n.play, name: n.playName, Icon: Play, play: true },
    { to: "/shop", label: n.shop, Icon: Gem },
    { to: "/profile", label: n.profile, Icon: ChartNoAxesColumn },
  ];
  return (
    <nav className="lg-bottom-nav" aria-label={n.label}>
      {tabs.map(({ to, label, name, Icon, end, play }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={name}
          className={({ isActive }) => `lg-bottom-nav__tab${play ? " lg-bottom-nav__tab--play" : ""}${isActive ? " is-active" : ""}`}
        >
          <span className="lg-bottom-nav__icon" aria-hidden="true">
            <Icon size={22} strokeWidth={2} />
          </span>
          <span className="lg-bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
