import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor, Plane, Train, Truck, Ship,
  CloudRain, Wind, Sun, Zap, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp,
  ExternalLink, X, Play, Square,
  Bell, Settings, LogOut, User, Clock,
  Activity, Globe, Shield,
} from 'lucide-react';

// ── Freight mode config ─────────────────────────────────────────
const FREIGHT_MODES = [
  { label: 'Sea',  value: 'ship',  Icon: Anchor, vehicle: 'truck' },
  { label: 'Air',  value: 'air',   Icon: Plane,  vehicle: 'car'   },
  { label: 'Rail', value: 'rail',  Icon: Train,  vehicle: 'truck' },
  { label: 'Road', value: 'truck', Icon: Truck,  vehicle: 'truck' },
];

const ROUTE_LABELS = ['Optimal Route', 'Alternate 1', 'Alternate 2'];

const getWeatherIcon = (condition) => {
  if (!condition) return Wind;
  if (condition.includes('Storm')) return Zap;
  if (condition.includes('Rain')) return CloudRain;
  if (condition.includes('Clear') || condition.includes('Sun')) return Sun;
  return Wind;
};

// ── Simulated live platform stats ───────────────────────────────
const LIVE_STATS = [
  { label: 'Active Shipments', value: '2,847', delta: '+12 today',   Icon: Ship,          color: 'text-blue-600',   bg: 'bg-blue-50'   },
  { label: 'Risk Alerts',      value: '3',     delta: '1 Critical',  Icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50'    },
  { label: 'On Schedule',      value: '94.2%', delta: '+1.2%',       Icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50'  },
  { label: 'Avg Transit',      value: '18.3d', delta: '-0.5d saved', Icon: Clock,         color: 'text-purple-600', bg: 'bg-purple-50' },
];

// ── Main Dashboard ──────────────────────────────────────────────
const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedSource, setSelectedSource]   = useState(null);
  const [selectedDest, setSelectedDest]       = useState(null);
  const [freightMode, setFreightMode]         = useState('ship');
  const [allRoutes, setAllRoutes]             = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [isNavigating, setIsNavigating]       = useState(false);
  const [simSpeed, setSimSpeed]               = useState(2);
  const [showIntel, setShowIntel]             = useState(true);
  const [showUserMenu, setShowUserMenu]       = useState(false);

  const vehicleMode = FREIGHT_MODES.find(m => m.value === freightMode)?.vehicle || 'truck';

  const handleRouteData = useCallback(({ allRoutes: routes, activeRouteIndex: idx }) => {
    setAllRoutes(routes || []);
    setActiveRouteIndex(idx ?? 0);
  }, []);

  const handleClearRoute = useCallback(() => {
    setSelectedSource(null);
    setSelectedDest(null);
    setAllRoutes([]);
    setActiveRouteIndex(0);
    setIsNavigating(false);
  }, []);

  const activeRoute    = allRoutes[activeRouteIndex] || allRoutes[0];
  const intel          = activeRoute?.intelligence;
  const hasCritical    = intel?.waypointReports?.some(w => w.severity === 'CRITICAL');
  const globalSeverity = hasCritical ? 'CRITICAL'
    : intel?.waypointReports?.some(w => w.severity === 'CAUTION') ? 'CAUTION' : 'STABLE';

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">

      {/* ══════════════════ LEFT SIDEBAR ══════════════════ */}
      <div className="w-[380px] h-full bg-white shadow-[2px_0_16px_rgba(0,0,0,0.07)] z-10 flex flex-col flex-shrink-0">

        {/* ── TOP BAR: Brand + User ── */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200 group-hover:bg-blue-700 transition-colors">
              <Anchor size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 tracking-tight leading-none">
                Route<span className="text-blue-600">Guardian</span>
              </p>
              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">
                Supply Chain AI
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <Link to="/notifications"
              className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-700 transition-colors">
              <Bell size={16} />
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-black hover:bg-blue-700 transition-colors shadow-sm"
              >
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-10 w-52 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-2 overflow-hidden"
                  >
                    <div className="px-4 py-2.5 border-b border-slate-50 mb-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Signed in as</p>
                      <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{user?.name}</p>
                    </div>
                    <Link to="/profile" onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                      <User size={14} /> Profile
                    </Link>
                    <Link to="/settings" onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                      <Settings size={14} /> Settings
                    </Link>
                    <button
                      onClick={() => { logout(); navigate('/auth'); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── SEARCH SECTION ── */}
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          {/* Freight mode tabs */}
          <div className="flex gap-1 mb-3 bg-slate-50 p-1 rounded-xl">
            {FREIGHT_MODES.map(({ label, value, Icon }) => (
              <button key={value} onClick={() => setFreightMode(value)} title={label}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[9px] font-bold transition-all ${
                  freightMode === value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}>
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Location search */}
          <ShipmentCreationFlow
            freightMode={freightMode}
            onLocationSelect={(src, dest) => { setSelectedSource(src); setSelectedDest(dest); }}
            onClearRoute={handleClearRoute}
            initialSource={selectedSource}
            initialDest={selectedDest}
          />
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* Route results */}
            {allRoutes.length > 0 ? (
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                {/* Origin / Dest summary */}
                <div className="px-4 py-3 border-b border-slate-50 flex items-start justify-between">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="flex flex-col items-center mt-1 gap-0.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                      <div className="w-px h-3 bg-slate-200" />
                      <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-100" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">
                        {selectedSource?.display_name?.split(',')[0] || 'Origin'}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400 truncate leading-tight mt-1">
                        {selectedDest?.display_name?.split(',')[0] || 'Destination'}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleClearRoute}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>

                {/* Route cards */}
                <div className="p-3 space-y-2">
                  {allRoutes.slice(0, 3).map((route, idx) => {
                    const isActive = idx === activeRouteIndex;
                    return (
                      <motion.button key={idx} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                        onClick={() => setActiveRouteIndex(idx)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                          isActive ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-100 bg-white hover:bg-slate-50'
                        }`}>
                        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                            {ROUTE_LABELS[idx] || `Route ${idx + 1}`}
                          </p>
                          <div className="flex items-baseline gap-2">
                            <span className={`text-xl font-black ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                              {(route.duration / 60).toFixed(0)}
                            </span>
                            <span className="text-xs text-slate-400 font-semibold">min</span>
                            <span className="text-slate-200">·</span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                              {(route.distance / 1000).toFixed(1)} km
                            </span>
                          </div>
                        </div>
                        {isActive && <CheckCircle size={15} className="text-blue-500 flex-shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Simulation controls */}
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl">
                    <button onClick={() => setIsNavigating(v => !v)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isNavigating ? 'bg-red-500 text-white shadow-md shadow-red-200' : 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700'
                      }`}>
                      {isNavigating
                        ? <Square size={12} fill="white" />
                        : <Play size={14} className="translate-x-0.5" fill="white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>{isNavigating ? 'Simulating shipment…' : 'Simulate route'}</span>
                        <span className="text-blue-600">×{simSpeed}</span>
                      </div>
                      <input type="range" min="1" max="10" step="1" value={simSpeed}
                        onChange={e => setSimSpeed(Number(e.target.value))}
                        className="w-full h-1 rounded-full cursor-pointer accent-blue-600" />
                    </div>
                  </div>
                </div>

                {/* Route intelligence */}
                {intel?.waypointReports?.length > 0 && (
                  <div className="px-3 pb-5">
                    <button onClick={() => setShowIntel(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Activity size={13} className="text-blue-500" />
                        <span className="text-xs font-bold text-slate-700">Route Intelligence</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          globalSeverity === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                          globalSeverity === 'CAUTION' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>{globalSeverity}</span>
                      </div>
                      {showIntel ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                    </button>

                    <AnimatePresence>
                      {showIntel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2.5 mt-2 px-1">
                            {intel.waypointReports.map((wp, i) => {
                              const WeatherIcon = getWeatherIcon(wp.weather);
                              const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                              const clr = wp.severity === 'CRITICAL' ? 'text-red-500 bg-red-50' :
                                         wp.severity === 'CAUTION'  ? 'text-amber-500 bg-amber-50' : 'text-blue-500 bg-blue-50';
                              return (
                                <div key={i} className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${clr}`}>
                                    <WeatherIcon size={14} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-slate-800 truncate">{wp.place}</p>
                                    <p className="text-[10px] text-slate-400">{parts.join(' · ')}</p>
                                  </div>
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    wp.severity === 'CRITICAL' ? 'bg-red-500' : wp.severity === 'CAUTION' ? 'bg-amber-500' : 'bg-green-500'
                                  }`} />
                                </div>
                              );
                            })}
                          </div>

                          {intel.newsFeed?.length > 0 && (
                            <div className="mt-4 space-y-2 px-1">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={11} className="text-red-500" />
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-wider">
                                  Risk Alerts ({intel.newsFeed.length})
                                </span>
                              </div>
                              {intel.newsFeed.slice(0, 3).map((news, i) => (
                                <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                                  <p className="text-[11px] font-semibold text-slate-700 leading-snug mb-2 line-clamp-2">{news.title}</p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                      {news.categories?.slice(0, 2).map((cat, ci) => (
                                        <span key={ci} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[8px] font-black uppercase">{cat}</span>
                                      ))}
                                    </div>
                                    {news.link && (
                                      <a href={news.link} target="_blank" rel="noreferrer"
                                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                        View <ExternalLink size={9} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : (

              /* Empty state — platform overview */
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Live stats grid */}
                <div className="p-4 pb-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Live Network Status</p>
                  <div className="grid grid-cols-2 gap-2">
                    {LIVE_STATS.map(({ label, value, delta, Icon, color, bg }) => (
                      <div key={label} className={`${bg} rounded-2xl p-3 border border-white`}>
                        <div className="flex items-center justify-between mb-2">
                          <Icon size={14} className={color} />
                          <span className="text-[8px] font-bold text-slate-500">{delta}</span>
                        </div>
                        <p className={`text-xl font-black ${color}`}>{value}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active risk alert */}
                <div className="px-4 pb-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Active Risk — Red Sea</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Ongoing conflict disrupting Bab-el-Mandeb Strait. AI recommending Cape of Good Hope re-routing (+14 days).
                    </p>
                  </div>
                </div>

                {/* How to use */}
                <div className="px-4 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Plan a Shipment</p>
                  <div className="space-y-2.5">
                    {[
                      { step: '1', Icon: Globe, text: 'Select freight mode — Sea, Air, Rail or Road' },
                      { step: '2', Icon: Anchor, text: 'Enter origin & destination ports or terminals' },
                      { step: '3', Icon: Shield, text: 'Get AI-optimized routes with real-time risk intelligence' },
                    ].map(({ step, Icon, text }) => (
                      <div key={step} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">{step}</div>
                        <div className="flex items-start gap-2 flex-1">
                          <Icon size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platform capabilities */}
                <div className="px-4 pb-6">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">AI Capabilities</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Weather prediction along routes',    color: 'bg-blue-400'   },
                      { label: 'Geopolitical risk monitoring',        color: 'bg-red-400'    },
                      { label: 'Port congestion alerts',              color: 'bg-amber-400'  },
                      { label: 'Multi-modal route optimization',      color: 'bg-green-400'  },
                      { label: 'Real-time disruption detection',      color: 'bg-purple-400' },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
                        <p className="text-xs text-slate-600">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══════════════════ MAP ══════════════════ */}
      <div className="flex-1 h-full relative">
        <RouteMap
          selectedSource={selectedSource}
          selectedDestination={selectedDest}
          setSelectedSource={setSelectedSource}
          setSelectedDestination={setSelectedDest}
          vehicleMode={vehicleMode}
          freightMode={freightMode}
          onClearRoute={handleClearRoute}
          onRouteData={handleRouteData}
          activeRouteIndex={activeRouteIndex}
          onSetActiveRoute={setActiveRouteIndex}
          isNavigating={isNavigating}
          simSpeed={simSpeed}
        />
      </div>
    </div>
  );
};

export default Dashboard;
