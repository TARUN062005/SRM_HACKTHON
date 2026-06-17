import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/hooks/useAuth";
import axios from "axios";
import toast from "react-hot-toast";
import {
  LayoutDashboard, Map, AlertTriangle, Package,
  Settings, LogOut, Bell, User, Loader2,
  Mail, Megaphone, Anchor, ChevronDown, Navigation,
  ChevronLeft, ChevronRight, Shield
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [avatarError, setAvatarError]               = useState(false);

  // Reset avatar image error when the user profileImage changes
  useEffect(() => {
    setAvatarError(false);
  }, [user?.profileImage]);

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

  // Warmup is managed entirely server-side during session init / logins to prevent 403s & cold-starts

  // Active User Heartbeat Tracking using visibility and focus
  useEffect(() => {
    if (!user) return;

    let lastPing = 0;
    let intervalId = null;

    const sendHeartbeat = async () => {
      const now = Date.now();
      // Rate-limit pings to at most once per 90 seconds
      if (now - lastPing < 90000) return;
      
      try {
        await axios.post("/api/user/active-ping", {}, { withCredentials: true });
        lastPing = now;
        console.log("[Heartbeat] Active ping sent to server");
      } catch (err) {
        console.warn("[Heartbeat] Active ping failed:", err.message);
      }
    };

    const handleActivity = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        sendHeartbeat();
        // Start or ensure interval is running
        if (!intervalId) {
          intervalId = setInterval(sendHeartbeat, 2 * 60 * 1000); // 2 minutes
        }
      } else {
        // Tab is hidden or blurred, clear interval
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Initial check and setup listeners
    handleActivity();
    window.addEventListener("visibilitychange", handleActivity);
    window.addEventListener("focus", handleActivity);
    window.addEventListener("blur", handleActivity);

    // Clean up
    return () => {
      window.removeEventListener("visibilitychange", handleActivity);
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("blur", handleActivity);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [user]);

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
            <div className="w-6 h-6 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center flex-shrink-0">
              <img src="/LOGO.png" alt="RouteGuardian Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#00C2FF] leading-none mb-1">
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
            <div className="relative animate-fade-in" ref={profileRef}>
              <button
                onClick={() => setIsProfileOpen(v => !v)}
                className="flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-2xl border border-slate-800/80 bg-slate-950/45 hover:bg-[#101826]/70 hover:border-slate-700/60 shadow-md transition-all cursor-pointer active:scale-95 group relative"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black overflow-hidden shadow-inner border border-slate-800 bg-cyan-500 text-slate-950 group-hover:border-cyan-400 transition-colors relative">
                  {user?.profileImage && !avatarError ? (
                    <img 
                      src={user.profileImage} 
                      alt="profile" 
                      className="w-full h-full object-cover" 
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    user?.name?.charAt(0)?.toUpperCase() || "U"
                  )}
                  {/* Active telemetry indicator dot */}
                  <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-slate-950 shadow-[0_0_8px_#10b981] animate-pulse" />
                </div>
                <span className="text-xs font-bold hidden sm:block text-slate-300 group-hover:text-white transition-colors">
                  {user?.name?.split(" ")[0] || "User"}
                </span>
                <ChevronDown 
                  size={12} 
                  className="text-slate-500 group-hover:text-slate-300 transition-transform duration-300"
                  style={{ transform: isProfileOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute right-0 mt-3 w-64 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.6)] py-4 z-[3100] backdrop-blur-xl border border-white/10 flex flex-col overflow-hidden bg-slate-950/90"
                  >
                    {/* Centered Profile Details and Clearance Badge */}
                    <div className="px-5 pb-4.5 flex flex-col items-center text-center border-b border-white/5">
                      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-cyan-500/25 shadow-[0_0_15px_rgba(0,194,255,0.15)] bg-slate-950 flex items-center justify-center mb-3">
                        {user?.profileImage && !avatarError ? (
                          <img 
                            src={user.profileImage} 
                            alt="profile" 
                            className="w-full h-full object-cover" 
                            onError={() => setAvatarError(true)}
                          />
                        ) : (
                          <span className="text-xl font-black text-cyan-400">
                            {user?.name?.charAt(0)?.toUpperCase() || "U"}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-black text-slate-100 truncate max-w-full leading-tight">{user?.name || "Operative"}</p>
                      <p className="text-[10px] text-slate-500 font-semibold truncate max-w-full mt-0.5 mb-3.5">{user?.email}</p>
                      
                      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[9px] font-black uppercase tracking-[0.15em] select-none shadow-sm">
                        <Shield size={9} className="text-cyan-400" /> {user?.role || 'operator'} Clearance
                      </div>
                    </div>

                    <div className="py-1.5">
                      {[
                        { to: "/profile",  icon: User,     label: "My Profile" },
                        { to: "/settings", icon: Settings, label: "Settings"   },
                      ].map(({ to, icon: Icon, label }) => (
                        <Link key={to} to={to} onClick={() => setIsProfileOpen(false)}
                          className="flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 transition-all hover:text-[#00C2FF] hover:bg-white/5 group/item"
                        >
                          <Icon size={14} className="text-slate-500 group-hover/item:text-[#00C2FF] group-hover/item:translate-x-0.5 transition-all" /> 
                          <span className="group-hover/item:translate-x-0.5 transition-transform">{label}</span>
                        </Link>
                      ))}
                    </div>

                    <div className="border-t border-white/5 mx-4 my-1" />

                    <div className="py-1">
                      <button onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-5 py-3 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-all text-left cursor-pointer group/logout"
                      >
                        <LogOut size={14} className="text-red-400 group-hover/logout:-translate-x-0.5 transition-transform" /> 
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
