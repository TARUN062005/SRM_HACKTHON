import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import RoutyChatPanel, { loadRouteHistory, saveRouteToHistory } from '../components/RoutyChatPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor, Plane, Truck,
  CloudRain, Wind, Sun, Zap, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, ExternalLink, X,
  Play, Square, Clock, Activity,
  Bot, History, Trash2, ChevronRight, Radio, Newspaper,
} from 'lucide-react';
import toast from 'react-hot-toast';

const getFavicon = (url) => {
  try {
    if (!url) return null;
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  } catch (e) {
    return null;
  }
};


const FREIGHT_MODES = [
  { label: 'Sea',    value: 'ship',  Icon: Anchor },
  { label: 'Air',    value: 'air',   Icon: Plane  },
  { label: 'Road',   value: 'truck', Icon: Truck  },
];

const ROUTE_LABELS = ['Optimal Route', 'Alternate 1', 'Alternate 2'];

const MODE_ICONS = { sea: Anchor, ship: Anchor, air: Plane, truck: Truck, road: Truck };
const MODE_COLORS = { sea: '#00C2FF', ship: '#00C2FF', air: '#00C2FF', truck: '#00C2FF', road: '#00C2FF' };

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
  MEDIUM:   { card: 'rgba(245,158,11,0.08)', border: '#F59E0B', dot: '#F59E0B', badge: 'rgba(245,158,11,0.2)', badgeText: '#F59E0B', text: '#FCD34D' },
  MODERATE: { card: 'rgba(56,189,248,0.06)', border: '#38BDF8', dot: '#38BDF8', badge: 'rgba(56,189,248,0.15)', badgeText: '#38BDF8', text: '#7DD3FC' },
  LOW:      { card: 'rgba(34,197,94,0.08)', border: '#22C55E', dot: '#22C55E', badge: 'rgba(34,197,94,0.2)', badgeText: '#22C55E', text: '#A7F3D0' },
  STABLE:   { card: 'rgba(34,197,94,0.08)', border: '#22C55E', dot: '#22C55E', badge: 'rgba(34,197,94,0.2)', badgeText: '#22C55E', text: '#A7F3D0' },
};

const DISCREPANCY_REASONS = {
  'Sea->Air': 'Lower geopolitical exposure and conflict zone bypass detected.',
  'Road->Air': 'Air freight offers direct transit bypassing border closures, road blocks, or severe local infrastructure hazards.',
  'Sea->Road': 'Direct land corridor avoids high-risk maritime chokepoints and sea piracy zones.',
  'Air->Sea': 'Bulk sea lane transit offers lower risk index and higher transport efficiency for this route.',
  'Road->Sea': 'Maritime transit provides a secure corridor bypassing active land conflict zones or border disruptions.',
  'Air->Road': 'Terrestrial shipping route presents stable local safety metrics and lower weather disruption index.'
};

const mapModeName = (m) => {
  if (!m) return 'Unknown';
  const l = m.toLowerCase();
  if (l === 'sea' || l === 'ship') return 'Sea';
  if (l === 'air') return 'Air';
  if (l === 'road' || l === 'truck') return 'Road';
  return m;
};

