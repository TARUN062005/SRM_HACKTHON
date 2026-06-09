import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Loader2, ShieldAlert, AlertTriangle, AlertCircle,
  Clock, ExternalLink, Globe, RefreshCw, Search, X,
  FileText, MapPin, Filter, Calendar
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "";

const SEV_CONFIG = {
  CRITICAL: { icon: ShieldAlert,  color: "#FF5C7A", bg: "rgba(255,92,122,0.12)", border: "rgba(255,92,122,0.3)" },
  HIGH:     { icon: AlertTriangle, color: "#FF9F43", bg: "rgba(255,159,67,0.12)", border: "rgba(255,159,67,0.3)" },
  MODERATE: { icon: AlertCircle,   color: "#00C2FF", bg: "rgba(0,194,255,0.12)",  border: "rgba(0,194,255,0.3)"  },
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
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [openAlert, setOpenAlert] = useState(null);
  const [modalContent, setModalContent] = useState("");
  const [modalContentLoading, setModalContentLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDateRange, setSelectedDateRange] = useState("all");

  const handleOpenAlert = async (alert) => {
    setOpenAlert(alert);
    setModalContent("");
    if (!alert.source_url) {
      setModalContent(alert.title);
      return;
    }
    
    try {
      setModalContentLoading(true);
      const res = await axios.get(`${BASE_URL}/api/ai/article-content`, {
        params: { url: alert.source_url, title: alert.title }
      });
      if (res.data?.success) {
        setModalContent(res.data.text);
      } else {
        setModalContent(alert.title);
      }
    } catch (err) {
      setModalContent(alert.title);
    } finally {
      setModalContentLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BASE_URL}/api/ai/alerts`, { withCredentials: true });
      if (res.data?.success) {
        setAlerts(res.data.alerts || []);
      } else {
        toast.error("Failed to load live risk feed");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load live risk feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Compute dynamic categories
  const categories = useMemo(() => {
    const cats = new Set();
    alerts.forEach((a) => {
      if (a.category) {
        cats.add(a.category.toLowerCase());
      }
    });
    return Array.from(cats);
  }, [alerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      // 1. Search Query
      const matchQuery =
        !searchQuery.trim() ||
        a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.source?.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Severity
      const matchSeverity =
        selectedSeverity === "all" ||
        a.severity?.toUpperCase() === selectedSeverity.toUpperCase();

      // 3. Category
      const matchCategory =
        selectedCategory === "all" ||
        a.category?.toLowerCase() === selectedCategory.toLowerCase();

      // 4. Date Range
      const matchDate = (() => {
        if (selectedDateRange === "all") return true;
        if (!a.published) return false;
        const pubDate = new Date(a.published);
        const now = new Date();
        const diffMs = now - pubDate;
        if (selectedDateRange === "24h") return diffMs <= 24 * 60 * 60 * 1000;
        if (selectedDateRange === "7d") return diffMs <= 7 * 24 * 60 * 60 * 1000;
        if (selectedDateRange === "30d") return diffMs <= 30 * 24 * 60 * 60 * 1000;
        return true;
      })();

      return matchQuery && matchSeverity && matchCategory && matchDate;
    });
  }, [alerts, searchQuery, selectedSeverity, selectedCategory, selectedDateRange]);

  // Compute stats
  const stats = useMemo(() => {
    let total = alerts.length;
    let critical = alerts.filter((a) => a.severity === "CRITICAL").length;
    let high = alerts.filter((a) => a.severity === "HIGH").length;
    let moderate = alerts.filter((a) => a.severity === "MODERATE").length;
    return { total, critical, high, moderate };
  }, [alerts]);

  return (
    <div className="min-h-full py-8 px-4 sm:px-6 lg:px-8 bg-[#081120] text-[#F3F6FA] flex justify-center items-start">
      <div className="w-full max-w-6xl space-y-8">
        
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#00C2FF] mb-1">
              Intelligence Feed
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white">Global Risk Alerts</h1>
            <p className="text-sm mt-1 text-[#9AA7B5]">
              Real-time global logistics threats aggregated from the live GEO_RISK_ENGINE feed.
            </p>
          </div>
          <button
            onClick={fetchAlerts}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#101826] border border-white/5 hover:border-[#00C2FF]/30 text-white hover:bg-[#101826]/80 transition-all cursor-pointer shadow-md self-start md:self-auto"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh Feed</span>
          </button>
        </div>

        {/* SECTION 1: Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Incidents", value: stats.total, color: "#9AA7B5", bg: "#101826", border: "border-white/5", glow: "hover:shadow-[0_0_15px_rgba(154,167,181,0.05)]" },
            { label: "Critical Severity", value: stats.critical, color: "#FF5C7A", bg: "#101826", border: "border-red-500/10", glow: "hover:shadow-[0_0_15px_rgba(255,92,122,0.1)]" },
            { label: "High Severity", value: stats.high, color: "#FF9F43", bg: "#101826", border: "border-orange-500/10", glow: "hover:shadow-[0_0_15px_rgba(255,159,67,0.1)]" },
            { label: "Moderate Severity", value: stats.moderate, color: "#00C2FF", bg: "#101826", border: "border-cyan-500/10", glow: "hover:shadow-[0_0_15px_rgba(0,194,255,0.1)]" },
          ].map(({ label, value, color, bg, border, glow }) => (
            <div
              key={label}
              className={`p-5 rounded-2xl border ${bg} ${border} transition-all duration-300 ${glow} flex flex-col justify-between h-28`}
            >
              <span className="text-xs font-bold text-[#9AA7B5]">{label}</span>
              <span className="text-3xl font-black tracking-tight" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* SECTION 2: Filters & Search */}
        <div className="bg-[#101826] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
              <input
                type="text"
                placeholder="Search incidents by location, title, or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200"
              />
            </div>

            {/* Filter Dropdowns & Severity buttons */}
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Category Dropdown */}
              <div className="relative flex items-center">
                <Filter size={13} className="absolute left-3.5 text-[#7C8A99]" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none pl-9 pr-8 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-xs font-bold text-white transition-all focus:outline-none focus:border-[#00C2FF] cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c} className="capitalize bg-[#0B1220]">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Dropdown */}
              <div className="relative flex items-center">
                <Calendar size={13} className="absolute left-3.5 text-[#7C8A99]" />
                <select
                  value={selectedDateRange}
                  onChange={(e) => setSelectedDateRange(e.target.value)}
                  className="appearance-none pl-9 pr-8 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-xs font-bold text-white transition-all focus:outline-none focus:border-[#00C2FF] cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
              </div>

              {/* Severity Quick Toggles */}
              <div className="flex bg-[#0B1220] border border-white/5 rounded-xl p-1">
                {["all", "CRITICAL", "HIGH", "MODERATE"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSeverity(s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize cursor-pointer"
                    style={{
                      background: selectedSeverity === s ? "#101826" : "transparent",
                      color: selectedSeverity === s ? "#00C2FF" : "#9AA7B5",
                    }}
                  >
                    {s === "all" ? "All" : s.toLowerCase()}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* SECTION 3: Alerts Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="animate-spin text-[#00C2FF]" size={36} />
            <p className="text-sm text-[#9AA7B5] animate-pulse">Synchronizing threat intelligence...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-[#101826] border border-white/5 rounded-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[#9AA7B5]">
              <Bell size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">No Threat Vectors Found</h3>
              <p className="text-xs text-[#9AA7B5] mt-1">
                No alerts matched your current search and filter parameters.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredAlerts.map((n, idx) => {
                const sevConf = SEV_CONFIG[n.severity?.toUpperCase()] || SEV_CONFIG.MODERATE;

                return (
                  <motion.div
                    key={`notification-${n.id || idx}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                    className="bg-[#101826] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col group hover:border-white/10 hover:shadow-xl cursor-pointer"
                    style={{
                      borderTop: `4px solid ${sevConf.color}`
                    }}
                    onClick={() => handleOpenAlert(n)}
                  >
                    {/* Cover / Icon Header */}
                    {(() => {
                      let domain = '';
                      try {
                        if (n.source_url) {
                          domain = new URL(n.source_url).hostname;
                        }
                      } catch {}
                      const favicon = domain ? `https://www.google.com/s2/favicons?sz=64&domain=${domain}` : null;
                      
                      if (n.image_url) {
                        return (
                          <div className="relative h-44 overflow-hidden bg-[#0B1220]">
                            <img
                              src={n.image_url}
                              alt={n.title}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute top-3 right-3 z-10">
                              <span
                                className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg"
                                style={{ background: sevConf.bg, color: sevConf.color, backdropFilter: "blur(4px)" }}
                              >
                                {n.severity}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div
                          className="relative h-44 overflow-hidden border-b border-white/5 flex flex-col items-center justify-center p-4 gap-2 select-none"
                          style={{ background: `linear-gradient(135deg, ${sevConf.color}08, ${sevConf.color}03)` }}
                        >
                          {favicon ? (
                            <img
                              src={favicon}
                              alt={n.source || domain}
                              className="w-12 h-12 rounded-xl bg-[#0B1220] p-1.5 border border-white/10 shadow-lg"
                              onError={e => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Globe size={28} className="opacity-40" style={{ color: sevConf.color }} />
                          )}
                          {n.source && (
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#7C8A99]">
                              {n.source}
                            </span>
                          )}
                          <div className="absolute top-3 right-3">
                            <span
                              className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg"
                              style={{ background: sevConf.bg, color: sevConf.color, backdropFilter: "blur(4px)" }}
                            >
                              {n.severity}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Card Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center gap-2 text-[10px] text-[#7C8A99] font-bold">
                          <span className="capitalize px-2 py-0.5 rounded bg-[#0B1220] text-slate-300">
                            {n.category || "General"}
                          </span>
                          <span className="truncate max-w-[150px]">{n.source}</span>
                        </div>

                        <h3 className="text-sm font-bold leading-snug text-white line-clamp-2 group-hover:text-[#00C2FF] transition-colors duration-200">
                          {n.title}
                        </h3>

                        {n.summary && (
                          <p className="text-xs text-[#9AA7B5] line-clamp-3 leading-relaxed">
                            {n.summary}
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 pt-3 border-t border-white/5">
                        <div className="flex justify-between items-center text-[10px] text-[#7C8A99] font-bold">
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} />
                            <span>{formatDate(n.published)}</span>
                          </div>
                          {n.confidence != null && (
                            <span>Accuracy: {Math.round(n.confidence * 100)}%</span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenAlert(n); }}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer bg-white/5 text-white hover:bg-white/10 border border-white/5 hover:border-white/10"
                          >
                            Read Article
                          </button>
                          {n.source_url && (
                            <a
                              href={n.source_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer bg-[#00C2FF] text-[#081120] hover:bg-[#26d0ff] flex items-center justify-center gap-1 shadow-md shadow-[#00C2FF]/5"
                            >
                              <span>Original</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* SECTION 4: Alert Details Modal */}
        <AnimatePresence>
          {openAlert && (
            <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setOpenAlert(null)}
              />
              
              {/* Modal Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ type: "spring", duration: 0.3 }}
                className="relative w-full max-w-2xl rounded-[24px] bg-[#0E1624] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between p-6 bg-[#101826] border-b border-white/5">
                  <div className="flex items-start gap-4">
                    {(() => {
                      const tc = SEV_CONFIG[openAlert.severity?.toUpperCase()] || SEV_CONFIG.MODERATE;
                      const TI = tc.icon;
                      return (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: tc.bg, border: `1px solid ${tc.border}` }}>
                          <TI size={18} style={{ color: tc.color }} />
                        </div>
                      );
                    })()}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-[#0B1220] text-slate-300 border border-white/5">
                          {openAlert.category || "General"}
                        </span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded border"
                          style={{
                            background: openAlert.severity === 'CRITICAL' ? 'rgba(255,92,122,0.15)' : openAlert.severity === 'HIGH' ? 'rgba(255,159,67,0.15)' : 'rgba(0,194,255,0.15)',
                            color: openAlert.severity === 'CRITICAL' ? '#FF5C7A' : openAlert.severity === 'HIGH' ? '#FF9F43' : '#00C2FF',
                            borderColor: 'currentColor'
                          }}
                        >
                          {openAlert.severity}
                        </span>
                      </div>
                      <h3 className="text-base font-black leading-snug text-white pr-4">
                        {openAlert.title}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenAlert(null)}
                    className="p-1.5 rounded-xl bg-white/5 border border-white/5 text-[#9AA7B5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Modal Body (Scrollable) */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                  {openAlert.image_url && (
                    <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0B1220]">
                      <img
                        src={openAlert.image_url}
                        alt="News Cover"
                        className="w-full h-56 object-cover"
                      />
                    </div>
                  )}

                  {/* Geopolitical Briefing Description */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00C2FF]">Geopolitical Briefing</p>
                    {modalContentLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Loader2 className="animate-spin text-[#00C2FF]" size={28} />
                        <p className="text-xs text-[#9AA7B5] animate-pulse">Extracting intelligence report...</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                        {modalContent || openAlert.title}
                      </p>
                    )}
                  </div>

                  {/* Incident Metadata Details */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl text-xs bg-[#0B1220] border border-white/5">
                    <div>
                      <p className="font-semibold text-[10px] uppercase tracking-wider text-[#9AA7B5]">Publisher</p>
                      <p className="font-bold mt-1 text-white">{openAlert.source || "GEO_RISK_ENGINE"}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[10px] uppercase tracking-wider text-[#9AA7B5]">Published Date</p>
                      <p className="font-bold mt-1 text-white">
                        {openAlert.published ? new Date(openAlert.published).toLocaleString() : "N/A"}
                      </p>
                    </div>
                    {openAlert.confidence != null && (
                      <div>
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-[#9AA7B5]">ML Confidence</p>
                        <p className="font-bold mt-1 text-[#00C2FF]">{(openAlert.confidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {openAlert.intensity != null && (
                      <div>
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-[#9AA7B5]">Threat Intensity</p>
                        <p className="font-bold mt-1 text-[#FF5C7A]">{(openAlert.intensity * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {openAlert.lat != null && openAlert.lon != null && (
                      <div className="col-span-2">
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-[#9AA7B5]">Threat Coordinates</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <MapPin size={12} className="text-[#00C2FF]" />
                          <span className="font-mono text-xs text-slate-300">
                            {openAlert.lat.toFixed(5)}, {openAlert.lon.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Actions Footer */}
                <div className="p-4 bg-[#101826] border-t border-white/5 flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    onClick={() => {
                      if (openAlert.source_url) {
                        navigator.clipboard.writeText(openAlert.source_url);
                        toast.success("Article link copied!");
                      }
                    }}
                    className="px-4 py-2 bg-transparent border border-white/5 rounded-xl text-xs font-bold text-white hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Copy Link
                  </button>
                  {openAlert.source_url && (
                    <button
                      onClick={() => {
                        try {
                          const hostname = new URL(openAlert.source_url).hostname;
                          window.open(`https://${hostname}`, '_blank', 'noreferrer');
                        } catch (e) {
                          window.open(openAlert.source_url, '_blank', 'noreferrer');
                        }
                      }}
                      className="px-4 py-2 bg-[#0B1220] border border-white/5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:border-white/10 transition-colors cursor-pointer"
                    >
                      Publisher Site
                    </button>
                  )}
                  {openAlert.source_url && (
                    <a
                      href={openAlert.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-black uppercase bg-[#00C2FF] hover:bg-[#26d0ff] text-[#081120] flex items-center gap-1 shadow-md transition-colors"
                    >
                      <span>Original Source</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default NotificationsPage;
