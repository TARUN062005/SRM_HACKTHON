import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Loader2, ShieldAlert, Megaphone, CheckCircle,
  AlertTriangle, Mail, ExternalLink, Clock, X, Filter,
  AlertCircle, RefreshCw,
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "";

const TYPE_CONFIG = {
  SECURITY:     { icon: ShieldAlert,  color: "#EF4444", bg: "rgba(239,68,68,0.12)",    label: "Security"     },
  ANNOUNCEMENT: { icon: Megaphone,    color: "#A78BFA", bg: "rgba(167,139,250,0.12)",  label: "Announcement" },
  MARKETING:    { icon: Mail,         color: "#22C55E", bg: "rgba(34,197,94,0.12)",    label: "Marketing"    },
  SYSTEM:       { icon: Bell,         color: "#38BDF8", bg: "rgba(56,189,248,0.12)",   label: "System"       },
};

const PRIORITY_CONFIG = {
  URGENT: { color: "#EF4444", bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.35)"   },
  HIGH:   { color: "#F59E0B", bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.35)"  },
  NORMAL: { color: "#38BDF8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.25)"  },
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const NotificationsPage = () => {
  const [loading, setLoading]         = useState(true);
  const [markingRead, setMarkingRead] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [openNotif, setOpenNotif]     = useState(null);
  const [stats, setStats]             = useState({ total: 0, unread: 0, read: 0 });
  const [filters, setFilters]         = useState({ type: "all", priority: "all" });

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.type !== "all") params.append("type", filters.type);
      if (filters.priority !== "all") params.append("priority", filters.priority);
      const res = await axios.get(`${BASE_URL}/api/user/notifications?${params}`, { withCredentials: true });
      if (res.data?.success) {
        const list = res.data.notifications || [];
        setNotifications(list);
        setStats({
          total: res.data.total || list.length,
          unread: list.filter(n => !n.isRead).length,
          read: list.filter(n => n.isRead).length,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      setMarkingRead(true);
      await axios.patch(`${BASE_URL}/api/user/notifications/read-all`, {}, { withCredentials: true });
      toast.success("All marked as read");
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setStats(prev => ({ ...prev, unread: 0, read: prev.total }));
    } catch {
      toast.error("Failed to mark all as read");
    } finally {
      setMarkingRead(false);
    }
  };

  const markOneRead = async (id) => {
    try {
      await axios.patch(`${BASE_URL}/api/user/notifications/${id}/read`, {}, { withCredentials: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1), read: prev.read + 1 }));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  useEffect(() => { fetchNotifications(); }, [filters]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#3B82F6" }}>
            Inbox
          </p>
          <h1 className="text-2xl font-black" style={{ color: "#F9FAFB" }}>Risk Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Real-time security, route, and supply chain notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchNotifications}
            className="p-2 rounded-xl transition-all"
            style={{ color: "#6B7280", background: "#1F2937", border: "1px solid #374151" }}
            onMouseEnter={e => e.currentTarget.style.color = "#F9FAFB"}
            onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
          >
            <RefreshCw size={15} />
          </button>
          {stats.unread > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingRead}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: "rgba(59,130,246,0.15)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.25)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            >
              {markingRead ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total",  value: stats.total,  color: "#9CA3AF", bg: "#1F2937"                     },
          { label: "Unread", value: stats.unread, color: "#EF4444", bg: "rgba(239,68,68,0.1)"         },
          { label: "Read",   value: stats.read,   color: "#22C55E", bg: "rgba(34,197,94,0.1)"         },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: bg, border: "1px solid #374151" }}>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs font-semibold" style={{ color: "#6B7280" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={13} style={{ color: "#6B7280" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Filter</span>
        </div>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#1F2937" }}>
          {["all", "SYSTEM", "SECURITY", "ANNOUNCEMENT", "MARKETING"].map(t => (
            <button
              key={t}
              onClick={() => setFilters(f => ({ ...f, type: t }))}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: filters.type === t ? "#374151" : "transparent",
                color: filters.type === t ? "#F9FAFB" : "#6B7280",
              }}
            >
              {t === "all" ? "All Types" : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#1F2937" }}>
          {["all", "URGENT", "HIGH", "NORMAL"].map(p => (
            <button
              key={p}
              onClick={() => setFilters(f => ({ ...f, priority: p }))}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: filters.priority === p ? "#374151" : "transparent",
                color: filters.priority === p ? "#F9FAFB" : "#6B7280",
              }}
            >
              {p === "all" ? "All Priorities" : p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={28} style={{ color: "#374151" }} />
        </div>
      ) : notifications.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-2xl"
          style={{ background: "#1F2937", border: "1px solid #374151" }}
        >
          <Bell size={40} style={{ color: "#374151" }} />
          <p className="text-base font-bold mt-3" style={{ color: "#6B7280" }}>No notifications</p>
          <p className="text-sm mt-1" style={{ color: "#374151" }}>You're all caught up</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notifications.map((n, idx) => {
              const typeConf   = TYPE_CONFIG[n.type] || TYPE_CONFIG.SYSTEM;
              const prioConf   = PRIORITY_CONFIG[n.priority] || PRIORITY_CONFIG.NORMAL;
              const TypeIcon   = typeConf.icon;

              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => {
                    setOpenNotif(n);
                    if (!n.isRead) markOneRead(n.id);
                  }}
                  className="flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all"
                  style={{
                    background: !n.isRead ? "rgba(59,130,246,0.05)" : "#1F2937",
                    border: `1px solid ${!n.isRead ? "rgba(59,130,246,0.2)" : "#374151"}`,
                    borderLeft: `3px solid ${!n.isRead ? prioConf.color : "#374151"}`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = !n.isRead ? "rgba(59,130,246,0.05)" : "#1F2937"}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: typeConf.bg }}
                  >
                    <TypeIcon size={18} style={{ color: typeConf.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold line-clamp-1" style={{ color: "#F9FAFB" }}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {n.priority && n.priority !== "NORMAL" && (
                          <span
                            className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                            style={{ background: prioConf.bg, color: prioConf.color }}
                          >
                            {n.priority}
                          </span>
                        )}
                        <span className="text-[10px] font-medium" style={{ color: "#6B7280" }}>
                          {formatDate(n.createdAt)}
                        </span>
                        {!n.isRead && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3B82F6" }} />
                        )}
                      </div>
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "#9CA3AF" }}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ background: typeConf.bg, color: typeConf.color }}
                      >
                        {n.type}
                      </span>
                      {n.ctaUrl && (
                        <a
                          href={n.ctaUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] font-semibold hover:underline"
                          style={{ color: "#3B82F6" }}
                        >
                          View <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {openNotif && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpenNotif(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "#1F2937", border: "1px solid #374151" }}
            >
              {/* Modal header */}
              <div className="flex items-start justify-between p-5" style={{ borderBottom: "1px solid #374151" }}>
                <div className="flex items-start gap-3">
                  {(() => {
                    const tc = TYPE_CONFIG[openNotif.type] || TYPE_CONFIG.SYSTEM;
                    const TI = tc.icon;
                    return (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tc.bg }}>
                        <TI size={18} style={{ color: tc.color }} />
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#6B7280" }}>
                      {openNotif.type} · {openNotif.priority}
                    </p>
                    <h3 className="text-base font-bold mt-0.5" style={{ color: "#F9FAFB" }}>
                      {openNotif.title}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setOpenNotif(null)}
                  className="p-1.5 rounded-lg transition-all"
                  style={{ color: "#6B7280" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#F9FAFB"}
                  onMouseLeave={e => e.currentTarget.style.color = "#6B7280"}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5 space-y-4">
                {openNotif.bannerUrl && (
                  <img
                    src={openNotif.bannerUrl}
                    alt="Banner"
                    className="w-full h-40 object-cover rounded-xl"
                    style={{ border: "1px solid #374151" }}
                  />
                )}
                <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                  {openNotif.message}
                </p>
                <div className="flex items-center gap-2" style={{ color: "#6B7280" }}>
                  <Clock size={12} />
                  <span className="text-xs">{formatDate(openNotif.createdAt)}</span>
                </div>
                {openNotif.ctaUrl && (
                  <a
                    href={openNotif.ctaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{ background: "#3B82F6", color: "#fff" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#2563EB"}
                    onMouseLeave={e => e.currentTarget.style.background = "#3B82F6"}
                  >
                    {openNotif.ctaLabel || "View Details"} <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsPage;
