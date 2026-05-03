import React, { useState, useCallback } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor, Plane, Train, Truck, Ship,
  CloudRain, Wind, Sun, Zap, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, ExternalLink, X,
  Play, Square, Clock, Activity, Globe, Shield, Radio,
} from 'lucide-react';

const GLOBAL_THREAT_PREVIEW = [
  { name: 'Red Sea / Bab-el-Mandeb', severity: 'CRITICAL', type: 'conflict',
    shortDesc: 'Active Houthi missile attacks on commercial shipping. Major carriers diverted via Cape.' },
  { name: 'Black Sea', severity: 'CRITICAL', type: 'conflict',
    shortDesc: 'Russia–Ukraine war. Naval mines in transit corridors. Grain export under threat.' },
  { name: 'Strait of Hormuz', severity: 'HIGH', type: 'conflict',
    shortDesc: 'US-Iran tensions. Vessel seizures and naval exercises creating closure risk.' },
  { name: 'Eastern Mediterranean', severity: 'HIGH', type: 'conflict',
    shortDesc: 'Regional conflict creating airspace and sea-lane uncertainty.' },
  { name: 'South China Sea', severity: 'MODERATE', type: 'dispute',
    shortDesc: 'Territorial disputes. Coast guard standoffs near disputed island chains.' },
];

const FREIGHT_MODES = [
  { label: 'Sea',  value: 'ship',  Icon: Anchor },
  { label: 'Air',  value: 'air',   Icon: Plane  },
  { label: 'Rail', value: 'rail',  Icon: Train  },
  { label: 'Road', value: 'truck', Icon: Truck  },
];

const ROUTE_LABELS = ['Optimal Route', 'Alternate 1', 'Alternate 2'];

const getWeatherIcon = (condition) => {
  if (!condition) return Wind;
  if (condition.includes('Storm')) return Zap;
  if (condition.includes('Rain')) return CloudRain;
  if (condition.includes('Clear') || condition.includes('Sun')) return Sun;
  return Wind;
};

