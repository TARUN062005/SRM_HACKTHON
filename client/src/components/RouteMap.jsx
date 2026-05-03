import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMap, ZoomControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { X, Layers, Crosshair, Anchor, AlertTriangle, Shield, Radio } from 'lucide-react';
import { RiskIntelPanel } from './RiskIntelPanel';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const isValidCoord = c => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);

// ── Port / Anchor marker ─────────────────────────────────────────
const makePortIcon = (type) =>
  L.divIcon({
    html: `<div style="position:relative;width:38px;height:38px;">
      <div style="width:38px;height:38px;border-radius:50%;
        background:${type === 'origin' ? '#1a73e8' : '#ea4335'};
        border:3px solid white;box-shadow:0 4px 16px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" y1="22" x2="12" y2="8"/>
          <path d="M5 12H2a10 10 0 0020 0h-3"/>
        </svg>
      </div>
      <div style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;
        background:${type === 'origin' ? '#34a853' : '#ea4335'};border:2px solid white;"></div>
    </div>`,
    className: '', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22],
  });

const makePinIcon = (label, bg, shadowColor) =>
  L.divIcon({
    html: `<div style="position:relative;width:32px;height:42px;display:flex;flex-direction:column;align-items:center;">
      <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${bg};border:2.5px solid white;box-shadow:0 4px 14px ${shadowColor};
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:white;font-size:12px;font-weight:900;font-family:system-ui;">${label}</span>
      </div>
      <div style="width:2px;height:8px;background:${bg};opacity:0.5;border-radius:0 0 2px 2px;"></div>
    </div>`,
    className: '', iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -44],
  });

const portOriginIcon = makePortIcon('origin');
const portDestIcon   = makePortIcon('dest');
const startPin = makePinIcon('A', '#34a853', 'rgba(52,168,83,0.45)');
const endPin   = makePinIcon('B', '#ea4335', 'rgba(234,67,53,0.45)');

const makeWaypointIcon = (num, critical) =>
  L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${critical ? '#ef4444' : '#1a73e8'};
      border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;
      justify-content:center;color:white;font-size:9px;font-weight:900;font-family:system-ui;">${num}</div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11],
  });

