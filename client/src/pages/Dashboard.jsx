import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import RoutyChatPanel, { loadRouteHistory, saveRouteToHistory } from '../components/RoutyChatPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor, Plane, Train, Truck,
  CloudRain, Wind, Sun, Zap, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, ExternalLink, X,
  Play, Square, Clock, Activity,
  Bot, History, Trash2, ChevronRight,
} from 'lucide-react';


const FREIGHT_MODES = [
  { label: 'Sea',    value: 'ship',  Icon: Anchor },
  { label: 'Air',    value: 'air',   Icon: Plane  },
  { label: 'Ground', value: 'rail',  Icon: Truck  },
  { label: 'Road',   value: 'truck', Icon: Truck  },
];

const ROUTE_LABELS = ['Optimal Route', 'Alternate 1', 'Alternate 2'];

const MODE_ICONS = { sea: Anchor, ship: Anchor, air: Plane, rail: Train, truck: Truck, road: Truck };
const MODE_COLORS = { sea: '#0d47a1', ship: '#0d47a1', air: '#0288d1', rail: '#6d28d9', truck: '#c2410c', road: '#c2410c' };

const getWeatherIcon = (condition) => {
  if (!condition) return Wind;
  if (condition.includes('Storm')) return Zap;
  if (condition.includes('Rain')) return CloudRain;
  if (condition.includes('Clear') || condition.includes('Sun')) return Sun;
  return Wind;
};


