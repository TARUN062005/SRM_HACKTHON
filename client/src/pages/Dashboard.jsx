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
import { getFallbackImage } from '../lib/imageUtils';

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

// Fallback image provider imported from imageUtils

// Robust score decimal percentage scaling formatter
export const formatScore = (val) => {
  if (val == null) return null;
  const num = parseFloat(val);
  if (Number.isNaN(num)) return null;
  if (num > 0 && num <= 1.0) {
    return Math.round(num * 100);
  }
  return Math.round(num);
};

export const getRiskLevel = (score) => {
  if (score == null) return 'UNKNOWN';
  const val = formatScore(score);
  if (val == null) return 'UNKNOWN';
  if (val <= 20) return 'LOW';
  if (val <= 40) return 'MODERATE';
  if (val <= 60) return 'HIGH';
  return 'CRITICAL';
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
      <div
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-2 transition-all cursor-pointer select-none"
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
      </div>

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
              {routes.slice(0, 8).map((r, idx) => {
                const ModeIcon = MODE_ICONS[r.mode] || Anchor;
                const modeColor = MODE_COLORS[r.mode] || ACCENT;
                const sev = r.severity;
                const sevColor = sev === 'CRITICAL' ? '#EF4444' : sev === 'CAUTION' ? '#F59E0B' : '#22C55E';
                return (
                  <motion.button
                    key={`my-route-${r.id || idx}-${idx}`}
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

// ── DATA TRANSPARENCY STATUS WIDGET ──────────────────────────────────────────
const SystemStatusWidget = ({ isDegraded }) => {
  const statusConfig = {
    roadRoutes: {
      status: 'REAL-TIME',
      source: 'OSRM API',
      disclaimer: 'Road trajectories calculated via real-time OSRM routing engine.',
      isReal: true
    },
    seaRoutes: {
      status: 'SIMULATED',
      source: 'searoute-ts',
      disclaimer: 'Sea routes are simulated locally based on seaport coordinates. Real-time vessel tracks are not used.',
      isReal: false
    },
    airRoutes: {
      status: 'SIMULATED',
      source: 'Great Circle Math',
      disclaimer: 'Air coordinates represent synthetic geodesic paths between airports.',
      isReal: false
    },
    riskAnalysis: {
      status: isDegraded ? 'UNAVAILABLE' : 'REAL-TIME',
      source: 'GEO-RISK-ENGINE ML',
      disclaimer: isDegraded ? 'Risk engine currently unavailable. Offline advisory mode active.' : 'Real-time geopolitical threat monitoring and predictive risk analysis.',
      isReal: !isDegraded
    },
    weather: {
      status: 'REAL-TIME',
      source: 'Open-Meteo API',
      disclaimer: 'Real-time meteorological corridor data fetched from Open-Meteo.',
      isReal: true
    }
  };

  return (
    <div className="px-4 py-4 mt-2 border-t border-slate-800/80 bg-slate-950/40">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00C2FF] mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00C2FF] animate-pulse" />
        Data Transparency & Status
      </p>
      <div className="space-y-2.5">
        {Object.entries(statusConfig).map(([key, item]) => {
          const isReal = item.isReal;
          const isUnavailable = item.status === 'UNAVAILABLE';
          const badgeBg = isUnavailable ? 'rgba(239,68,68,0.1)' : isReal ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)';
          const badgeText = isUnavailable ? '#EF4444' : isReal ? '#22C55E' : '#F59E0B';
          const badgeBorder = isUnavailable ? 'rgba(239,68,68,0.2)' : isReal ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)';
          
          let displayLabel = 'Road Routing';
          if (key === 'seaRoutes') displayLabel = 'Sea Routing';
          if (key === 'airRoutes') displayLabel = 'Air Routing';
          if (key === 'riskAnalysis') displayLabel = 'Risk Engine';
          if (key === 'weather') displayLabel = 'Weather Feed';

          return (
            <div key={key} className="flex flex-col gap-1 text-[11px] leading-snug">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300">{displayLabel}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-slate-500 font-extrabold">{item.source}</span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider border" 
                        style={{ background: badgeBg, color: badgeText, borderColor: badgeBorder }}>
                    {item.status}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed pl-1" style={{ borderLeft: '1px solid rgba(148,163,184,0.1)' }}>
                {item.disclaimer}
              </p>
            </div>
          );
        })}
      </div>
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
  const [simResetToken, setSimResetToken]       = useState(0);
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
  const currentReport  = intel?.aiReport || parsedOriginalReport;

  useEffect(() => {
    console.log('[DIAGNOSTIC - DASHBOARD INTEL STATE]', intel);
  }, [intel]);

  useEffect(() => {
    console.log('[DIAGNOSTIC - DASHBOARD REPORT STATE]', currentReport);
  }, [currentReport]);

  useEffect(() => {
    console.log('[DASHBOARD STATE]', {
      riskScore: intel?.riskScore,
      safetyScore: intel?.safetyScore,
      alertsCount: intel?.alertsCount,
      recommendedMode: intel?.recommendedMode,
      hasActiveRoute: !!activeRoute,
      isNavigating,
      replayingShipment: replayingShipment ? {
        id: replayingShipment.id,
        origin: replayingShipment.origin,
        destination: replayingShipment.destination,
        riskScore: replayingShipment.riskScore || replayingShipment.risk_score,
        safetyScore: replayingShipment.safetyScore || replayingShipment.safety_score
      } : null
    });
  }, [intel, activeRoute, isNavigating, replayingShipment]);

  const [showFullWeather, setShowFullWeather] = useState(false);

  const sampledWeatherReports = useMemo(() => {
    const reports = intel?.waypointReports;
    if (!reports || reports.length === 0) return [];
    if (reports.length <= 10) return reports;

    const sampled = [];
    sampled.push(reports[0]); // Origin
    
    // We want 8 middle checkpoints to get 10 items total
    const numCheckpoints = 8;
    const step = (reports.length - 1) / (numCheckpoints + 1);
    for (let i = 1; i <= numCheckpoints; i++) {
      const idx = Math.round(i * step);
      if (idx > 0 && idx < reports.length - 1) {
        sampled.push(reports[idx]);
      }
    }
    
    sampled.push(reports[reports.length - 1]); // Destination
    return sampled;
  }, [intel?.waypointReports]);

  const weatherSummaryStats = useMemo(() => {
    const reports = intel?.waypointReports || [];
    let thunderstorms = 0;
    let heavyRain = 0;
    let moderateWind = 0;
    let highestRiskWp = null;
    let maxSeverityOrder = -1; // STABLE: 0, CAUTION: 1, CRITICAL: 2

    const SEV_ORDER = { STABLE: 0, CAUTION: 1, CRITICAL: 2 };

    reports.forEach(wp => {
      const cond = (wp.condition || '').toLowerCase();
      if (cond.includes('storm')) thunderstorms++;
      if (cond.includes('heavy rain')) heavyRain++;
      if (wp.wind > 25) moderateWind++;

      const order = SEV_ORDER[wp.severity] || 0;
      if (order > maxSeverityOrder) {
        maxSeverityOrder = order;
        highestRiskWp = wp;
      }
    });

    return { thunderstorms, heavyRain, moderateWind, highestRiskWp };
  }, [intel?.waypointReports]);

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
            severity: getRiskLevel(s.riskScore)
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

          if (pending.loadTimeMs) {
            toast.success(`Shipment restored in ${pending.loadTimeMs}ms`, {
              icon: '⚡',
              style: {
                background: '#0B1220',
                color: '#00C2FF',
                border: '1px solid rgba(0, 194, 255, 0.2)'
              }
            });
          }
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

  // ── Offline Synchronization Queue for Shipment Creation ──
  const syncPendingShipments = useCallback(async () => {
    if (syncPendingShipments.running) return;
    syncPendingShipments.running = true;

    try {
      const pendingQueue = JSON.parse(localStorage.getItem('rg_pending_shipments') || '[]');
      if (pendingQueue.length === 0) {
        syncPendingShipments.running = false;
        return;
      }

      console.log(`[Dashboard] Attempting to sync ${pendingQueue.length} locally queued shipments...`);
      let updatedQueue = [...pendingQueue];
      let didSyncAny = false;

      for (const item of pendingQueue) {
        let success = false;
        let retries = 3;
        
        while (retries > 0 && !success) {
          try {
            const res = await axios.post('/api/ai/shipment', item.payload);
            if (res.data && res.data.success) {
              console.log('[FRONTEND RECEIVED RESPONSE]', JSON.stringify(res.data, null, 2));
              success = true;
              didSyncAny = true;
              updatedQueue = updatedQueue.filter(q => q.tempId !== item.tempId);
              toast.success(`Shipment from ${item.payload.origin.split(',')[0]} to ${item.payload.destination.split(',')[0]} securely synchronized with cloud control.`);
            }
          } catch (err) {
            retries--;
            console.warn(`[Dashboard] Sync attempt failed for shipment ${item.tempId}. Retries remaining: ${retries}. Error:`, err.message);
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }

        if (!success) {
          break; // Stop loop if server continues to fail (offline or server error)
        }
      }

      localStorage.setItem('rg_pending_shipments', JSON.stringify(updatedQueue));

      if (didSyncAny) {
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
              severity: getRiskLevel(s.riskScore),
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
          console.error('[Dashboard] Failed to refresh shipments list after sync:', err);
        }
      } else if (updatedQueue.length > 0) {
        toast.error("Cloud synchronization offline. Shipment saved locally for auto-sync.", {
          id: 'sync-offline-toast'
        });
      }
    } catch (err) {
      console.error('[Dashboard] Error during pending shipments sync:', err);
    } finally {
      syncPendingShipments.running = false;
    }
  }, []);

  // Sync queue on load, network connection restored, or periodically
  useEffect(() => {
    syncPendingShipments();

    const handleOnline = () => {
      console.log('[Dashboard] Network connection restored. Syncing offline queue...');
      syncPendingShipments();
    };
    window.addEventListener('online', handleOnline);

    const syncInterval = setInterval(() => {
      syncPendingShipments();
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(syncInterval);
    };
  }, [syncPendingShipments]);

  // Automatically save new successful routes via local queue
  useEffect(() => {
    if (selectedSource && selectedDest && activeRoute && intel && !intel.loading && !replayingShipment && !originalAnalysis) {
      const key = `${selectedSource.lat}-${selectedSource.lon || selectedSource.lng}-${selectedDest.lat}-${selectedDest.lon || selectedDest.lng}-${freightMode}`;
      if (savedShipmentKeyRef.current !== key) {
        savedShipmentKeyRef.current = key;
        
        const queueAndSaveShipment = async () => {
          try {
            console.log('[Dashboard] Automatically queuing shipment save...');
            const m = freightMode === 'ship' ? 'sea' : freightMode === 'truck' ? 'road' : 'air';
            const payload = {
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
              aiReport: intel.aiReport,
              newsAlerts: intel.events || null
            };

            const pendingQueue = JSON.parse(localStorage.getItem('rg_pending_shipments') || '[]');
            const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const pendingItem = { tempId, payload, timestamp: Date.now(), attempts: 0 };
            pendingQueue.push(pendingItem);
            localStorage.setItem('rg_pending_shipments', JSON.stringify(pendingQueue));

            await syncPendingShipments();
          } catch (err) {
            console.warn('[Dashboard] Failed to queue shipment:', err.message);
          }
        };
        queueAndSaveShipment();
      }
    }
  }, [selectedSource, selectedDest, freightMode, activeRoute, intel, replayingShipment, originalAnalysis, syncPendingShipments]);

  useEffect(() => {
    if (replayingShipment) {
      const coords = replayingShipment.routeGeometry?.coordinates || [];
      if (coords.length >= 2) {
        const origCoords = coords[0];
        const destCoords = coords[coords.length - 1];
        if (selectedSource && selectedDest) {
          const sourceMatches = Math.abs(selectedSource.lat - origCoords[1]) < 0.001 && 
                                Math.abs((selectedSource.lon || selectedSource.lng) - origCoords[0]) < 0.001;
          const destMatches = Math.abs(selectedDest.lat - destCoords[1]) < 0.001 && 
                              Math.abs((selectedDest.lon || selectedDest.lng) - destCoords[0]) < 0.001;
          if (!sourceMatches || !destMatches) {
            console.log('[REPLAY] Coordinates changed away from replay, clearing replayingShipment');
            setReplayingShipment(null);
            setOriginalAnalysis(null);
          }
        }
      }
    }
  }, [selectedSource, selectedDest, replayingShipment]);

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
    setReplayingShipment(null);
  }, [setReplayingShipment]);

  const handleModeChange = useCallback((value, preserveCoords = false) => {
    if (value === freightMode) return;
    if (!preserveCoords) {
      handleClearRoute();
    } else {
      setAllRoutes([]);
      setActiveRouteIndex(0);
      setIsNavigating(false);
      setOriginalAnalysis(null);
    }
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
      setReplayingShipment(shipment);
    }
  }, [freightMode, handleModeChange, setReplayingShipment]);

  // Called when Routy saves a route
  const handleRoutySaved = useCallback(() => {
    setSavedRoutes(loadRouteHistory());
  }, []);

  // Load a saved route from My Routes
  const handleLoadSavedRoute = useCallback(async (r) => {
    try {
      const res = await axios.get(`/api/ai/shipment/${r.id}`);
      if (res.data?.success) {
        console.log('[FRONTEND RECEIVED RESPONSE]', JSON.stringify(res.data, null, 2));
        const fullShipment = res.data.shipment;
        const coords = fullShipment.routeGeometry?.coordinates || [];
        if (coords.length >= 2) {
          const originCoords = coords[0];
          const destCoords = coords[coords.length - 1];
          
          const modeMap = { sea: 'ship', air: 'air', truck: 'truck', road: 'truck' };
          const nextMode = modeMap[fullShipment.mode] || 'ship';

          setSelectedSource({
            lat: originCoords[1],
            lon: originCoords[0],
            display_name: fullShipment.origin
          });
          setSelectedDest({
            lat: destCoords[1],
            lon: destCoords[0],
            display_name: fullShipment.destination
          });

          // Instantly put into loading state and clear stale stats
          setAllRoutes([{
            id: 0,
            geometry: fullShipment.routeGeometry,
            coords: coords.map(c => [c[1], c[0]]),
            distance: fullShipment.distance,
            duration: fullShipment.eta,
            summary: fullShipment.mode === 'road' ? 'Road Route' : fullShipment.mode === 'sea' ? 'Sea Route' : 'Air Route',
            intelligence: { loading: true },
            vehicle: fullShipment.mode === 'road' ? 'truck' : fullShipment.mode === 'sea' ? 'ship' : 'air'
          }]);
          setActiveRouteIndex(0);

          setOriginalAnalysis(fullShipment);
          setReplayingShipment(fullShipment);
          handleModeChange(nextMode, true);
          setIsMissionControlOpen(false);
        } else if (fullShipment.source && fullShipment.dest) {
          const modeMap = { sea: 'ship', air: 'air', truck: 'truck', road: 'truck' };
          const nextMode = modeMap[fullShipment.mode] || 'ship';

          setSelectedSource(fullShipment.source);
          setSelectedDest(fullShipment.dest);

          setOriginalAnalysis(fullShipment);
          setReplayingShipment(fullShipment);
          handleModeChange(nextMode, true);
          setIsMissionControlOpen(false);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error loading saved route details:', err.message);
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
                  <div className="mt-2.5">
                    <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-[#0F172A]/90 border border-slate-800/80 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isNavigating ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}`} />
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-450">MISSION TELEMETRY</span>
                        </div>
                        <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{isNavigating ? 'RUNNING' : 'STANDBY'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2.5">
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => setIsNavigating(v => !v)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all border shadow-md animate-fade-in"
                          style={{
                            background: isNavigating ? 'rgba(245,158,11,0.12)' : 'rgba(0,194,255,0.12)',
                            borderColor: isNavigating ? 'rgba(245,158,11,0.35)' : 'rgba(0,194,255,0.35)',
                            boxShadow: isNavigating ? '0 0 12px rgba(245,158,11,0.15)' : '0 0 12px rgba(0,194,255,0.15)',
                          }}
                        >
                          {isNavigating
                            ? <Square size={12} className="text-amber-400" fill="currentColor" />
                            : <Play size={14} className="text-cyan-400 translate-x-0.5" fill="currentColor" />}
                        </button>
                        
                        {/* Stop Button */}
                        <button
                          onClick={() => {
                            setIsNavigating(false);
                            setSimResetToken(t => t + 1);
                          }}
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all border border-slate-800 bg-slate-900/60 hover:bg-slate-805 hover:border-slate-700 shadow-md"
                          title="Reset Telemetry to Start"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className="text-slate-400">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                          </svg>
                        </button>

                        {/* Speed selector chips */}
                        <div className="flex-1 flex gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-900">
                          {[1, 2, 5, 10].map(speed => (
                            <button
                              key={speed}
                              onClick={() => setSimSpeed(speed)}
                              className="flex-1 py-1 text-[10px] font-black rounded-lg transition-all"
                              style={{
                                background: simSpeed === speed ? 'var(--accent)' : 'transparent',
                                color: simSpeed === speed ? '#0F172A' : 'var(--text-secondary)',
                                boxShadow: simSpeed === speed ? '0 2px 8px rgba(0,194,255,0.3)' : 'none',
                              }}
                            >
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* 2. RISK ASSESSMENT */}
                <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                    2. Risk Assessment
                  </p>
                  
                  {intel?.loading ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
                      <span className="text-xs text-slate-400 font-bold">{intel.statusText || 'Waking Geo Risk Engine...'}</span>
                    </div>
                  ) : intel?.error ? (
                    <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-2">
                      <p className="text-xs font-bold text-red-300">
                        {intel._meta?.failureReason || 'Risk intelligence temporarily unavailable.'}
                      </p>
                      {intel._meta?.responseDuration && (
                        <p className="text-[10px] text-slate-500">
                          Engine responded in {(intel._meta.responseDuration / 1000).toFixed(1)}s
                        </p>
                      )}
                    </div>
                  ) : intel ? (
                    <div className="space-y-3">
                      {/* Gauge / Score row */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center">
                          <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Risk Score</span>
                          <span className="text-base font-black text-white">
                            {formatScore(intel.riskScore) != null
                              ? `${formatScore(intel.riskScore)} / 100`
                              : intel._meta?.engineStatus === 'TIMEOUT'
                              ? <span className="text-[11px] text-amber-400 font-bold">Timed Out</span>
                              : intel._meta?.engineStatus === 'ERROR'
                              ? <span className="text-[11px] text-red-400 font-bold">Unavailable</span>
                              : 'Pending...'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center">
                          <span className="text-[9px] font-bold uppercase text-slate-500 mb-0.5">Safety Score</span>
                          <span className="text-base font-black text-white">
                            {formatScore(intel.safetyScore) != null
                              ? `${formatScore(intel.safetyScore)} / 100`
                              : intel._meta?.engineStatus === 'TIMEOUT'
                              ? <span className="text-[11px] text-amber-400 font-bold">Timed Out</span>
                              : intel._meta?.engineStatus === 'ERROR'
                              ? <span className="text-[11px] text-red-400 font-bold">Unavailable</span>
                              : 'Pending...'}
                          </span>
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

                      {/* Engine metadata card — Phase 7 */}
                      {intel._meta && (
                        <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 flex flex-col gap-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Engine Diagnostics</span>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                            <span className="text-slate-500">Status</span>
                            <span className={`font-bold ${
                              intel._meta.engineStatus === 'OK' ? 'text-emerald-400' :
                              intel._meta.engineStatus === 'TIMEOUT' ? 'text-amber-400' : 'text-red-400'
                            }`}>{intel._meta.engineStatus}</span>
                            {intel._meta.responseDuration != null && (
                              <>
                                <span className="text-slate-500">Response</span>
                                <span className="text-slate-300 font-semibold">{(intel._meta.responseDuration / 1000).toFixed(2)}s</span>
                              </>
                            )}
                            {intel._meta.analyzedAt && (
                              <>
                                <span className="text-slate-500">Analyzed</span>
                                <span className="text-slate-300 font-semibold">{new Date(intel._meta.analyzedAt).toLocaleTimeString()}</span>
                              </>
                            )}
                            {intel._meta.failureReason && (
                              <>
                                <span className="text-slate-500">Reason</span>
                                <span className="text-amber-300 font-semibold truncate">{intel._meta.failureReason}</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}

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

                {/* 3. WEATHER ANALYSIS */}
                {!intel?.loading && intel?.waypointReports?.length > 0 && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                      3. Weather Analysis
                    </p>
                    
                    {/* Weather Risk Summary statistics card */}
                    {weatherSummaryStats && (
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 mb-1">
                        <span className="text-[8px] font-black uppercase text-cyan-400 tracking-wider block">Weather Corridor Summary</span>
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850/80 text-center">
                            <span className="text-slate-500 font-bold block text-[8px] uppercase">Storms</span>
                            <span className={`text-xs font-black ${weatherSummaryStats.thunderstorms > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                              {weatherSummaryStats.thunderstorms} zones
                            </span>
                          </div>
                          <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850/80 text-center">
                            <span className="text-slate-500 font-bold block text-[8px] uppercase">Heavy Rain</span>
                            <span className={`text-xs font-black ${weatherSummaryStats.heavyRain > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                              {weatherSummaryStats.heavyRain} zones
                            </span>
                          </div>
                          <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850/80 text-center">
                            <span className="text-slate-500 font-bold block text-[8px] uppercase">High Wind</span>
                            <span className={`text-xs font-black ${weatherSummaryStats.moderateWind > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                              {weatherSummaryStats.moderateWind} zones
                            </span>
                          </div>
                        </div>
                        {weatherSummaryStats.highestRiskWp && (
                          <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-semibold">Highest Risk Sector:</span>
                            <span className={`font-bold uppercase ${
                              weatherSummaryStats.highestRiskWp.severity === 'CRITICAL' ? 'text-red-400' :
                              weatherSummaryStats.highestRiskWp.severity === 'CAUTION' ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {weatherSummaryStats.highestRiskWp.place?.split(',')[0]} ({weatherSummaryStats.highestRiskWp.condition})
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {(showFullWeather ? intel.waypointReports : sampledWeatherReports).map((wp, i) => {
                        const WIcon = getWeatherIcon(wp.weather);
                        const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                        const listToUse = showFullWeather ? intel.waypointReports : sampledWeatherReports;
                        const labelText = i === 0 ? 'Origin' : i === listToUse.length - 1 ? 'Destination' : `Checkpoint ${String.fromCharCode(65 + (i - 1))}`;
                        
                        return (
                          <div key={i} className="flex-shrink-0 w-[114px] bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col items-center text-center">
                            <span className="text-[8px] font-black uppercase tracking-wider text-cyan-400 mb-1">
                              {labelText}
                            </span>
                            <WIcon size={18} style={{ color: wp.severity === 'CRITICAL' ? '#EF4444' : wp.severity === 'CAUTION' ? '#F59E0B' : '#00C2FF' }} className="my-1.5" />
                            <p className="text-[10px] font-bold text-white truncate w-full">{wp.place?.split(',')[0]}</p>
                            <p className="text-[9px] text-slate-400 font-semibold mt-0.5">{parts[1] || `${wp.temp}°C`}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Weather Timeline */}
                    <div className="w-full h-px bg-slate-800/60 my-1" />
                    <p className="text-[8px] font-black uppercase tracking-widest leading-none text-slate-500 mt-1 mb-1">
                      Weather Timeline Along Corridor
                    </p>
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
                      {(showFullWeather ? intel.waypointReports : sampledWeatherReports).map((wp, i) => {
                        const WIcon = getWeatherIcon(wp.weather);
                        const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                        const hazardColor = wp.severity === 'CRITICAL' ? 'text-red-400' : wp.severity === 'CAUTION' ? 'text-amber-400' : 'text-emerald-400';
                        const hazardBg = wp.severity === 'CRITICAL' ? 'rgba(239,68,68,0.1)' : wp.severity === 'CAUTION' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.06)';
                        const hazardBorder = wp.severity === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : wp.severity === 'CAUTION' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.15)';
                        
                        const listToUse = showFullWeather ? intel.waypointReports : sampledWeatherReports;
                        const labelText = i === 0 ? 'Origin' : i === listToUse.length - 1 ? 'Destination' : `Checkpoint ${String.fromCharCode(65 + (i - 1))}`;

                        return (
                          <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-850 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[8px] font-black text-slate-500 w-16 text-left uppercase truncate">{labelText}</span>
                              <WIcon size={14} className="text-cyan-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-white truncate">{wp.place}</p>
                                <p className="text-[9px] text-slate-400 leading-none mt-0.5">{wp.condition || parts[0]} · {wp.temp}°C</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-right flex-shrink-0">
                              <div className="text-[9px] text-slate-400 leading-tight">
                                <div>Wind: {wp.wind} km/h</div>
                                <div>Risk: {wp.stormRisk || 'Low'}</div>
                              </div>
                              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border" style={{ color: hazardColor, background: hazardBg, borderColor: hazardBorder }}>
                                {wp.severity}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {intel.waypointReports.length > 10 && (
                      <button
                        onClick={() => setShowFullWeather(v => !v)}
                        className="w-full py-2.5 mt-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors bg-[#101826] border border-slate-850 hover:bg-slate-900 text-cyan-400"
                      >
                        {showFullWeather ? 'Collapse Weather Corridor' : 'Expand Full Weather Corridor'}
                      </button>
                    )}
                  </div>
                )}

                {/* 4. AI ROUTE REPORT */}
                <div className="p-4 flex flex-col gap-3.5" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-cyan-400">
                      4. AI Logistics Briefing Report
                    </p>
                    {originalAnalysis && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-900/35 text-cyan-400 border border-cyan-800/50">
                        Replay Mode
                      </span>
                    )}
                  </div>

                  {(intel?.loading && !parsedOriginalReport) ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
                      <span className="text-xs text-slate-400 font-bold">{intel.statusText || 'Generating AI Report...'}</span>
                    </div>
                  ) : (intel?.error && !parsedOriginalReport) ? (
                    <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
                      Executive report temporarily unavailable.
                    </div>
                  ) : currentReport ? (
                    <div className="space-y-4">
                      {/* Operator Decision */}
                      {(() => {
                        const decision = currentReport.operatorDecision || currentReport.operator_decision || currentReport.recommendedAction || 'PROCEED';
                        const isReroute = decision === 'REROUTE' || decision === 'Reroute';
                        const isDelay = decision === 'DELAY' || decision === 'Delay';
                        const decText = isReroute ? 'Reroute Required' : isDelay ? 'Delay Advised' : 'Proceed';
                        const color = isReroute ? '#EF4444' : isDelay ? '#F59E0B' : '#22C55E';
                        const bg = isReroute ? 'rgba(239,68,68,0.12)' : isDelay ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)';
                        const border = isReroute ? 'rgba(239,68,68,0.25)' : isDelay ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)';
                        return (
                          <div className="p-4 rounded-2xl border flex items-center justify-between shadow-md" style={{ background: bg, borderColor: border }}>
                            <div className="flex items-center gap-2.5">
                              <Bot size={16} style={{ color }} className={isReroute ? 'animate-bounce' : ''} />
                              <div>
                                <span className="text-[8px] font-black uppercase text-slate-450 tracking-wider block">Operator Decision</span>
                                <span className="text-sm font-black uppercase tracking-wide" style={{ color }}>{decText}</span>
                              </div>
                            </div>
                            {intel?.loading && (
                              <span className="w-4 h-4 rounded-full border border-t-transparent border-cyan-400 animate-spin" />
                            )}
                          </div>
                        );
                      })()}

                      {/* 1. Executive Summary */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-cyan-400 tracking-wider block">1. Executive Summary</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-200">
                          {currentReport.executiveSummary || currentReport.executive_summary}
                        </p>
                      </div>

                      {/* 2. Route Overview */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">2. Route Overview</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.routeOverview || currentReport.route_overview}
                        </p>
                      </div>

                      {/* 3. Geopolitical Assessment */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">3. Geopolitical Assessment</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.geopoliticalAssessment || currentReport.geopolitical_assessment}
                        </p>
                      </div>

                      {/* 4. Weather Assessment */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">4. Weather Assessment</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.weatherAssessment || currentReport.weather_assessment}
                        </p>
                      </div>

                      {/* 5. Operational Impact */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">5. Operational Impact</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.operationalImpact || currentReport.operational_impact}
                        </p>
                      </div>

                      {/* 6. Top Threats */}
                      {(() => {
                        const threats = currentReport.topThreats || currentReport.top_threats || [];
                        if (threats.length === 0) return null;
                        return (
                          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">6. Top Threats</span>
                            <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-300 font-semibold leading-relaxed">
                              {threats.map((threat, i) => (
                                <li key={i}>{threat}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}

                      {/* 7. Recommended Actions */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">7. Recommended Actions</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.recommendedActions || currentReport.recommended_actions || currentReport.recommendedAction}
                        </p>
                      </div>

                      {/* 8. Alternative Mode Analysis */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">8. Alternative Mode Analysis</span>
                        <p className="text-[11px] font-semibold leading-relaxed text-slate-300">
                          {currentReport.alternativeModeAnalysis || currentReport.alternative_mode_analysis}
                        </p>
                      </div>

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
                  ) : null}
                </div>

                {/* 6. INCIDENT FEED */}
                {!intel?.loading && intel?.events?.length > 0 && (
                  <div className="p-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${SURFACE_BORDER}` }}>
                    <p className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-400">
                      6. Incident Feed ({intel.events.length})
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
                            <a href={news.source_url || '#'} target={news.source_url ? "_blank" : undefined} rel="noreferrer" onClick={e => e.stopPropagation()} className={news.source_url ? "block overflow-hidden rounded-lg" : "block overflow-hidden rounded-lg pointer-events-none"}>
                              <img
                                src={news.image_url || getFallbackImage(news.label || news.category)}
                                alt={news.headline}
                                loading="lazy"
                                className="w-full h-32 object-cover hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = getFallbackImage(news.label || news.category);
                                }}
                              />
                            </a>
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

                {/* System Status Card */}
                <SystemStatusWidget isDegraded={!!(intel?.isDegraded || originalAnalysis?.isDegraded)} />

              </motion.div>
            </AnimatePresence>
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
                      setOriginalAnalysis(null);
                      setReplayingShipment(null);
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

                {/* System Status Card */}
                <SystemStatusWidget isDegraded={!!(intel?.isDegraded || originalAnalysis?.isDegraded)} />
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
          simResetToken={simResetToken}
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
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                    <img
                      src={activeNewsModal.image_url || '/logistics_fallback.png'}
                      alt="News Cover"
                      className="w-full h-56 object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/logistics_fallback.png';
                      }}
                    />
                  </div>

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