const LIVE_STATS = [
  { label: 'Active Shipments', value: '2,847', delta: '+12',    Icon: Ship,          color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'   },
  { label: 'Risk Alerts',      value: '3',     delta: '1 High', Icon: AlertTriangle, color: '#EF4444', bg: 'rgba(239,68,68,0.1)'    },
  { label: 'On Schedule',      value: '94.2%', delta: '+1.2%',  Icon: CheckCircle,   color: '#22C55E', bg: 'rgba(34,197,94,0.1)'    },
  { label: 'Avg Transit',      value: '18.3d', delta: '-0.5d',  Icon: Clock,         color: '#A78BFA', bg: 'rgba(167,139,250,0.1)'  },
];

const SEV_STYLES = {
  CRITICAL: { card: 'rgba(239,68,68,0.08)', border: '#EF4444', dot: '#EF4444', badge: 'rgba(239,68,68,0.2)', badgeText: '#EF4444', text: '#FCA5A5' },
  HIGH:     { card: 'rgba(245,158,11,0.08)', border: '#F59E0B', dot: '#F59E0B', badge: 'rgba(245,158,11,0.2)', badgeText: '#F59E0B', text: '#FCD34D' },
  MODERATE: { card: 'rgba(56,189,248,0.06)', border: '#38BDF8', dot: '#38BDF8', badge: 'rgba(56,189,248,0.15)', badgeText: '#38BDF8', text: '#7DD3FC' },
};

const Dashboard = () => {
  const { user } = useAuth();

  const [selectedSource, setSelectedSource]     = useState(null);
  const [selectedDest, setSelectedDest]         = useState(null);
  const [freightMode, setFreightMode]           = useState('ship');
  const [allRoutes, setAllRoutes]               = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [isNavigating, setIsNavigating]         = useState(false);
  const [simSpeed, setSimSpeed]                 = useState(2);
  const [showIntel, setShowIntel]               = useState(true);

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

  const sevBadgeStyle = globalSeverity === 'CRITICAL'
    ? { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' }
    : globalSeverity === 'CAUTION'
    ? { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
    : { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#0B1220' }}>

      {/* ══ LEFT CONTROL PANEL ══ */}
      <div
        className="h-full flex flex-col flex-shrink-0 overflow-hidden"
        style={{ width: 380, background: '#111827', borderRight: '1px solid #374151' }}
      >
        {/* Mode selector */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: '#6B7280' }}>
            Freight Mode
          </p>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: '#0B1220' }}
          >
            {FREIGHT_MODES.map(({ label, value, Icon }) => (
              <button
                key={value}
                onClick={() => setFreightMode(value)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[9px] font-bold transition-all"
                style={{
                  background: freightMode === value ? '#1F2937' : 'transparent',
                  color: freightMode === value ? '#3B82F6' : '#6B7280',
                  boxShadow: freightMode === value ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Route inputs */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
          <ShipmentCreationFlow
            freightMode={freightMode}
            onLocationSelect={(src, dest) => { setSelectedSource(src); setSelectedDest(dest); }}
            onClearRoute={handleClearRoute}
            initialSource={selectedSource}
            initialDest={selectedDest}
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {allRoutes.length > 0 ? (
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                {/* Route summary */}
                <div className="px-4 py-3 flex items-start justify-between" style={{ borderBottom: '1px solid #374151' }}>
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="flex flex-col items-center mt-1 gap-0.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                      <div className="w-px h-3" style={{ background: '#374151' }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: '#EF4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate leading-tight" style={{ color: '#F9FAFB' }}>
                        {selectedSource?.display_name?.split(',')[0] || 'Origin'}
                      </p>
                      <p className="text-[11px] font-semibold truncate leading-tight mt-1" style={{ color: '#9CA3AF' }}>
                        {selectedDest?.display_name?.split(',')[0] || 'Destination'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClearRoute}
                    className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                    style={{ color: '#6B7280' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Route cards */}
                <div className="p-3 space-y-2">
                  {allRoutes.slice(0, 3).map((route, idx) => {
                    const isActive = idx === activeRouteIndex;
                    return (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setActiveRouteIndex(idx)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all"
                        style={{
                          border: isActive ? '1px solid rgba(59,130,246,0.5)' : '1px solid #374151',
                          background: isActive ? 'rgba(59,130,246,0.1)' : '#1F2937',
                        }}
                      >
                        <div
                          className="w-1 h-10 rounded-full flex-shrink-0"
                          style={{ background: isActive ? '#3B82F6' : '#374151' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[10px] font-black uppercase tracking-wider mb-0.5"
                            style={{ color: isActive ? '#3B82F6' : '#6B7280' }}
                          >
                            {route.summary || ROUTE_LABELS[idx] || `Route ${idx + 1}`}
                          </p>
                          <div className="flex items-baseline gap-2">
                            {freightMode === 'ship' ? (
                              <>
                                <span className="text-xl font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                  {(route.duration / 86400).toFixed(1)}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: '#6B7280' }}>days</span>
                              </>
                            ) : freightMode === 'air' ? (
                              <>
                                <span className="text-xl font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                  {(route.duration / 3600).toFixed(1)}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: '#6B7280' }}>hrs</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xl font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                  {(route.duration / 60).toFixed(0)}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: '#6B7280' }}>min</span>
                              </>
                            )}
                            <span style={{ color: '#374151' }}>·</span>
                            <span className="text-sm font-semibold" style={{ color: isActive ? '#9CA3AF' : '#6B7280' }}>
                              {(route.distance / 1000).toFixed(0)} km
                            </span>
                          </div>
                        </div>
                        {isActive && <CheckCircle size={15} style={{ color: '#3B82F6' }} className="flex-shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Simulation controls */}
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: '#1F2937' }}>
                    <button
                      onClick={() => setIsNavigating(v => !v)}
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        background: isNavigating ? '#EF4444' : '#3B82F6',
                        boxShadow: isNavigating ? '0 0 12px rgba(239,68,68,0.4)' : '0 0 12px rgba(59,130,246,0.4)',
                      }}
                    >
                      {isNavigating
                        ? <Square size={11} className="text-white" fill="white" />
                        : <Play size={13} className="text-white translate-x-0.5" fill="white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>
                        <span>{isNavigating ? 'Simulating…' : 'Simulate Route'}</span>
                        <span style={{ color: '#3B82F6' }}>×{simSpeed}</span>
                      </div>
                      <input
                        type="range" min="1" max="10" step="1" value={simSpeed}
                        onChange={e => setSimSpeed(Number(e.target.value))}
                        className="w-full h-1 rounded-full cursor-pointer"
                        style={{ accentColor: '#3B82F6' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Route intelligence */}
                {intel?.waypointReports?.length > 0 && (
                  <div className="px-3 pb-5">
                    <button
                      onClick={() => setShowIntel(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all"
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div className="flex items-center gap-2">
                        <Activity size={13} style={{ color: '#3B82F6' }} />
                        <span className="text-xs font-bold" style={{ color: '#F9FAFB' }}>Route Intelligence</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-black"
                          style={sevBadgeStyle}
                        >
                          {globalSeverity}
                        </span>
                      </div>
                      {showIntel
                        ? <ChevronUp size={12} style={{ color: '#6B7280' }} />
                        : <ChevronDown size={12} style={{ color: '#6B7280' }} />}
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
                              const WIcon = getWeatherIcon(wp.weather);
                              const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                              const clr = wp.severity === 'CRITICAL'
                                ? { bg: 'rgba(239,68,68,0.12)', icon: '#EF4444', dot: '#EF4444' }
                                : wp.severity === 'CAUTION'
                                ? { bg: 'rgba(245,158,11,0.12)', icon: '#F59E0B', dot: '#F59E0B' }
                                : { bg: 'rgba(59,130,246,0.1)', icon: '#3B82F6', dot: '#22C55E' };
                              return (
                                <div key={i} className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: clr.bg }}>
                                    <WIcon size={14} style={{ color: clr.icon }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold truncate" style={{ color: '#F9FAFB' }}>{wp.place}</p>
                                    <p className="text-[10px]" style={{ color: '#6B7280' }}>{parts.join(' · ')}</p>
                                  </div>
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: clr.dot }} />
                                </div>
                              );
                            })}
                          </div>

                          {intel.newsFeed?.length > 0 && (
                            <div className="mt-4 space-y-2 px-1">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={11} style={{ color: '#EF4444' }} />
                                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#EF4444' }}>
                                  Risk Alerts ({intel.newsFeed.length})
                                </span>
                              </div>
                              {intel.newsFeed.slice(0, 3).map((news, i) => (
                                <div
                                  key={i}
                                  className="p-3 rounded-xl border"
                                  style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}
                                >
                                  <p className="text-[11px] font-semibold leading-snug mb-2 line-clamp-2" style={{ color: '#FCA5A5' }}>
                                    {news.title}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                      {news.categories?.slice(0, 2).map((cat, ci) => (
                                        <span key={ci} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase" style={{ background: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
                                          {cat}
                                        </span>
                                      ))}
                                    </div>
                                    {news.link && (
                                      <a href={news.link} target="_blank" rel="noreferrer"
                                        className="text-[10px] flex items-center gap-0.5 hover:underline" style={{ color: '#3B82F6' }}>
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
              /* ── EMPTY STATE ── */
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* KPI Cards */}
                <div className="p-4 pb-2">
                  <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: '#6B7280' }}>
                    Live Network Status
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {LIVE_STATS.map(({ label, value, delta, Icon, color, bg }) => (
                      <div
                        key={label}
                        className="rounded-2xl p-3"
                        style={{ background: bg, border: `1px solid ${color}22` }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon size={14} style={{ color }} />
                          <span className="text-[8px] font-bold" style={{ color: '#6B7280' }}>{delta}</span>
                        </div>
                        <p className="text-xl font-black" style={{ color }}>{value}</p>
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Threat Feed */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Radio size={9} className="animate-pulse" style={{ color: '#EF4444' }} />
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>
                      Live Threat Feed
                    </p>
                  </div>
                  <div className="space-y-2">
                    {GLOBAL_THREAT_PREVIEW.slice(0, 3).map((threat, i) => {
                      const s = SEV_STYLES[threat.severity] || SEV_STYLES.MODERATE;
                      return (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl"
                          style={{ background: s.card, border: `1px solid ${s.border}33` }}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                            <span className="text-[9px] font-black uppercase tracking-wider flex-1 truncate" style={{ color: s.text }}>
                              {threat.name}
                            </span>
                            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: s.badge, color: s.badgeText }}>
                              {threat.severity}
                            </span>
                          </div>
                          <p className="text-[10px] leading-relaxed" style={{ color: s.text, opacity: 0.85 }}>
                            {threat.shortDesc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Getting started */}
                <div className="px-4 pb-5">
                  <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: '#6B7280' }}>
                    Plan a Shipment
                  </p>
                  <div className="space-y-2.5">
                    {[
                      { step: '1', Icon: Globe,  text: 'Select freight mode — Sea, Air, Rail or Road' },
                      { step: '2', Icon: Anchor, text: 'Enter origin & destination ports or speak to the AI' },
                      { step: '3', Icon: Shield, text: 'Get AI-optimized routes with real-time risk intelligence' },
                    ].map(({ step, Icon, text }) => (
                      <div key={step} className="flex items-start gap-3">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}
                        >
                          {step}
                        </div>
                        <div className="flex items-start gap-2 flex-1">
                          <Icon size={12} style={{ color: '#6B7280' }} className="mt-0.5 flex-shrink-0" />
                          <p className="text-xs leading-relaxed" style={{ color: '#9CA3AF' }}>{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══ MAP ══ */}
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