const SEV_STYLES = {
  CRITICAL: { card: 'rgba(239,68,68,0.08)', border: '#EF4444', dot: '#EF4444', badge: 'rgba(239,68,68,0.2)', badgeText: '#EF4444', text: '#FCA5A5' },
  HIGH:     { card: 'rgba(245,158,11,0.08)', border: '#F59E0B', dot: '#F59E0B', badge: 'rgba(245,158,11,0.2)', badgeText: '#F59E0B', text: '#FCD34D' },
  MODERATE: { card: 'rgba(56,189,248,0.06)', border: '#38BDF8', dot: '#38BDF8', badge: 'rgba(56,189,248,0.15)', badgeText: '#38BDF8', text: '#7DD3FC' },
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── My Routes panel ────────────────────────────────────────────────────────────
const MyRoutesSection = ({ routes, onLoad, onClear, isExpanded, onToggle }) => {
  if (routes.length === 0) return null;

  return (
    <div className="px-3 pb-3" style={{ borderBottom: '1px solid #374151' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-2 transition-all"
        onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <div className="flex items-center gap-2">
          <History size={12} style={{ color: '#A78BFA' }} />
          <span className="text-xs font-bold" style={{ color: '#F9FAFB' }}>My Routes</span>
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black" style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA' }}>
            {routes.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onClear(); }}
            className="p-1 rounded transition-all" title="Clear history"
            style={{ color: '#6B7280' }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
            <Trash2 size={10} />
          </button>
          {isExpanded
            ? <ChevronUp size={12} style={{ color: '#6B7280' }} />
            : <ChevronDown size={12} style={{ color: '#6B7280' }} />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 mt-1">
              {routes.slice(0, 8).map(r => {
                const ModeIcon = MODE_ICONS[r.mode] || Anchor;
                const modeColor = MODE_COLORS[r.mode] || '#3B82F6';
                const sev = r.severity;
                const sevColor = sev === 'CRITICAL' ? '#EF4444' : sev === 'CAUTION' ? '#F59E0B' : '#22C55E';
                return (
                  <motion.button
                    key={r.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onLoad(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                    style={{ background: '#1F2937', border: '1px solid #374151' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#4B5563'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#374151'}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${modeColor}18` }}>
                      <ModeIcon size={12} style={{ color: modeColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[10px] font-bold truncate" style={{ color: '#F9FAFB' }}>
                          {r.origin?.split(',')[0]}
                        </span>
                        <ChevronRight size={8} style={{ color: '#6B7280', flexShrink: 0 }} />
                        <span className="text-[10px] font-bold truncate" style={{ color: '#F9FAFB' }}>
                          {r.destination?.split(',')[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px]" style={{ color: '#6B7280' }}>{timeAgo(r.timestamp)}</span>
                        {r.severity && (
                          <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded"
                            style={{ background: `${sevColor}18`, color: sevColor }}>
                            {r.severity}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={11} style={{ color: '#374151', flexShrink: 0 }} />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
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
  const [showRouty, setShowRouty]               = useState(false);
  const [savedRoutes, setSavedRoutes]           = useState([]);
  const [showMyRoutes, setShowMyRoutes]         = useState(true);
  const [aiRec, setAiRec]                       = useState(null);
  const [aiRecLoading, setAiRecLoading]         = useState(false);

  // Load route history from localStorage
  useEffect(() => {
    setSavedRoutes(loadRouteHistory());
  }, []);

  const vehicleMode = freightMode;

  const handleRouteData = useCallback(async ({ allRoutes: routes, activeRouteIndex: idx }) => {
    setAllRoutes(routes || []);
    setActiveRouteIndex(idx ?? 0);
    setAiRec(null);
    // Save to history when route data arrives
    if (routes?.length > 0 && selectedSource && selectedDest) {
      const activeR = routes[0];
      const entry = saveRouteToHistory({
        state: {
          origin: selectedSource.display_name?.split(',')[0] || 'Origin',
          destination: selectedDest.display_name?.split(',')[0] || 'Destination',
          mode: freightMode === 'ship' ? 'sea' : freightMode,
        },
        source: selectedSource,
        destination: selectedDest,
        riskScore: activeR?.intelligence?.riskScore ?? null,
        severity: activeR?.intelligence?.severity ?? null,
      });
      if (entry) setSavedRoutes(loadRouteHistory());
    }
    // AI route comparison (only when 2+ routes available)
    if (routes?.length >= 2) {
      try {
        setAiRecLoading(true);
        const res = await axios.post('/api/ai/routes/compare', {
          routes: routes.map(r => ({
            summary:      r.summary,
            distance:     r.distance,
            duration:     r.duration,
            intelligence: r.intelligence,
          })),
        });
        if (res.data?.success) setAiRec(res.data.recommendation);
      } catch (_) {
        // silently fail
      } finally {
        setAiRecLoading(false);
      }
    }
  }, [selectedSource, selectedDest, freightMode]);

  const handleClearRoute = useCallback(() => {
    setSelectedSource(null);
    setSelectedDest(null);
    setAllRoutes([]);
    setActiveRouteIndex(0);
    setIsNavigating(false);
  }, []);

  // Called when Routy chat generates a route
  const handleRoutyRoute = useCallback(({ source, destination, mode }) => {
    setSelectedSource(source);
    setSelectedDest(destination);
    // Map agent mode to freight mode
    const modeMap = { sea: 'ship', air: 'air', rail: 'rail', truck: 'truck', road: 'truck' };
    setFreightMode(modeMap[mode] || freightMode);
    setShowRouty(false);
  }, [freightMode]);

  // Called when Routy saves a route
  const handleRoutySaved = useCallback(() => {
    setSavedRoutes(loadRouteHistory());
  }, []);

  // Load a saved route from My Routes
  const handleLoadSavedRoute = useCallback((r) => {
    if (r.source && r.dest) {
      setSelectedSource(r.source);
      setSelectedDest(r.dest);
      const modeMap = { sea: 'ship', air: 'air', rail: 'rail', truck: 'truck', road: 'truck' };
      setFreightMode(modeMap[r.mode] || 'ship');
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem('routeguardian_routes');
    setSavedRoutes([]);
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
        {/* Mode selector + Routy button */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>
              Freight Mode
            </p>
            <button
              onClick={() => setShowRouty(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-[10px] font-bold"
              style={{ background: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.12)'; }}
            >
              <Bot size={11} className="animate-pulse" />
              Ask Routy
            </button>
          </div>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#0B1220' }}>
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

          {/* My Routes section (always visible when routes exist) */}
          <MyRoutesSection
            routes={savedRoutes}
            onLoad={handleLoadSavedRoute}
            onClear={handleClearHistory}
            isExpanded={showMyRoutes}
            onToggle={() => setShowMyRoutes(v => !v)}
          />

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

                {/* AI Recommendation card */}
                <AnimatePresence>
                  {(aiRec || aiRecLoading) && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mx-3 mb-1 p-3 rounded-xl"
                      style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.22)' }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(59,130,246,0.18)' }}>
                          <Bot size={10} style={{ color: '#3B82F6' }} className={aiRecLoading ? 'animate-pulse' : ''} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#3B82F6' }}>
                            AI Route Analysis
                          </p>
                          {aiRecLoading ? (
                            <p className="text-[10px]" style={{ color: '#6B7280' }}>Analyzing routes with Gemini…</p>
                          ) : aiRec ? (
                            <>
                              <p className="text-[11px] font-semibold leading-snug" style={{ color: '#E2E8F0' }}>
                                {aiRec.reasoning}
                              </p>
                              {aiRec.tradeoff && (
                                <p className="text-[10px] mt-1 italic" style={{ color: '#6B7280' }}>
                                  {aiRec.tradeoff}
                                </p>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: isActive ? '#3B82F6' : '#374151' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: isActive ? '#3B82F6' : '#6B7280' }}>
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
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black" style={sevBadgeStyle}>
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
                                <div key={i} className="p-3 rounded-xl border"
                                  style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                                  <p className="text-[11px] font-semibold leading-snug mb-2 line-clamp-2" style={{ color: '#FCA5A5' }}>
                                    {news.title}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                      {news.categories?.slice(0, 2).map((cat, ci) => (
                                        <span key={ci} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase"
                                          style={{ background: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
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
              /* ── EMPTY STATE — only Routy CTA ── */
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="px-4 py-5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowRouty(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all"
                    style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.15)' }}>
                      <Bot size={18} style={{ color: '#3B82F6' }} className="animate-pulse" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-black" style={{ color: '#F9FAFB' }}>Chat with Routy AI</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#6B7280' }}>
                        Describe your shipment in plain English or by voice
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: '#3B82F6', flexShrink: 0 }} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══ MAP + ROUTY PANEL ══ */}
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
          aiRecommendation={aiRec}
        />

        {/* Routy chat panel — slides over the map */}
        <RoutyChatPanel
          isOpen={showRouty}
          onClose={() => setShowRouty(false)}
          onRouteGenerated={handleRoutyRoute}
          freightMode={freightMode}
          onRouteSaved={handleRoutySaved}
        />
      </div>
    </div>
  );
};

export default Dashboard;
