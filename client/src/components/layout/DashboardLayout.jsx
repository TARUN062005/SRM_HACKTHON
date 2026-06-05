import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/hooks/useAuth";
import axios from "axios";
import toast from "react-hot-toast";
import {
  LayoutDashboard, Map, AlertTriangle, Package,
  Settings, LogOut, Bell, User, Loader2,
  Mail, Megaphone, Anchor, ChevronDown, Navigation,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const SIDEBAR_W  = 240;
const COLLAPSED_W = 64;
const NAV_H = 64;

const NAV_ITEMS = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard",  exact: true  },
  { to: "/notifications", icon: AlertTriangle, label: "Risk Alerts", exact: true },
  { to: "/shipments",  icon: Package,          label: "Shipments",  exact: true  },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();

  const [collapsed, setCollapsed]                   = useState(false);
  const [isProfileOpen, setIsProfileOpen]           = useState(false);

  const profileRef = useRef(null);

  const sidebarW = collapsed ? COLLAPSED_W : SIDEBAR_W;

  // Click outside profile dropdown
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setIsProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setIsProfileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate("/"); };

  // Pages where main content is full-height (no scroll, map fills space)
  const isFullHeight = location.pathname === "/dashboard";

  const pageTitle =
    location.pathname === "/dashboard"   ? "Mission Control" :
    location.pathname === "/shipments"   ? "Shipments"       :
    location.pathname === "/notifications" ? "Risk Alerts"   :
    location.pathname === "/settings"    ? "Settings"        :
    location.pathname === "/profile"     ? "Profile"         :
    location.pathname.replace("/", "").replaceAll("-", " ");

  const isDashboard = location.pathname === "/dashboard";

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden text-white">

      {/* ══ SIDEBAR ══ */}
      <aside
        className="fixed left-0 top-0 h-screen flex flex-col z-[3000] flex-shrink-0 dashboard-surface-strong rg-sidebar"
        style={{
          width: sidebarW,
          transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Logo — exactly NAV_H tall, clickable to collapse */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center flex-shrink-0 w-full text-left transition-all hover:bg-white/5"
          style={{
            height: NAV_H,
            minHeight: NAV_H,
            padding: collapsed ? "0 14px" : "0 20px",
            borderBottom: "1px solid rgba(148,163,184,0.12)",
            gap: 12,
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <div
            className="flex items-center justify-center flex-shrink-0 rounded-xl"
            style={{
              width: 36, height: 36,
              background: "var(--accent)",
            }}
          >
            <Anchor size={17} style={{ color: "#041019" }} />
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-none whitespace-nowrap text-white">
                Route<span style={{ color: "var(--accent)" }}>Guardian</span>
              </p>
              <p className="text-[9px] uppercase tracking-[0.28em] font-bold mt-0.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                Logistics intelligence
              </p>
            </div>
          )}

          {/* Collapse indicator */}
          {!collapsed && (
            <ChevronLeft size={14} style={{ color: "#4B5563", flexShrink: 0 }} />
          )}
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4" style={{ padding: collapsed ? "16px 8px" : "16px 12px" }}>
          {!collapsed && (
            <p className="text-[9px] font-black uppercase tracking-[0.28em] px-3 mb-3 text-slate-400">
              Navigation
            </p>
          )}
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
              const isActive =
                label === "Dashboard"  && location.pathname === "/dashboard"    ? true :
                label === "Risk Alerts"&& location.pathname === "/notifications" ? true :
                label === "Shipments"  && location.pathname === "/shipments"    ? true :
                false;

              return (
                <Link
                  key={label}
                  to={to}
                  title={collapsed ? label : ""}
                  className={`relative flex items-center justify-between w-full rounded-2xl transition-all group dashboard-nav-item ${isActive ? 'active' : ''}`}
                  style={{
                    padding: collapsed ? "10px 10px" : "10px 12px",
                    justifyContent: collapsed ? "center" : "space-between",
                  }}
                >
                  <div className="flex items-center" style={{ gap: collapsed ? 0 : 12 }}>
                    <Icon size={17} style={{ flexShrink: 0 }} />
                    {!collapsed && <span className="text-sm font-semibold whitespace-nowrap">{label}</span>}
                  </div>
                  {!collapsed && isActive && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom: Settings + Sign Out */}
        <div style={{ padding: collapsed ? "8px" : "12px", borderTop: "1px solid rgba(148,163,184,0.12)" }} className="space-y-0.5">
          <Link
            to="/settings"
            title={collapsed ? "Settings" : ""}
            style={{
              padding: collapsed ? "10px 10px" : "10px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 12,
            }}
            className={`flex items-center w-full rounded-2xl transition-all text-sm font-semibold dashboard-nav-item ${location.pathname === "/settings" ? 'active' : ''}`}
          >
            <Settings size={17} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Settings</span>}
          </Link>

          <button
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : ""}
            className="flex items-center w-full rounded-2xl transition-all text-sm font-semibold rg-btn-danger"
            style={{
              padding: collapsed ? "10px 10px" : "10px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 12,
            }}
          >
            <LogOut size={17} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ══ CONTENT WRAPPER ══ */}
      <div
        className="flex flex-col h-screen flex-1"
        style={{
          marginLeft: sidebarW,
          transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* ── NAVBAR ── */}
        <header
          className="flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-[2900] dashboard-surface-strong"
          style={{
            height: NAV_H,
            minHeight: NAV_H,
            borderBottom: "1px solid rgba(148,163,184,0.12)",
          }}
        >
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.6)]" style={{ background: "#22C55E" }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
                RouteGuardian
              </p>
              <p className="text-sm font-bold capitalize leading-none text-white">
                {pageTitle}
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {isDashboard && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("toggleNewRoute"))}
                className="rg-btn-primary flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Navigation size={14} /> New Route
              </button>
            )}

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setIsProfileOpen(v => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all"
                style={{ color: "#9CA3AF" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#F9FAFB"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black overflow-hidden" style={{ background: "var(--accent)", color: "#020713" }}>
                  {user?.profileImage
                    ? <img src={user.profileImage} alt="profile" className="w-full h-full object-cover" />
                    : user?.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <span className="text-sm font-semibold hidden sm:block" style={{ color: "#F9FAFB" }}>
                  {user?.name?.split(" ")[0] || "User"}
                </span>
                <ChevronDown size={13} />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl py-2 z-[3100]" style={{ background: "rgba(15,23,42,0.92)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6B7280" }}>Account</p>
                    <p className="text-sm font-bold truncate mt-0.5" style={{ color: "#F9FAFB" }}>{user?.name}</p>
                    <p className="text-xs truncate" style={{ color: "#6B7280" }}>{user?.email}</p>
                  </div>

                  {[
                    { to: "/profile",  icon: User,     label: "My Profile" },
                    { to: "/settings", icon: Settings, label: "Settings"   },
                  ].map(({ to, icon: Icon, label }) => (
                    <Link key={to} to={to} onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-all"
                      style={{ color: "#9CA3AF" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#F9FAFB"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}>
                      <Icon size={15} /> {label}
                    </Link>
                  ))}

                  <div className="my-1.5 mx-3 rg-divider" style={{ height: 1 }} />

                  <button onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-semibold transition-all"
                    style={{ color: "#EF4444" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT ── */}
        <main
          className={`flex-1 ${isFullHeight ? "overflow-hidden" : "overflow-y-auto"}`}
          style={{ background: "#0B1220" }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
