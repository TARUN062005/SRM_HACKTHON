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
  { to: "/routes-map", icon: Map,             label: "Routes Map", exact: true  },
  { to: "/notifications", icon: AlertTriangle, label: "Risk Alerts", exact: true, badge: true },
  { to: "/shipments",  icon: Package,          label: "Shipments",  exact: true  },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const BASE_URL  = import.meta.env.VITE_BACKEND_URL || "";

  const [collapsed, setCollapsed]                   = useState(false);
  const [isProfileOpen, setIsProfileOpen]           = useState(false);
  const [showBell, setShowBell]                     = useState(false);
  const [unreadCount, setUnreadCount]               = useState(0);
  const [notifLoading, setNotifLoading]             = useState(false);
  const [recentNotifs, setRecentNotifs]             = useState([]);

  const profileRef = useRef(null);
  const bellRef    = useRef(null);

  const sidebarW = collapsed ? COLLAPSED_W : SIDEBAR_W;

  // ── Notifications ────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      setNotifLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await axios.get(`${BASE_URL}/api/user/notifications?mode=unreadCount`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setUnreadCount(res.data?.unreadCount || 0);
    } catch (err) {
      console.error("Unread count fetch failed:", err.message);
    } finally {
      setNotifLoading(false);
    }
  }, [BASE_URL]);

  const fetchRecentNotifs = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await axios.get(`${BASE_URL}/api/user/notifications?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setRecentNotifs(res.data.notifications || []);
    } catch (err) {
      console.error("Failed to fetch recent notifications:", err.message);
    }
  }, [BASE_URL]);

  const markRead = useCallback(async (id) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await axios.patch(`${BASE_URL}/api/user/notifications/${id}/read`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setRecentNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, [BASE_URL]);

  const markAllRead = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await axios.patch(`${BASE_URL}/api/user/notifications/read-all`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.success) {
        toast.success("All notifications marked as read");
        setRecentNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        setShowBell(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark all as read");
    }
  }, [BASE_URL]);

  // Click outside
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setIsProfileOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setIsProfileOpen(false);
    setShowBell(false);
  }, [location.pathname]);

  useEffect(() => {
    fetchUnreadCount();
    fetchRecentNotifs();
    const t = setInterval(() => {
      fetchUnreadCount();
      if (showBell) fetchRecentNotifs();
    }, 30000);
    return () => clearInterval(t);
  }, [fetchUnreadCount, fetchRecentNotifs, showBell]);

  const handleLogout = () => { logout(); navigate("/"); };

  const getNotifIcon = (type) => {
    switch (type) {
      case "SECURITY":     return <AlertTriangle className="text-red-400"    size={14} />;
      case "ANNOUNCEMENT": return <Megaphone     className="text-indigo-400" size={14} />;
      case "MARKETING":    return <Mail          className="text-emerald-400" size={14} />;
      default:             return <Bell          className="text-blue-400"   size={14} />;
    }
  };

  const fmtTime = (ds) => {
    const d = new Date(ds), now = new Date();
    const m = Math.floor((now - d) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const day = Math.floor(h / 24);
    if (day < 7) return `${day}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Pages where main content is full-height (no scroll, map fills space)
  const isFullHeight = ["/dashboard", "/routes-map"].includes(location.pathname);

  const pageTitle =
    location.pathname === "/dashboard"   ? "Mission Control" :
    location.pathname === "/routes-map"  ? "Routes Map"      :
    location.pathname === "/shipments"   ? "Shipments"       :
    location.pathname === "/notifications" ? "Risk Alerts"   :
    location.pathname === "/settings"    ? "Settings"        :
    location.pathname === "/profile"     ? "Profile"         :
    location.pathname.replace("/", "").replaceAll("-", " ");

  const isDashboard = location.pathname === "/dashboard";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0B1220" }}>

      {/* ══ SIDEBAR ══ */}
      <aside
        className="fixed left-0 top-0 h-screen flex flex-col z-30 flex-shrink-0"
        style={{
          width: sidebarW,
          background: "#111827",
          borderRight: "1px solid #374151",
          transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Logo — exactly NAV_H tall, clickable to collapse */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center flex-shrink-0 w-full text-left transition-all"
          style={{
            height: NAV_H,
            minHeight: NAV_H,
            padding: collapsed ? "0 14px" : "0 20px",
            borderBottom: "1px solid #374151",
            gap: 12,
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: "#3B82F6",
              boxShadow: "0 0 16px rgba(59,130,246,0.35)",
              borderRadius: 10,
            }}
          >
            <Anchor size={17} className="text-white" />
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-none whitespace-nowrap" style={{ color: "#F9FAFB" }}>
                Route<span style={{ color: "#3B82F6" }}>Guardian</span>
              </p>
              <p className="text-[9px] uppercase tracking-widest font-bold mt-0.5 whitespace-nowrap" style={{ color: "#6B7280" }}>
                Logistics AI
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
            <p className="text-[9px] font-black uppercase tracking-widest px-3 mb-3" style={{ color: "#6B7280" }}>
              Navigation
            </p>
          )}
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ to, icon: Icon, label, badge }) => {
              const isActive =
                label === "Dashboard"  && location.pathname === "/dashboard"    ? true :
                label === "Routes Map" && location.pathname === "/routes-map"   ? true :
                label === "Risk Alerts"&& location.pathname === "/notifications" ? true :
                label === "Shipments"  && location.pathname === "/shipments"    ? true :
                false;

              return (
                <Link
                  key={label}
                  to={to}
                  title={collapsed ? label : ""}
                  className="flex items-center justify-between w-full rounded-xl transition-all group"
                  style={{
                    padding: collapsed ? "10px 10px" : "10px 12px",
                    background: isActive ? "rgba(59,130,246,0.15)" : "transparent",
                    color: isActive ? "#3B82F6" : "#9CA3AF",
                    justifyContent: collapsed ? "center" : "space-between",
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#F9FAFB"; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; } }}
                >
                  <div className="flex items-center" style={{ gap: collapsed ? 0 : 12 }}>
                    <Icon size={17} style={{ flexShrink: 0 }} />
                    {!collapsed && <span className="text-sm font-semibold whitespace-nowrap">{label}</span>}
                  </div>
                  {!collapsed && badge && unreadCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "#EF4444", color: "#fff" }}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  {collapsed && badge && unreadCount > 0 && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
                  )}
                  {!collapsed && isActive && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#3B82F6" }} />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom: Settings + Sign Out */}
        <div style={{ padding: collapsed ? "8px" : "12px", borderTop: "1px solid #374151" }} className="space-y-0.5">
          <Link
            to="/settings"
            title={collapsed ? "Settings" : ""}
            className="flex items-center w-full rounded-xl transition-all text-sm font-semibold"
            style={{
              padding: collapsed ? "10px 10px" : "10px 12px",
              color: location.pathname === "/settings" ? "#3B82F6" : "#9CA3AF",
              background: location.pathname === "/settings" ? "rgba(59,130,246,0.15)" : "transparent",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 12,
            }}
            onMouseEnter={e => { if (location.pathname !== "/settings") { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#F9FAFB"; } }}
            onMouseLeave={e => { if (location.pathname !== "/settings") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; } }}
          >
            <Settings size={17} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Settings</span>}
          </Link>

          <button
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : ""}
            className="flex items-center w-full rounded-xl transition-all text-sm font-semibold"
            style={{
              padding: collapsed ? "10px 10px" : "10px 12px",
              color: "#9CA3AF",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 12,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#EF4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
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
          className="flex items-center justify-between px-6 flex-shrink-0 z-20"
          style={{
            height: NAV_H,
            minHeight: NAV_H,
            background: "#111827",
            borderBottom: "1px solid #374151",
          }}
        >
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#22C55E" }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6B7280" }}>
                RouteGuardian
              </p>
              <p className="text-sm font-bold capitalize leading-none" style={{ color: "#F9FAFB" }}>
                {pageTitle}
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {isDashboard && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("toggleNewRoute"))}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: "#3B82F6", color: "#fff" }}
                onMouseEnter={e => e.currentTarget.style.background = "#2563EB"}
                onMouseLeave={e => e.currentTarget.style.background = "#3B82F6"}
              >
                <Navigation size={14} /> New Route
              </button>
            )}

            {/* Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => { setShowBell(v => !v); if (!showBell) fetchRecentNotifs(); }}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={{ color: "#9CA3AF" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#F9FAFB"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
              >
                {notifLoading
                  ? <Loader2 className="animate-spin" size={18} />
                  : <Bell size={18} />}
                {unreadCount > 0 && (
                  <span
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
                    style={{ background: "#EF4444", borderColor: "#111827" }}
                  />
                )}
              </button>

              {showBell && (
                <div
                  className="absolute right-0 mt-2 w-80 rounded-2xl shadow-2xl py-2 z-50 flex flex-col overflow-hidden"
                  style={{ background: "#1F2937", border: "1px solid #374151", maxHeight: "70vh" }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid #374151" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6B7280" }}>Notifications</p>
                        <p className="text-sm font-bold" style={{ color: "#F9FAFB" }}>{unreadCount} unread</p>
                      </div>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                          style={{ background: "#374151", color: "#9CA3AF" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#F9FAFB"}
                          onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}>
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto py-1">
                    {recentNotifs.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell size={28} style={{ color: "#374151" }} className="mx-auto" />
                        <p className="text-sm font-bold mt-2" style={{ color: "#6B7280" }}>No notifications yet</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5 px-2">
                        {recentNotifs.map(n => (
                          <div key={n.id}
                            onClick={() => { if (!n.isRead) markRead(n.id); navigate("/notifications"); setShowBell(false); }}
                            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
                            style={{ background: !n.isRead ? "rgba(59,130,246,0.08)" : "transparent" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                            onMouseLeave={e => e.currentTarget.style.background = !n.isRead ? "rgba(59,130,246,0.08)" : "transparent"}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#374151" }}>
                              {getNotifIcon(n.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold line-clamp-1" style={{ color: "#F9FAFB" }}>{n.title}</p>
                              <p className="text-xs line-clamp-1 mt-0.5" style={{ color: "#6B7280" }}>{n.message}</p>
                              <p className="text-[10px] mt-1" style={{ color: "#6B7280" }}>{fmtTime(n.createdAt)}</p>
                            </div>
                            {!n.isRead && <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#3B82F6" }} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="px-3 pt-2 pb-1" style={{ borderTop: "1px solid #374151" }}>
                    <Link to="/notifications" onClick={() => setShowBell(false)}
                      className="flex items-center justify-center w-full py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ color: "#3B82F6" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      View all alerts
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6" style={{ background: "#374151" }} />

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setIsProfileOpen(v => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all"
                style={{ color: "#9CA3AF" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#F9FAFB"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black overflow-hidden" style={{ background: "#3B82F6", color: "#fff" }}>
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
                <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl py-2 z-50" style={{ background: "#1F2937", border: "1px solid #374151" }}>
                  <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #374151" }}>
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

                  <div className="my-1.5 mx-3" style={{ height: 1, background: "#374151" }} />

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