const ACCENT = 'var(--accent)';
const ACCENT_SOFT = 'rgba(0,194,255,0.12)';
const ACCENT_BORDER = 'rgba(0,194,255,0.28)';
const SURFACE = 'var(--surface)';
const SURFACE_BORDER = 'var(--border)';

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
    <div className="px-3 pb-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-2 transition-all"
        onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <div className="flex items-center gap-2">
          <History size={12} style={{ color: 'var(--secondary-accent)' }} />
          <span className="text-xs font-bold" style={{ color: '#F9FAFB' }}>My Routes</span>
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black" style={{ background: 'rgba(124,58,237,0.2)', color: 'var(--secondary-accent)' }}>
            {routes.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onClear(); }}
            className="p-1 rounded transition-all" title="Clear history"
            style={{ color: '#6B7280' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
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
                const modeColor = MODE_COLORS[r.mode] || ACCENT;
                const sev = r.severity;
                const sevColor = sev === 'CRITICAL' ? '#EF4444' : sev === 'CAUTION' ? '#F59E0B' : '#22C55E';
                return (
                  <motion.button
                    key={r.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onLoad(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                    style={{ background: 'rgba(15,23,42,0.85)', border: `1px solid ${SURFACE_BORDER}` }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(148,163,184,0.35)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = SURFACE_BORDER}
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
                    <ChevronRight size={11} style={{ color: 'rgba(148,163,184,0.35)', flexShrink: 0 }} />
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
  const [modeResetToken, setModeResetToken]     = useState(0);
  const [replayingShipment, setReplayingShipment] = useState(null);
  const [latestIncidents, setLatestIncidents]   = useState([]);
  const [centerMapTo, setCenterMapTo]           = useState(null);
  const [originalAnalysis, setOriginalAnalysis] = useState(null);
  const [isMissionControlOpen, setIsMissionControlOpen] = useState(false);
  const [activeNewsModal, setActiveNewsModal] = useState(null);
  const [modalContent, setModalContent] = useState('');
  const [modalContentLoading, setModalContentLoading] = useState(false);

  useEffect(() => {
    const handleOpenNews = async (e) => {
      const alert = e.detail;
      setActiveNewsModal(alert);
      setModalContent('');
      if (!alert.source_url) {
        setModalContent(alert.title);
        return;
      }
      
      try {
        setModalContentLoading(true);
        const res = await axios.get('/api/ai/article-content', {
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
    
    window.addEventListener('open-news-modal', handleOpenNews);
    return () => window.removeEventListener('open-news-modal', handleOpenNews);
  }, []);

  const parsedOriginalReport = useMemo(() => {
    if (!originalAnalysis?.aiReport) return null;
    try {
      return typeof originalAnalysis.aiReport === 'string'
        ? JSON.parse(originalAnalysis.aiReport)
        : originalAnalysis.aiReport;
    } catch (e) {
      console.warn('Failed to parse original AI report:', e);
      return null;
    }
  }, [originalAnalysis]);

  const savedShipmentKeyRef = useRef('');

  const activeRoute    = allRoutes[activeRouteIndex] || allRoutes[0];
  const intel          = activeRoute?.intelligence;

  // Load route history from the backend Prisma store!
  useEffect(() => {
    const fetchSavedShipments = async () => {
      try {
        const res = await axios.get('/api/ai/shipments');
        if (res.data?.success) {
          setSavedRoutes(res.data.shipments.map(s => ({
            id: s.id,
            origin: s.origin,
            destination: s.destination,
            mode: s.mode === 'road' ? 'truck' : s.mode === 'sea' ? 'ship' : 'air',
            distance: s.distance,
            eta: s.eta,
            riskScore: s.riskScore,
            safetyScore: s.safetyScore,
            routeGeometry: s.routeGeometry,
            timestamp: new Date(s.createdAt).getTime(),
            severity: s.riskScore >= 68 ? 'CRITICAL' : s.riskScore >= 35 ? 'CAUTION' : 'STABLE'
          })));
        }
      } catch (err) {
        console.warn('Failed to load shipments from backend, falling back to local history:', err.message);
        setSavedRoutes(loadRouteHistory());
      }
    };

    const fetchLatestIncidents = async () => {
      try {
        const res = await axios.get('/api/ai/alerts');
        if (res.data?.success) {
          setLatestIncidents(res.data.alerts || []);
        }
      } catch (err) {
        console.warn('Failed to load global alerts for gallery:', err.message);
      }
    };

    fetchSavedShipments();
    fetchLatestIncidents();

    // Check for replayed shipment from sessionStorage
    const pendingStr = sessionStorage.getItem('pendingRoute');
    if (pendingStr) {
      sessionStorage.removeItem('pendingRoute');
      try {
        const pending = JSON.parse(pendingStr);
        console.log('[REPLAY] Loaded pending replay shipment:', pending);
        
        // Restore coordinates and mode
        const coords = pending.routeGeometry?.coordinates || [];
        if (coords.length >= 2) {
          const originCoords = coords[0];
          const destCoords = coords[coords.length - 1];
          
          setSelectedSource({
            lat: originCoords[1],
            lon: originCoords[0],
            display_name: pending.origin
          });
          setSelectedDest({
            lat: destCoords[1],
            lon: destCoords[0],
            display_name: pending.destination
          });
          
          const modeMap = { sea: 'ship', ship: 'ship', road: 'truck', truck: 'truck', air: 'air' };
          setFreightMode(modeMap[pending.mode] || 'ship');
          setOriginalAnalysis(pending);
          setReplayingShipment(pending);
          setIsMissionControlOpen(false);
        }
      } catch (err) {
        console.error('Failed to parse replay shipment:', err);
      }
    }
  }, []);

  useEffect(() => {
    const handleToggle = () => {
      setIsMissionControlOpen(prev => !prev);
    };
    window.addEventListener("toggleNewRoute", handleToggle);
    return () => window.removeEventListener("toggleNewRoute", handleToggle);
  }, []);

  // Automatically save new successful routes
  useEffect(() => {
    if (selectedSource && selectedDest && activeRoute && intel && intel.riskScore != null && !intel.loading && !intel.error && !replayingShipment && !originalAnalysis) {
      const key = `${selectedSource.lat}-${selectedSource.lon || selectedSource.lng}-${selectedDest.lat}-${selectedDest.lon || selectedDest.lng}-${freightMode}`;
      if (savedShipmentKeyRef.current !== key) {
        savedShipmentKeyRef.current = key;
        
        const saveShipment = async () => {
          try {
            console.log('[Dashboard] Automatically saving shipment to MongoDB...');
            const m = freightMode === 'ship' ? 'sea' : freightMode === 'truck' ? 'road' : 'air';
            await axios.post('/api/ai/shipment', {
              origin: selectedSource.display_name,
              destination: selectedDest.display_name,
              mode: m,
              distance: activeRoute.distance,
              eta: activeRoute.duration,
              riskScore: intel.riskScore,
              safetyScore: intel.safetyScore,
              routeGeometry: activeRoute.geometry,
              cargo: 'General Cargo',
              priority: 'standard',
              date: 'ASAP',
              time: '12:00',
              weatherSummary: intel.aiReport?.weatherImpact || 'LOW',
              riskSummary: intel.recommendedMode || 'low-risk',
              aiReport: intel.aiReport
            });
            
            // Refresh saved routes list
            const res = await axios.get('/api/ai/shipments');
            if (res.data?.success) {
              setSavedRoutes(res.data.shipments.map(s => ({
                id: s.id,
                origin: s.origin,
                destination: s.destination,
                mode: s.mode === 'road' ? 'truck' : s.mode === 'sea' ? 'ship' : 'air',
                distance: s.distance,
                eta: s.eta,
                riskScore: s.riskScore,
                safetyScore: s.safetyScore,
                routeGeometry: s.routeGeometry,
                timestamp: new Date(s.createdAt).getTime(),
                severity: s.riskScore >= 68 ? 'CRITICAL' : s.riskScore >= 35 ? 'CAUTION' : 'STABLE',
                cargo: s.cargo,
                priority: s.priority,
                date: s.date,
                time: s.time,
                weatherSummary: s.weatherSummary,
                riskSummary: s.riskSummary,
                aiReport: s.aiReport
              })));
            }
          } catch (err) {
            console.warn('[Dashboard] Failed to save shipment to backend:', err.message);
          }
        };
        saveShipment();
      }
    }
  }, [selectedSource, selectedDest, freightMode, activeRoute, intel, replayingShipment, originalAnalysis]);

  const vehicleMode = freightMode;

  const handleRouteData = useCallback(async ({ allRoutes: routes, activeRouteIndex: idx }) => {
    setAllRoutes(routes || []);
    setActiveRouteIndex(idx ?? 0);
    setAiRec(null);
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
    setOriginalAnalysis(null);
  }, []);

  const handleModeChange = useCallback((value) => {
    if (value === freightMode) return;
    handleClearRoute();
    setAiRec(null);
    setShowRouty(false);
    setFreightMode(value);
    setModeResetToken(t => t + 1);
    setOriginalAnalysis(null);
  }, [freightMode, handleClearRoute]);

  // Called when Routy chat generates a route
  const handleRoutyRoute = useCallback(({ source, destination, mode, shipment }) => {
    setSelectedSource(source);
    setSelectedDest(destination);
    // Map agent mode to freight mode
    const modeMap = { sea: 'ship', air: 'air', truck: 'truck', road: 'truck' };
    handleModeChange(modeMap[mode] || freightMode);
    setShowRouty(false);
    setIsMissionControlOpen(false);
    if (shipment) {
      setOriginalAnalysis(shipment);
    }
  }, [freightMode, handleModeChange]);

  // Called when Routy saves a route
  const handleRoutySaved = useCallback(() => {
    setSavedRoutes(loadRouteHistory());
  }, []);

  // Load a saved route from My Routes
  const handleLoadSavedRoute = useCallback((r) => {
    const coords = r.routeGeometry?.coordinates || [];
    if (coords.length >= 2) {
      const originCoords = coords[0];
      const destCoords = coords[coords.length - 1];
      setSelectedSource({
        lat: originCoords[1],
        lon: originCoords[0],
        display_name: r.origin
      });
      setSelectedDest({
        lat: destCoords[1],
        lon: destCoords[0],
        display_name: r.destination
      });
      const modeMap = { sea: 'ship', air: 'air', truck: 'truck', road: 'truck' };
      handleModeChange(modeMap[r.mode] || 'ship');
      setIsMissionControlOpen(false);
    } else if (r.source && r.dest) {
      setSelectedSource(r.source);
      setSelectedDest(r.dest);
      const modeMap = { sea: 'ship', air: 'air', truck: 'truck', road: 'truck' };
      handleModeChange(modeMap[r.mode] || 'ship');
      setIsMissionControlOpen(false);
    }
  }, [handleModeChange]);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem('routeguardian_routes');
    setSavedRoutes([]);
  }, []);

  const hasCritical    = intel?.waypointReports?.some(w => w.severity === 'CRITICAL');
  const globalSeverity = hasCritical ? 'CRITICAL'
    : intel?.waypointReports?.some(w => w.severity === 'CAUTION') ? 'CAUTION' : 'STABLE';

  const sevBadgeStyle = globalSeverity === 'CRITICAL'
    ? { bg: 'rgba(255,92,122,0.16)', color: 'var(--danger)' }
    : globalSeverity === 'CAUTION'
    ? { bg: 'rgba(255,181,71,0.18)', color: 'var(--warning)' }
    : { bg: 'rgba(0,255,174,0.16)', color: 'var(--success)' };

  return (
    <div className="flex h-full overflow-hidden relative" style={{ background: SURFACE }}>

      {/* ══ LEFT CONTROL PANEL ══ */}
      {allRoutes.length > 0 && (
        <div
          className="h-full flex flex-col flex-shrink-0 overflow-hidden"
          style={{ width: 380, background: SURFACE, borderRight: `1px solid ${SURFACE_BORDER}` }}
        >
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                {/* 1. ROUTE SUMMARY */}
                <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>
                      1. Route Summary
                    </p>
                    <button
                      onClick={handleClearRoute}
                      className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                      style={{ color: '#6B7280' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="flex flex-col items-center mt-1 gap-0.5 flex-shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 6px rgba(0,255,174,0.5)' }} />
                        <div className="w-px h-4" style={{ background: SURFACE_BORDER }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--danger)', boxShadow: '0 0 6px rgba(255,92,122,0.5)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-extrabold truncate leading-tight text-white">
                          {selectedSource?.display_name?.split(',')[0] || 'Origin'}
                        </p>
                        <p className="text-[11px] font-extrabold truncate leading-tight mt-1 text-slate-400">
                          {selectedDest?.display_name?.split(',')[0] || 'Destination'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Replay metadata */}
                  {originalAnalysis && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2 mt-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bot size={11} style={{ color: 'var(--accent)' }} className="animate-pulse" />
                        <span className="text-[9px] font-black uppercase text-cyan-400">Original Shipment Details</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] leading-relaxed">
                        <div>Cargo: <span className="text-slate-200 font-bold">{originalAnalysis.cargo || 'General Cargo'}</span></div>
                        <div>Priority: <span className="text-slate-200 font-bold capitalize">{originalAnalysis.priority || 'Standard'}</span></div>
                        <div>Ship Date: <span className="text-slate-200 font-bold">{originalAnalysis.date || 'ASAP'}</span></div>
                        <div>Time: <span className="text-slate-200 font-bold">{originalAnalysis.time || '12:00'}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Route selection cards */}
                  <div className="space-y-1.5 mt-2">
                    {allRoutes.slice(0, 3).map((route, idx) => {
                      const isActive = idx === activeRouteIndex;
                      return (
                        <motion.button
                          key={idx}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setActiveRouteIndex(idx)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                          style={{
                            border: isActive ? '1px solid rgba(0,194,255,0.45)' : `1px solid ${SURFACE_BORDER}`,
                            background: isActive ? 'rgba(0,194,255,0.08)' : 'rgba(15,23,42,0.9)',
                          }}
                        >
                          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: isActive ? ACCENT : 'rgba(148,163,184,0.2)' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: isActive ? ACCENT : '#6B7280' }}>
                              {route.summary || ROUTE_LABELS[idx] || `Route ${idx + 1}`}
                            </p>
                            <div className="flex items-baseline gap-2">
                              {freightMode === 'ship' ? (
                                <>
                                  <span className="text-base font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                    {(route.duration / 86400).toFixed(1)}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-500">days</span>
                                </>
                              ) : freightMode === 'air' ? (
                                <>
                                  <span className="text-base font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                    {(route.duration / 3600).toFixed(1)}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-500">hrs</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-base font-black" style={{ color: isActive ? '#F9FAFB' : '#9CA3AF' }}>
                                    {(route.duration / 60).toFixed(0)}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-500">min</span>
                                </>
                              )}
                              <span style={{ color: 'rgba(148,163,184,0.35)' }}>·</span>
                              <span className="text-xs font-semibold text-slate-400">
                                {(route.distance / 1000).toFixed(0)} km
                              </span>
                            </div>
                          </div>
                          {isActive && <CheckCircle size={14} style={{ color: ACCENT }} className="flex-shrink-0" />}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Simulation controls */}
                  <div className="mt-1">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-850">
                      <button
                        onClick={() => setIsNavigating(v => !v)}
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: isNavigating ? 'var(--danger)' : ACCENT,
                          boxShadow: isNavigating ? '0 0 12px rgba(255,92,122,0.4)' : '0 0 12px rgba(0,194,255,0.4)',
                        }}
                      >
                        {isNavigating
                          ? <Square size={10} className="text-white" fill="white" />
                          : <Play size={11} className="text-white translate-x-0.5" fill="white" />}
                      </button>
                      <div className="flex-1">
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>
                          <span>{isNavigating ? 'Simulating…' : 'Simulate Route'}</span>
                          <span style={{ color: ACCENT }}>×{simSpeed}</span>
                        </div>
                        <input
                          type="range" min="1" max="10" step="1" value={simSpeed}
                          onChange={e => setSimSpeed(Number(e.target.value))}
                          className="w-full h-1 rounded-full cursor-pointer"
                          style={{ accentColor: ACCENT }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. AI ROUTE INTELLIGENCE REPORT */}
                <div className="p-4 flex flex-col gap-3.5" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-cyan-400">
                      2. AI Route Intelligence Report
                    </p>
                    {originalAnalysis && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-900/35 text-cyan-400 border border-cyan-800/50">
                        Replay Mode
                      </span>
                    )}
                  </div>

                  {intel?.loading ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
                      <span className="text-xs text-slate-400 font-bold">Generating AI Report...</span>
                    </div>
                  ) : intel?.error ? (
                    <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
                      Executive report temporarily unavailable.
                    </div>
                  ) : intel?.aiReport ? (
                    <div className="space-y-3">
                      {/* Executive Summary Card */}
                      <div className="p-3.5 rounded-2xl border border-cyan-500/25 bg-cyan-900/10 flex gap-2.5">
                        <Bot size={16} className="text-cyan-400 flex-shrink-0 mt-0.5 animate-pulse" />
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-200">
                          {intel.aiReport.executiveSummary}
                        </p>
                      </div>

                      {/* Side-by-Side metrics comparison */}
                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 space-y-3">
                        <div className="flex flex-col gap-1 pb-2 border-b border-slate-850">
                          <span className="text-[9px] font-bold uppercase text-slate-500">Route</span>
                          <span className="text-xs font-black text-white truncate">
                            {selectedSource?.display_name?.split(',')[0]} → {selectedDest?.display_name?.split(',')[0]}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-850 text-xs">
                          <div>
                            <span className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">Mode</span>
                            <span className="font-extrabold text-white capitalize">{freightMode === 'ship' ? 'Sea' : freightMode === 'truck' ? 'Road' : 'Air'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">Distance</span>
                            <span className="font-extrabold text-white">{(activeRoute.distance / 1000).toFixed(0)} km</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">ETA</span>
                            <span className="font-extrabold text-white">
                              {freightMode === 'ship' ? `${(activeRoute.duration / 86400).toFixed(1)} days` : freightMode === 'air' ? `${(activeRoute.duration / 3600).toFixed(1)} hrs` : `${(activeRoute.duration / 60).toFixed(0)} mins`}
                            </span>
                          </div>
                        </div>

                        {originalAnalysis ? (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            {/* Original Column */}
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-850 space-y-2">
                              <span className="text-[8px] font-black uppercase text-slate-500 block mb-1">Original Analysis</span>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Risk Score:</span>
                                  <span className="font-extrabold text-white">{originalAnalysis.riskScore}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Safety Score:</span>
                                  <span className="font-extrabold text-white">{originalAnalysis.safetyScore}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Weather:</span>
                                  <span className="font-extrabold text-white capitalize">{originalAnalysis.weatherSummary?.toLowerCase()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Geopolitical:</span>
                                  <span className="font-extrabold text-white capitalize">{parsedOriginalReport?.geopoliticalImpact?.toLowerCase() || 'low'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Decision:</span>
                                  <span className="font-extrabold text-white capitalize">{parsedOriginalReport?.operationalRecommendation || 'Proceed'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Current Column */}
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-cyan-900/30 space-y-2">
                              <span className="text-[8px] font-black uppercase text-cyan-400 block mb-1 animate-pulse">Current Analysis</span>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Risk Score:</span>
                                  <span className={`font-extrabold ${intel.riskScore >= 68 ? 'text-red-400' : intel.riskScore >= 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {intel.riskScore}/100
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Safety Score:</span>
                                  <span className={`font-extrabold ${intel.safetyScore < 35 ? 'text-red-400' : intel.safetyScore < 68 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {intel.safetyScore}/100
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Weather:</span>
                                  <span className={`font-extrabold ${intel.aiReport.weatherImpact === 'HIGH' ? 'text-red-400' : intel.aiReport.weatherImpact === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {intel.aiReport.weatherImpact}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Geopolitical:</span>
                                  <span className={`font-extrabold ${intel.aiReport.geopoliticalImpact === 'HIGH' ? 'text-red-400' : intel.aiReport.geopoliticalImpact === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {intel.aiReport.geopoliticalImpact}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Decision:</span>
                                  <span className={`font-extrabold ${intel.aiReport.operationalRecommendation === 'Reroute' ? 'text-red-400' : intel.aiReport.operationalRecommendation === 'Delay' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {intel.aiReport.operationalRecommendation}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1 text-xs">
                            {/* Risk Score */}
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Risk Score</span>
                              <span className={`font-extrabold ${intel.riskScore >= 68 ? 'text-red-400' : intel.riskScore >= 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {intel.riskScore}/100
                              </span>
                            </div>

                            {/* Safety Score */}
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Safety Score</span>
                              <span className={`font-extrabold ${intel.safetyScore < 35 ? 'text-red-400' : intel.safetyScore < 68 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {intel.safetyScore}/100
                              </span>
                            </div>

                            {/* Weather Impact */}
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Weather Impact</span>
                              <span className={`font-extrabold ${intel.aiReport.weatherImpact === 'HIGH' ? 'text-red-400' : intel.aiReport.weatherImpact === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {intel.aiReport.weatherImpact}
                              </span>
                            </div>

                            {/* Geopolitical Impact */}
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Geopolitical Impact</span>
                              <span className={`font-extrabold ${intel.aiReport.geopoliticalImpact === 'HIGH' ? 'text-red-400' : intel.aiReport.geopoliticalImpact === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {intel.aiReport.geopoliticalImpact}
                              </span>
                            </div>

                            {/* Operational Recommendation */}
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Operational Decision</span>
                              <span className={`font-extrabold ${intel.aiReport.operationalRecommendation === 'Reroute' ? 'text-red-400' : intel.aiReport.operationalRecommendation === 'Delay' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {intel.aiReport.operationalRecommendation}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Affected Regions */}
                      {intel.aiReport.affectedRegions?.length > 0 && (
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs space-y-1">
                          <span className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Affected Regions</span>
                          <p className="font-semibold text-slate-300 leading-normal">
                            {intel.aiReport.affectedRegions.join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Top Risks */}
                      {intel.aiReport.topRisks?.length > 0 && (
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs space-y-1">
                          <span className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Top Risks Identified</span>
                          <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-300 font-semibold leading-relaxed">
                            {intel.aiReport.topRisks.map((risk, i) => (
                              <li key={i}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* 3. RISK ENGINE ASSESSMENT */}
                <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                    3. Risk Engine Assessment
                  </p>
                  
                  {intel?.loading ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
                      <span className="text-xs text-slate-400 font-bold">Waking Geo Risk Engine...</span>
                    </div>
                  ) : intel?.error ? (
                    <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
                      Risk intelligence temporarily unavailable.
                    </div>
                  ) : intel ? (
                    <div className="space-y-3">
                      {/* Gauge / Score row */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center">
                          <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Risk Score</span>
                          <span className="text-base font-black text-white">{intel.riskScore != null ? `${intel.riskScore} / 100` : 'N/A'}</span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center">
                          <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Safety Score</span>
                          <span className="text-base font-black text-white">{intel.safetyScore != null ? `${intel.safetyScore} / 100` : 'N/A'}</span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center col-span-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5 block">Risk Level</span>
                              <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded" style={{
                                background: (SEV_STYLES[intel.severity?.toUpperCase()] || SEV_STYLES.LOW).badge,
                                color: (SEV_STYLES[intel.severity?.toUpperCase()] || SEV_STYLES.LOW).badgeText
                              }}>
                                {intel.severity || 'LOW'}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5 block">Alerts Count</span>
                              <span className="text-sm font-black text-white">{intel.alertsCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Mode details */}
                      {(() => {
                        const currentModeMapped = mapModeName(freightMode);
                        const recommendedModeMapped = mapModeName(intel.recommendedMode);
                        const isDiscrepant = currentModeMapped !== recommendedModeMapped;
                        return (
                          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Current Mode</span>
                              <span className="font-extrabold uppercase text-white">{currentModeMapped}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-400">Recommended Mode</span>
                              {originalAnalysis ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 font-medium capitalize line-through">{originalAnalysis.riskSummary?.toLowerCase() || 'sea'}</span>
                                  <ChevronRight size={10} className="text-slate-600" />
                                  <span className={`font-extrabold uppercase ${isDiscrepant ? 'text-amber-400' : 'text-cyan-400'}`}>
                                    {recommendedModeMapped}
                                  </span>
                                </div>
                              ) : (
                                <span className={`font-extrabold uppercase ${isDiscrepant ? 'text-amber-400' : 'text-cyan-400'}`}>
                                  {recommendedModeMapped}
                                </span>
                              )}
                            </div>
                            {isDiscrepant && (
                              <div className="pt-2.5 border-t border-slate-800/80 space-y-1">
                                <span className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Reason</span>
                                <p className="text-[11px] text-amber-200 leading-relaxed font-semibold">
                                  {DISCREPANCY_REASONS[`${currentModeMapped}->${recommendedModeMapped}`] || 'Lower geopolitical exposure and threat-zone bypass detected.'}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>

                {/* 4. WEATHER ALONG ROUTE */}
                {!intel?.loading && intel?.waypointReports?.length > 0 && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                      4. Weather Along Route
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {intel.waypointReports.map((wp, i) => {
                        const WIcon = getWeatherIcon(wp.weather);
                        const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                        
                        return (
                          <div key={i} className="flex-shrink-0 w-[114px] bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col items-center text-center">
                            <span className="text-[8px] font-black uppercase tracking-wider text-cyan-400 mb-1">
                              {i === 0 ? 'Origin' : i === intel.waypointReports.length - 1 ? 'Destination' : `Transit ${i}`}
                            </span>
                            <WIcon size={18} style={{ color: wp.severity === 'CRITICAL' ? '#EF4444' : wp.severity === 'CAUTION' ? '#F59E0B' : '#00C2FF' }} className="my-1.5" />
                            <p className="text-[10px] font-bold text-white truncate w-full">{wp.place?.split(',')[0]}</p>
                            <p className="text-[9px] text-slate-400 font-semibold mt-0.5">{parts[1] || `${wp.temp}°C`}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. ACTIVE THREATS */}
                {!intel?.loading && intel?.events?.length > 0 && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none" style={{ color: 'var(--danger)' }}>
                      5. Active Threats
                    </p>
                    <div className="space-y-2">
                      {intel.events
                        .sort((a, b) => (b.intensity || 0) - (a.intensity || 0))
                        .slice(0, 3)
                        .map((news, i) => {
                          const severity = news.intensity >= 0.5 ? 'CRITICAL' : news.intensity >= 0.25 ? 'HIGH' : 'MODERATE';
                          const style = SEV_STYLES[severity] || SEV_STYLES.MODERATE;
                          return (
                            <div key={i} className="p-3 rounded-xl border flex flex-col gap-1.5 cursor-pointer hover:border-red-500/55 transition-colors"
                              style={{ background: 'rgba(255,92,122,0.06)', borderColor: 'rgba(255,92,122,0.18)' }}
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('open-news-modal', { 
                                  detail: {
                                    title: news.headline,
                                    source_url: news.source_url,
                                    category: news.label || 'threat',
                                    published: news.published_at,
                                    image_url: news.image_url,
                                    publisher: news.publisher,
                                    severity: severity,
                                    confidence: news.confidence,
                                    intensity: news.intensity
                                  } 
                                }));
                              }}
                            >
                              {news.image_url && (
                                <a href={news.source_url || '#'} target={news.source_url ? "_blank" : undefined} rel="noreferrer" onClick={e => e.stopPropagation()} className="block overflow-hidden rounded-lg mb-1.5">
                                  <img src={news.image_url} alt={news.headline} loading="lazy" className="w-full h-24 object-cover hover:scale-105 transition-transform duration-300" />
                                </a>
                              )}
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide flex-shrink-0"
                                  style={{ background: style.card, color: style.dot, borderColor: style.border, border: '1px solid' }}>
                                  {severity} · {news.label || 'threat'}
                                </span>
                                <span className="text-[9px] text-slate-500 font-bold truncate">{news.publisher}</span>
                              </div>
                              <p className="text-[11px] font-semibold leading-snug" style={{ color: '#FCA5A5' }}>
                                {news.headline}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 6. INTELLIGENCE NEWS FEED */}
                {!intel?.loading && intel?.events?.length > 0 && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                      6. Intelligence News Feed ({intel.events.length})
                    </p>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {intel.events.map((news, i) => {
                        const severity = news.intensity >= 0.5 ? 'CRITICAL' : news.intensity >= 0.25 ? 'HIGH' : 'MODERATE';
                        const style = SEV_STYLES[severity] || SEV_STYLES.MODERATE;
                        const fav = getFavicon(news.source_url || news.link);
                        return (
                          <div key={i} className="p-3.5 rounded-xl border flex flex-col gap-2 transition-all hover:border-slate-700 cursor-pointer animate-fade-in"
                            style={{ background: 'rgba(15,23,42,0.9)', borderColor: SURFACE_BORDER }}
                            onClick={() => {
                              if (news.location && news.location.length >= 2) {
                                setCenterMapTo([news.location[0], news.location[1]]);
                              }
                              window.dispatchEvent(new CustomEvent('open-news-modal', { 
                                detail: {
                                  title: news.headline,
                                  source_url: news.source_url,
                                  category: news.label || 'threat',
                                  published: news.published_at,
                                  image_url: news.image_url,
                                  publisher: news.publisher,
                                  severity: severity,
                                  confidence: news.confidence,
                                  intensity: news.intensity
                                } 
                              }));
                            }}
                          >
                            {news.image_url ? (
                              <a href={news.source_url || '#'} target={news.source_url ? "_blank" : undefined} rel="noreferrer" onClick={e => e.stopPropagation()} className={news.source_url ? "block overflow-hidden rounded-lg" : "block overflow-hidden rounded-lg pointer-events-none"}>
                                <img src={news.image_url} alt={news.headline} loading="lazy" className="w-full h-32 object-cover hover:scale-105 transition-transform duration-300" />
                              </a>
                            ) : (
                              <div className="w-full h-20 bg-slate-800/40 rounded-lg flex flex-col items-center justify-center text-slate-500 gap-1.5 border border-slate-800/50">
                                {fav ? (
                                  <img src={fav} alt={news.publisher} className="w-7 h-7 rounded-lg" onError={e => { e.target.style.display = 'none'; }} />
                                ) : (
                                  <Radio size={14} className="opacity-40 animate-pulse" />
                                )}
                                <span className="text-[8px] uppercase font-black tracking-wider opacity-60">Favicon Preview</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide"
                                style={{ background: style.card, color: style.dot, borderColor: style.border, border: '1px solid' }}>
                                {severity} · {news.label || 'threat'}
                              </span>
                              <span className="text-[9px] text-slate-400 font-extrabold truncate">{news.publisher}</span>
                            </div>
                            <p className="text-[11px] font-semibold leading-snug text-white">
                              {news.headline}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 py-1 text-[9px] font-bold text-slate-400 border-t border-b border-slate-800/60 my-1">
                              <div>Confidence: <span className="text-white font-extrabold">{news.confidence != null ? `${Math.round(news.confidence * 100)}%` : 'N/A'}</span></div>
                              <div>Severity: <span className="text-white font-extrabold">{news.intensity != null ? `${Math.round(news.intensity * 100)}%` : 'N/A'}</span></div>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-[9px]">
                              <span className="text-slate-500 font-bold">
                                {news.published_at ? new Date(news.published_at).toLocaleDateString() : ''}
                              </span>
                              {news.source_url && (
                                <a href={news.source_url} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-white bg-cyan-600 hover:bg-cyan-500 transition-all flex items-center gap-1 shadow-md">
                                  Read Article <ExternalLink size={9} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 7. RECOMMENDED ACTIONS */}
                {!intel?.loading && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                      7. Recommended Actions
                    </p>
                    
                    {/* Operational Recommendation Status Card */}
                    {intel?.aiReport?.operationalRecommendation && (() => {
                      const rec = intel.aiReport.operationalRecommendation;
                      const isReroute = rec === 'Reroute';
                      const isDelay = rec === 'Delay';
                      
                      const title = isReroute ? 'Action Required: Reroute' : isDelay ? 'Caution Advised: Delay Transit' : 'Proceed with Transit';
                      const color = isReroute ? '#EF4444' : isDelay ? '#F59E0B' : '#22C55E';
                      const bg = isReroute ? 'rgba(239,68,68,0.1)' : isDelay ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';
                      const border = isReroute ? 'rgba(239,68,68,0.25)' : isDelay ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)';
                      
                      const details = isReroute 
                        ? 'Critical threat detected along path (active conflict zone, port strike, or severe weather). Operations command instructs immediately rerouting to the recommended mode or alternative waypoint chain.'
                        : isDelay 
                        ? 'Moderate threat detected along path (severe weather warning or border delay). Operators are recommended to temporarily delay departure or schedule secondary checkins until threat clears.'
                        : 'No critical threat or severe weather detected. Proceed with standard logistics schedule. Maintain standard radio contact and real-time transit telemetry.';

                      return (
                        <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ background: bg, borderColor: border }}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={14} style={{ color }} className={isReroute ? 'animate-bounce' : ''} />
                            <span className="text-xs font-black uppercase tracking-wide" style={{ color }}>
                              {title}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold leading-relaxed text-slate-200">
                            {details}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Gemini Route Comparison Recommendations (aiRec) */}
                    {aiRecLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
                        <span className="text-[10px] text-slate-400 font-bold">Analyzing route alternatives...</span>
                      </div>
                    ) : aiRec ? (
                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2 mt-1">
                        <div className="flex items-center gap-1.5">
                          <Bot size={11} style={{ color: 'var(--accent)' }} className="animate-pulse" />
                          <span className="text-[9px] font-black uppercase text-cyan-400">AI Alternative Route Analysis</span>
                        </div>
                        <div className="text-[10px] space-y-2 leading-relaxed">
                          <div>
                            <span className="text-slate-500 font-bold block uppercase text-[8px]">Best Option</span>
                            <span className="text-white font-extrabold">{aiRec.label}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold block uppercase text-[8px]">Comparison Reasoning</span>
                            <span className="text-slate-300 font-semibold">{aiRec.reasoning}</span>
                          </div>
                          {aiRec.tradeoff && (
                            <div>
                              <span className="text-slate-500 font-bold block uppercase text-[8px]">Key Tradeoff</span>
                              <span className="text-amber-200 font-semibold">{aiRec.tradeoff}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Latest Risk Intelligence Gallery Section */}
            {latestIncidents.length > 0 && (
              <div className="p-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${SURFACE_BORDER}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest leading-none text-slate-400">
                  Latest Risk Intelligence
                </p>
                <div className="space-y-3">
                  {latestIncidents.slice(0, 5).map((news, i) => {
                    const severity = news.severity === 'CRITICAL' ? 'CRITICAL' : news.severity === 'HIGH' ? 'HIGH' : 'MODERATE';
                    const style = SEV_STYLES[severity] || SEV_STYLES.MODERATE;
                    return (
                      <motion.div
                        key={i}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => {
                          if (news.source_url) {
                            window.open(news.source_url, '_blank');
                          }
                          if (news.lat != null && news.lon != null) {
                            setCenterMapTo([news.lat, news.lon]);
                          }
                        }}
                        className="p-3 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all hover:border-slate-700"
                        style={{ background: 'rgba(15,23,42,0.9)', borderColor: SURFACE_BORDER }}
                      >
                        {news.image_url ? (
                          <div className="w-full h-24 overflow-hidden rounded-lg">
                            <img src={news.image_url} alt={news.title} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full h-16 bg-slate-800/40 rounded-lg flex flex-col items-center justify-center text-slate-500 gap-1 border border-slate-800/50">
                            <Radio size={14} className="opacity-40" />
                            <span className="text-[8px] uppercase font-black tracking-wider opacity-60">No Media</span>
                          </div>
                        )}
                        <div>
                          <div className="flex justify-between items-center gap-2 mb-1">
                            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide"
                              style={{ background: style.badge || style.card, color: style.dot || style.badgeText, borderColor: style.border, border: '1px solid' }}>
                              {severity} · {news.category || 'threat'}
                            </span>
                            <span className="text-[8px] text-slate-400 font-extrabold truncate">{news.source}</span>
                          </div>
                          <h4 className="text-[10px] font-semibold leading-snug line-clamp-2 text-white">
                            {news.title}
                          </h4>
                          <p className="text-[8px] text-slate-500 font-semibold mt-1">
                            {news.published ? timeAgo(new Date(news.published).getTime()) : ''}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MISSION CONTROL DRAWER ══ */}
      <AnimatePresence>
        {isMissionControlOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMissionControlOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[4000]"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute left-0 top-0 h-full z-[4010] flex flex-col overflow-hidden rg-sidebar"
              style={{
                width: 380,
                background: '#0B1220',
                borderRight: `1px solid ${SURFACE_BORDER}`,
                boxShadow: '24px 0 80px rgba(0,0,0,0.5)',
              }}
            >
              {/* Header */}
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Mission Control</p>
                  <p className="text-sm font-bold text-white">Create Route</p>
                </div>
                <button
                  onClick={() => setIsMissionControlOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Mode selector + Routy button */}
                <div className="px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>
                      Freight Mode
                    </p>
                    <button
                      onClick={() => { setShowRouty(true); setIsMissionControlOpen(false); }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-[10px] font-bold"
                      style={{ background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_BORDER}` }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,194,255,0.2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ACCENT_SOFT; }}
                    >
                      <Bot size={11} className="animate-pulse" />
                      Ask Routy
                    </button>
                  </div>
                  <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(5,8,22,0.9)' }}>
                    {FREIGHT_MODES.map(({ label, value, Icon }) => (
                      <button
                        key={value}
                        onClick={() => handleModeChange(value)}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[9px] font-bold transition-all"
                        style={{
                          background: freightMode === value ? 'rgba(15,23,42,0.85)' : 'transparent',
                          color: freightMode === value ? ACCENT : '#6B7280',
                          boxShadow: freightMode === value ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                        }}
                      >
                        <Icon size={13} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ask Routy CTA */}
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowRouty(true); setIsMissionControlOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all"
                    style={{ background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,194,255,0.16)'}
                    onMouseLeave={e => e.currentTarget.style.background = ACCENT_SOFT}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,194,255,0.2)' }}>
                      <Bot size={18} style={{ color: ACCENT }} className="animate-pulse" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-black" style={{ color: '#F9FAFB' }}>Chat with Routy AI</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#6B7280' }}>
                        Describe your shipment in plain English or by voice
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: ACCENT, flexShrink: 0 }} />
                  </motion.button>
                </div>

                {/* Route inputs */}
                <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <ShipmentCreationFlow
                    freightMode={freightMode}
                    onLocationSelect={(src, dest) => {
                      setSelectedSource(src);
                      setSelectedDest(dest);
                      setIsMissionControlOpen(false); // Auto-close
                    }}
                    onClearRoute={handleClearRoute}
                    initialSource={selectedSource}
                    initialDest={selectedDest}
                  />
                </div>

                {/* My Routes Section */}
                <MyRoutesSection
                  routes={savedRoutes}
                  onLoad={handleLoadSavedRoute}
                  onClear={handleClearHistory}
                  isExpanded={showMyRoutes}
                  onToggle={() => setShowMyRoutes(v => !v)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          resetSignal={modeResetToken}
          replayingShipment={replayingShipment}
          setReplayingShipment={setReplayingShipment}
          centerMapTo={centerMapTo}
          setCenterMapTo={setCenterMapTo}
        />

        {/* Routy chat panel — slides over the map */}
        <RoutyChatPanel
          isOpen={showRouty}
          onClose={() => setShowRouty(false)}
          onRouteGenerated={handleRoutyRoute}
          freightMode={freightMode}
          onRouteSaved={handleRoutySaved}
        />

        {/* News Detail Modal */}
        <AnimatePresence>
          {activeNewsModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
              onClick={() => setActiveNewsModal(null)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                style={{ background: '#1F2937', border: '1px solid #374151' }}
              >
                {/* Modal header */}
                <div className="flex items-start justify-between p-5 border-b border-slate-800" style={{ background: '#111827' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-800 border border-slate-700">
                      <Newspaper size={18} className="text-cyan-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {activeNewsModal.category || 'General'}
                        </span>
                        {activeNewsModal.severity && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded"
                            style={{
                              background: activeNewsModal.severity === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : activeNewsModal.severity === 'HIGH' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)',
                              color: activeNewsModal.severity === 'CRITICAL' ? '#EF4444' : activeNewsModal.severity === 'HIGH' ? '#F59E0B' : '#38BDF8',
                              border: '1px solid currentColor'
                            }}
                          >
                            {activeNewsModal.severity}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black pr-4 leading-snug text-white">
                        {activeNewsModal.title}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNewsModal(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Modal body (Scrollable) */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                  {activeNewsModal.image_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                      <img
                        src={activeNewsModal.image_url}
                        alt="News Cover"
                        className="w-full h-56 object-cover"
                      />
                    </div>
                  )}

                  {/* Description/Content */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Geopolitical Briefing</p>
                    {modalContentLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <div className="w-8 h-8 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                        <p className="text-xs text-slate-400 animate-pulse">Extracting intelligence report...</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                        {modalContent || activeNewsModal.title}
                      </p>
                    )}
                  </div>

                  {/* Metadata details */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl text-xs bg-slate-900 border border-slate-800">
                    <div>
                      <p className="font-semibold text-[10px] uppercase tracking-wider text-slate-500">Publisher</p>
                      <p className="font-bold mt-0.5 text-slate-200">{activeNewsModal.publisher || 'Unknown Source'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[10px] uppercase tracking-wider text-slate-500">Published Date</p>
                      <p className="font-bold mt-0.5 text-slate-200">
                        {activeNewsModal.published ? new Date(activeNewsModal.published).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    {activeNewsModal.confidence != null && (
                      <div>
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-slate-500">ML Confidence</p>
                        <p className="font-bold mt-0.5 text-slate-200">{(activeNewsModal.confidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {activeNewsModal.intensity != null && (
                      <div>
                        <p className="font-semibold text-[10px] uppercase tracking-wider text-slate-500">Threat Intensity</p>
                        <p className="font-bold mt-0.5 text-slate-200">{(activeNewsModal.intensity * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2.5" style={{ background: '#111827' }}>
                  <button
                    onClick={() => {
                      if (activeNewsModal.source_url) {
                        navigator.clipboard.writeText(activeNewsModal.source_url);
                        toast.success("Article link copied!");
                      }
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    Copy Link
                  </button>
                  {activeNewsModal.source_url && (
                    <button
                      onClick={() => {
                        try {
                          const hostname = new URL(activeNewsModal.source_url).hostname;
                          window.open(`https://${hostname}`, '_blank', 'noreferrer');
                        } catch (e) {
                          window.open(activeNewsModal.source_url, '_blank', 'noreferrer');
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    >
                      Open Publisher Website
                    </button>
                  )}
                  {activeNewsModal.source_url && (
                    <a
                      href={activeNewsModal.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-black uppercase bg-[#00C2FF] hover:bg-[#00A3D9] text-[#0F172A] flex items-center gap-1 shadow-md transition-colors"
                    >
                      Read Original Source <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