// ── Navigation simulator dot ─────────────────────────────────────
const NavigationSimulator = ({ coords, isActive, isNavigating, speedMultiplier, freightMode }) => {
  const map = useMap();
  const [position, setPosition] = useState(coords?.[0] ?? null);
  const [rotation, setRotation] = useState(0);
  const indexRef = useRef(0);
  const timerRef = useRef();

  const getBearing = (p1, p2) => {
    if (!p1 || !p2) return 0;
    const toR = d => (d * Math.PI) / 180;
    const y = Math.sin(toR(p2[1] - p1[1])) * Math.cos(toR(p2[0]));
    const x = Math.cos(toR(p1[0])) * Math.sin(toR(p2[0])) -
               Math.sin(toR(p1[0])) * Math.cos(toR(p2[0])) * Math.cos(toR(p2[1] - p1[1]));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!isActive || !coords?.length || !isNavigating) { if (!isNavigating) indexRef.current = 0; return; }
    const step = () => {
      const inc = Math.max(1, Math.floor(speedMultiplier * 2));
      const next = Math.min(indexRef.current + inc, coords.length - 1);
      setRotation(getBearing(coords[indexRef.current], coords[next]));
      setPosition(coords[next]);
      indexRef.current = next;
      map.panTo(coords[next], { animate: true, duration: 0.12 });
      if (next >= coords.length - 1) indexRef.current = 0;
      timerRef.current = setTimeout(step, 280 / speedMultiplier);
    };
    timerRef.current = setTimeout(step, 100);
    return () => clearTimeout(timerRef.current);
  }, [isActive, coords, isNavigating, speedMultiplier, map]);

  if (!isActive || !position || !isValidCoord(position)) return null;

  const isShip = freightMode === 'ship';
  const isAir  = freightMode === 'air';
  const shipSVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M2 20s3-3 7-3 7 3 13 3M12 3v10M8 9l4-4 4 4M6 13h12l-2 7H8L6 13z"/></svg>`;
  const planeSVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
  const arrowSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/></svg>`;

  const navIcon = L.divIcon({
    html: `<div style="transform:rotate(${rotation}deg);width:30px;height:30px;
      background:${isShip ? '#0d47a1' : isAir ? '#0288d1' : '#1a73e8'};
      border-radius:${isShip ? '6px' : '50%'};border:3px solid white;
      box-shadow:0 0 0 3px rgba(26,115,232,0.3),0 4px 12px rgba(26,115,232,0.4);
      display:flex;align-items:center;justify-content:center;">
      ${isShip ? shipSVG : isAir ? planeSVG : arrowSVG}
    </div>`,
    className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  });

  return <Marker position={position} icon={navIcon} zIndexOffset={6000} />;
};

// ── Fit map bounds ───────────────────────────────────────────────
const MapFitBounds = ({ allRoutes }) => {
  const map = useMap();
  useEffect(() => {
    if (!allRoutes?.length) return;
    const coords = allRoutes.flatMap(r => r.coords).filter(isValidCoord);
    if (!coords.length) return;
    try {
      const bounds = L.polyline(coords).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, duration: 0.8 });
    } catch (_) {}
  }, [allRoutes, map]);
  return null;
};

// ── Locate-me control ────────────────────────────────────────────
const LocateMeButton = () => {
  const map = useMap();
  const [busy, setBusy] = useState(false);
  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '90px' }}>
      <div className="leaflet-control">
        <button onClick={() => {
          if (!navigator.geolocation) return;
          setBusy(true);
          navigator.geolocation.getCurrentPosition(
            p => { map.flyTo([p.coords.latitude, p.coords.longitude], 10, { duration: 1.2 }); setBusy(false); },
            () => setBusy(false)
          );
        }} title="My location"
          className={`w-[30px] h-[30px] bg-white border border-slate-300 rounded flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors ${busy ? 'opacity-60' : ''}`}>
          <Crosshair size={14} className={busy ? 'animate-spin text-blue-500' : 'text-slate-600'} />
        </button>
      </div>
    </div>
  );
};

// ── MAIN MAP ─────────────────────────────────────────────────────
export const RouteMap = ({
  selectedSource, selectedDestination,
  setSelectedSource, setSelectedDestination,
  vehicleMode = 'truck',
  freightMode = 'ship',
  onClearRoute, onRouteData,
  activeRouteIndex = 0, onSetActiveRoute,
  isNavigating = false, simSpeed = 2,
  aiRecommendation = null,
}) => {
  const [allRoutes, setAllRoutes]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [mapType, setMapType]               = useState('voyager');
  const [showSeamarks, setShowSeamarks]     = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [hoveredRoute, setHoveredRoute]     = useState(null);
  const [showRiskPanel, setShowRiskPanel]   = useState(false);
  // Port-snapped coordinates (sea mode only) — these are the actual port locations
  const [portOriginCoord, setPortOriginCoord] = useState(null);
  const [portDestCoord,   setPortDestCoord]   = useState(null);
  const [portOriginName,  setPortOriginName]  = useState(null);
  const [portDestName,    setPortDestName]    = useState(null);

  useEffect(() => { setShowSeamarks(freightMode === 'ship'); }, [freightMode]);

  const onRouteDataRef = useRef(onRouteData);
  useEffect(() => { onRouteDataRef.current = onRouteData; }, [onRouteData]);

  const tileUrls = {
    voyager:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  };

  const fetchRoutes = useCallback(async (start, end, mode) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/directions`, {
        params: {
          startLat: parseFloat(start.lat), startLng: parseFloat(start.lng || start.lon),
          endLat: parseFloat(end.lat),     endLng: parseFloat(end.lng || end.lon),
          vehicle: mode, sourceName: start.display_name, destName: end.display_name,
        },
      });
      if (res.data.success && res.data.routes?.length > 0) {
        const scale = { car: 1, bike: 3, foot: 8, bus: 1.5, truck: 1.3 }[mode] || 1;
        const processed = res.data.routes.map((r, i) => ({
          ...r, id: i,
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          intelligence: r.intelligence || {},
          baseDuration: r.duration / scale,
        }));
        setAllRoutes(processed);

        // Extract port coordinates for sea mode — use actual snapped port locations for markers
        const firstRoute = processed[0];
        if (mode === 'ship' && firstRoute?.originPort && firstRoute?.destPort) {
          setPortOriginCoord([firstRoute.originPort.lat, firstRoute.originPort.lon]);
          setPortDestCoord([firstRoute.destPort.lat,   firstRoute.destPort.lon]);
          setPortOriginName(`${firstRoute.originPort.name} Port`);
          setPortDestName(`${firstRoute.destPort.name} Port`);
          console.log(`[MAP] Port markers: ${firstRoute.originPort.name} → ${firstRoute.destPort.name}`);
        } else {
          setPortOriginCoord(null); setPortDestCoord(null);
          setPortOriginName(null);  setPortDestName(null);
        }

        onRouteDataRef.current?.({ allRoutes: processed, activeRouteIndex: 0 });
      }
    } catch (err) {
      console.error('Route fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSource && selectedDestination) {
      const t = setTimeout(() => fetchRoutes(selectedSource, selectedDestination, vehicleMode), 300);
      return () => clearTimeout(t);
    } else {
      setAllRoutes([]);
      setPortOriginCoord(null); setPortDestCoord(null);
      setPortOriginName(null);  setPortDestName(null);
      onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
    }
  }, [selectedSource, selectedDestination, vehicleMode, fetchRoutes]);

  const sourceCoord = useMemo(() => {
    if (!selectedSource) return null;
    const lat = parseFloat(selectedSource.lat), lng = parseFloat(selectedSource.lng || selectedSource.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedSource]);

  const destCoord = useMemo(() => {
    if (!selectedDestination) return null;
    const lat = parseFloat(selectedDestination.lat), lng = parseFloat(selectedDestination.lng || selectedDestination.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedDestination]);

  // ── Per-mode visual strategy ──────────────────────────────────────
  const MODE_STYLE = {
    ship:  { activeColor: '#0d47a1', altColor: '#1565c0', glowColor: 'rgba(13,71,161,0.28)', weight: 6, altWeight: 4, dashArray: null,    glowW: 14 },
    air:   { activeColor: '#0288d1', altColor: '#039be5', glowColor: 'rgba(2,136,209,0.22)',  weight: 4, altWeight: 3, dashArray: '12 8',  glowW: 10 },
    rail:  { activeColor: '#6d28d9', altColor: '#7c3aed', glowColor: 'rgba(109,40,217,0.22)', weight: 5, altWeight: 4, dashArray: '14 5',  glowW: 11 },
    truck: { activeColor: '#c2410c', altColor: '#ea580c', glowColor: 'rgba(194,65,12,0.22)',  weight: 5, altWeight: 4, dashArray: null,    glowW: 11 },
  };
  const modeStyle = MODE_STYLE[freightMode] || MODE_STYLE.truck;

  // ── Active route risk intelligence ────────────────────────────────────────
  const activeIntel    = allRoutes[activeRouteIndex]?.intelligence ?? null;
  const riskScore      = activeIntel?.riskScore    ?? 0;
  const riskSeverity   = activeIntel?.severity     ?? 'STABLE';
  const riskZones      = activeIntel?.riskZones    ?? [];

  // Duration formatter: show in hours/days for ship, minutes for land/air
  const formatDuration = (seconds) => {
    if (freightMode === 'ship') {
      const days = seconds / 86400;
      return days >= 1 ? `${days.toFixed(1)} days` : `${(seconds / 3600).toFixed(0)} hrs`;
    }
    if (freightMode === 'air') {
      const hrs = seconds / 3600;
      return hrs >= 1 ? `${hrs.toFixed(1)} hrs` : `${(seconds / 60).toFixed(0)} min`;
    }
    return `${(seconds / 60).toFixed(0)} min`;
  };

  const mapLayers = useMemo(() => {
    return [...allRoutes]
      .sort((a, b) => a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0)
      .map(route => {
        if (!route.coords?.length) return null;
        const isActive = route.id === activeRouteIndex;
        const isHov    = hoveredRoute === route.id && !isActive;
        const riskSev  = route.intelligence?.severity || 'STABLE';
        const riskLineColor = riskSev === 'CRITICAL' ? '#EF4444'
          : (riskSev === 'HIGH' || riskSev === 'CAUTION') ? '#F59E0B'
          : '#22C55E';
        const color    = isActive ? modeStyle.activeColor : riskLineColor;
        const weight   = isActive ? modeStyle.weight : (isHov ? modeStyle.altWeight + 1 : modeStyle.altWeight);
        const opacity  = isActive ? 1 : (isHov ? 0.82 : 0.55);
        const dash     = !isActive && (freightMode === 'air' || freightMode === 'rail') ? modeStyle.dashArray : (isActive ? null : modeStyle.dashArray);

        // Duration label
        const durLabel = freightMode === 'ship'
          ? `${(route.duration / 86400).toFixed(1)}d · ${(route.distance / 1000).toFixed(0)} km`
          : freightMode === 'air'
          ? `${(route.duration / 3600).toFixed(1)}h · ${(route.distance / 1000).toFixed(0)} km`
          : `${(route.duration / 60).toFixed(0)} min · ${(route.distance / 1000).toFixed(1)} km`;

        return (
          <React.Fragment key={route.id}>
            {/* Glow halo (active only) */}
            {isActive && (
              <Polyline
                positions={route.coords}
                color={modeStyle.glowColor}
                weight={modeStyle.glowW}
                opacity={1}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {/* White outline */}
            <Polyline
              positions={route.coords}
              color="white"
              weight={isActive ? modeStyle.glowW - 2 : modeStyle.altWeight + 3}
              opacity={isActive ? 0.85 : 0.35}
              lineCap="round"
              lineJoin="round"
            />
            {/* Main route line */}
            <Polyline
              positions={route.coords}
              color={color}
              weight={weight}
              opacity={opacity}
              lineCap="round"
              lineJoin="round"
              dashArray={dash}
              eventHandlers={{
                click:     () => onSetActiveRoute?.(route.id),
                mouseover: () => setHoveredRoute(route.id),
                mouseout:  () => setHoveredRoute(null),
              }}
            >
              <Tooltip sticky direction="top" opacity={1} className="!border-0 !shadow-none !p-0 !bg-transparent">
                <div
                  className="text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl pointer-events-none whitespace-nowrap"
                  style={{ background: isActive ? modeStyle.activeColor : riskLineColor }}
                >
                  {durLabel}
                  {route.summary && <span className="ml-2 opacity-70 font-normal">· {route.summary}</span>}
                  {!isActive && (
                    <span
                      className="ml-2 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(0,0,0,0.25)' }}
                    >
                      {riskSev}
                    </span>
                  )}
                </div>
              </Tooltip>
            </Polyline>

            {/* Navigation simulator dot */}
            <NavigationSimulator
              coords={route.coords}
              isActive={isActive}
              isNavigating={isNavigating}
              speedMultiplier={simSpeed}
              freightMode={freightMode}
            />

            {/* Waypoint intelligence markers (active route only) */}
            {isActive && route.intelligence?.waypointReports?.map((wp, idx) => {
              const total = route.intelligence.waypointReports.length;
              const pos = route.coords[Math.floor(idx * (route.coords.length - 1) / Math.max(total - 1, 1))];
              if (!isValidCoord(pos)) return null;
              return (
                <Marker key={`wp-${idx}`} position={pos} icon={makeWaypointIcon(idx + 1, wp.severity === 'CRITICAL')}>
                  <Popup>
                    <div className="p-1 text-xs">
                      <div className="font-black mb-0.5" style={{ color: modeStyle.activeColor }}>{wp.place}</div>
                      <div className="text-slate-600">{wp.weather}</div>
                      {wp.severity !== 'STABLE' && (
                        <div className={`mt-1 text-[10px] font-bold uppercase ${wp.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`}>
                          ⚠ {wp.severity}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </React.Fragment>
        );
      });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed, hoveredRoute, onSetActiveRoute, modeStyle, freightMode]);

  const isMaritime = freightMode === 'ship';
  const srcIcon = isMaritime ? portOriginIcon : startPin;
  const dstIcon = isMaritime ? portDestIcon   : endPin;

  const layerOptions = [
    { id: 'voyager',   label: 'Map',       img: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=80&q=60' },
    { id: 'satellite', label: 'Satellite', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=80&q=60' },
    { id: 'dark',      label: 'Dark',      img: 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=80&q=60' },
  ];

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-200">

      {/* Loading bar */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-[2000] h-[3px] bg-blue-100 overflow-hidden pointer-events-none">
            <motion.div className="h-full bg-blue-500" initial={{ x: '-100%' }} animate={{ x: '110%' }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode badge — always visible */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1050] pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div key={freightMode}
            initial={{ opacity: 0, y: -8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-3.5 py-1.5 backdrop-blur-sm rounded-full shadow-lg border"
            style={{
              background: `${modeStyle.activeColor}e6`,
              borderColor: `${modeStyle.activeColor}99`,
            }}>
            <div className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              {freightMode === 'ship'  ? 'Maritime Route Intelligence'
             : freightMode === 'air'  ? 'Air Route · Great-Circle Path'
             : freightMode === 'rail' ? 'Rail Route Intelligence'
             : 'Road Route Intelligence'}
            </span>
            {isMaritime && showSeamarks && <span className="text-[8px] font-bold text-white/60">· OpenSeaMap</span>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Layer picker — top right */}
      <div className="absolute top-3 right-3 z-[1050] flex flex-col items-end gap-2">
        <AnimatePresence>
          {showLayerPicker && (
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              className="flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-lg border border-slate-100">
              <div className="flex gap-2">
                {layerOptions.map(t => (
                  <button key={t.id} onClick={() => { setMapType(t.id); setShowLayerPicker(false); }}
                    className={`relative w-[62px] h-[62px] rounded-xl overflow-hidden border-2 transition-all ${mapType === t.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-400'}`}>
                    <img src={t.img} className="w-full h-full object-cover" alt={t.label} />
                    <div className="absolute inset-0 bg-black/25" />
                    <span className="absolute bottom-0.5 left-0 right-0 text-center text-white text-[8px] font-black uppercase drop-shadow">{t.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowSeamarks(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${showSeamarks ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                <div className={`w-3 h-3 rounded border-2 flex items-center justify-center ${showSeamarks ? 'bg-blue-600 border-blue-600' : 'border-slate-400'}`}>
                  {showSeamarks && <span className="text-white text-[8px] font-black">✓</span>}
                </div>
                OpenSeaMap Overlay
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => setShowLayerPicker(v => !v)} title="Map layers"
          className={`w-[34px] h-[34px] rounded-lg shadow-md border flex items-center justify-center transition-all hover:shadow-lg ${showLayerPicker ? 'bg-blue-600 text-white border-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <Layers size={15} />
        </button>
      </div>

      {/* Risk score badge — bottom right, above zoom controls */}
      <AnimatePresence>
        {allRoutes.length > 0 && activeIntel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-24 right-3 z-[1050]"
          >
            <button
              onClick={() => setShowRiskPanel(v => !v)}
              title="Open Risk Intelligence Panel"
              className={`flex items-center gap-2.5 pl-3.5 pr-4 py-2.5 rounded-xl shadow-lg border-2 transition-all hover:shadow-xl ${
                showRiskPanel
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : riskSeverity === 'CRITICAL'
                  ? 'bg-red-600 border-red-500 hover:bg-red-700 text-white'
                  : riskSeverity === 'CAUTION'
                  ? 'bg-amber-500 border-amber-400 hover:bg-amber-600 text-white'
                  : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-700 text-white'
              }`}
            >
              <div className="flex flex-col items-center leading-none">
                <span className="text-[20px] font-black leading-none">{riskScore}</span>
                <span className="text-[7px] font-black uppercase tracking-widest opacity-75 mt-0.5">risk</span>
              </div>
              <div className="w-px h-8 bg-white/30" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <Radio size={8} className="animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-wider">{riskSeverity}</span>
                </div>
                <span className="text-[8px] opacity-70 leading-tight">
                  {riskZones.length} zone{riskZones.length !== 1 ? 's' : ''} · tap for intel
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAP */}
      <MapContainer center={[25, 15]} zoom={2}
        style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
        zoomControl={false} dragging attributionControl={false}>
        <MapFitBounds allRoutes={allRoutes} />
        <ZoomControl position="bottomright" />
        <LocateMeButton />
        <TileLayer url={tileUrls[mapType]} attribution='&copy; CARTO' maxZoom={20} />
        {showSeamarks && (
          <TileLayer url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='&copy; OpenSeaMap' opacity={0.8} maxZoom={18} />
        )}

        {/* Risk zone threat overlays */}
        {riskZones.map(zone => {
          const zoneColor = zone.severity === 'CRITICAL' ? '#dc2626'
            : zone.severity === 'HIGH' ? '#ea580c'
            : '#d97706';
          return (
            <Circle
              key={zone.id}
              center={[zone.lat, zone.lon]}
              radius={zone.radiusKm * 1000}
              pathOptions={{
                color: zoneColor,
                fillColor: zoneColor,
                fillOpacity: 0.07,
                weight: 1.5,
                opacity: 0.5,
                dashArray: '6 5',
              }}
            >
              <Popup>
                <div className="p-1" style={{ minWidth: 180, maxWidth: 220 }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span style={{ fontSize: 13 }}>
                      {zone.type === 'conflict' ? '⚔️' : zone.type === 'piracy' ? '🏴‍☠️' : '🚩'}
                    </span>
                    <p className="font-black text-slate-800 text-xs">{zone.name}</p>
                  </div>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: zoneColor }} className="mb-1">
                    {zone.severity} · {zone.type}
                  </p>
                  <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{zone.reason}</p>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {mapLayers}
        {/* Origin marker — use snapped port position for sea mode */}
        {(isMaritime ? portOriginCoord : sourceCoord) && (
          <Marker
            position={isMaritime && portOriginCoord ? portOriginCoord : sourceCoord}
            icon={srcIcon}
            zIndexOffset={1000}
          >
            <Popup><div className="p-1 text-xs">
              <p className="text-[10px] text-green-600 font-black uppercase mb-0.5">
                {isMaritime ? 'Origin Port' : 'Origin'}
              </p>
              <p className="font-bold text-slate-800">
                {isMaritime && portOriginName ? portOriginName : selectedSource?.display_name?.split(',')[0]}
              </p>
              {isMaritime && portOriginName && (
                <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                  Nearest port to {selectedSource?.display_name?.split(',')[0]}
                </p>
              )}
            </div></Popup>
          </Marker>
        )}
        {/* Destination marker — use snapped port position for sea mode */}
        {(isMaritime ? portDestCoord : destCoord) && (
          <Marker
            position={isMaritime && portDestCoord ? portDestCoord : destCoord}
            icon={dstIcon}
            zIndexOffset={1000}
          >
            <Popup><div className="p-1 text-xs">
              <p className="text-[10px] text-red-500 font-black uppercase mb-0.5">
                {isMaritime ? 'Destination Port' : 'Destination'}
              </p>
              <p className="font-bold text-slate-800">
                {isMaritime && portDestName ? portDestName : selectedDestination?.display_name?.split(',')[0]}
              </p>
              {isMaritime && portDestName && (
                <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                  Nearest port to {selectedDestination?.display_name?.split(',')[0]}
                </p>
              )}
            </div></Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Risk Intelligence Panel — slides in from right */}
      <RiskIntelPanel
        intelligence={activeIntel}
        isOpen={showRiskPanel}
        onClose={() => setShowRiskPanel(false)}
        allRoutes={allRoutes}
        activeRouteIndex={activeRouteIndex}
        onSwitchRoute={onSetActiveRoute}
        freightMode={freightMode}
        aiRecommendation={aiRecommendation}
      />
    </div>
  );
};

export default RouteMap;
