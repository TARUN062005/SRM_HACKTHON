import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ZoomControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { X, Layers, Bot, Mic, Crosshair } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const isValidCoord = c => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);

// ── Port / Anchor marker (maritime) ─────────────────────────────
const makePortIcon = (type, bg, shadow) =>
  L.divIcon({
    html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
      <div style="width:38px;height:38px;border-radius:50%;background:${bg};
        border:3px solid white;box-shadow:0 4px 16px ${shadow};
        display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" y1="22" x2="12" y2="8"/>
          <path d="M5 12H2a10 10 0 0020 0h-3"/>
        </svg>
      </div>
      <div style="position:absolute;top:-2px;right:-2px;width:13px;height:13px;border-radius:50%;
        background:${type === 'origin' ? '#34a853' : '#ea4335'};border:2px solid white;"></div>
    </div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  });

// ── Road / location pin marker ───────────────────────────────────
const makePinIcon = (label, bg, shadowColor) =>
  L.divIcon({
    html: `<div style="position:relative;width:32px;height:42px;display:flex;flex-direction:column;align-items:center;">
      <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${bg};border:2.5px solid white;box-shadow:0 4px 14px ${shadowColor};
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:white;font-size:12px;font-weight:900;font-family:system-ui,sans-serif;">${label}</span>
      </div>
      <div style="width:2px;height:8px;background:${bg};opacity:0.5;border-radius:0 0 2px 2px;"></div>
    </div>`,
    className: '',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -44],
  });

const startPin = makePinIcon('A', '#34a853', 'rgba(52,168,83,0.45)');
const endPin   = makePinIcon('B', '#ea4335', 'rgba(234,67,53,0.45)');

const portOriginIcon = makePortIcon('origin', '#1a73e8', 'rgba(26,115,232,0.45)');
const portDestIcon   = makePortIcon('dest',   '#ea4335', 'rgba(234,67,53,0.45)');

const makeWaypointIcon = (num, critical) =>
  L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;
      background:${critical ? '#ef4444' : '#1a73e8'};border:2.5px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;
      justify-content:center;color:white;font-size:9px;font-weight:900;font-family:system-ui;">${num}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

// ── NavigationSimulator ─────────────────────────────────────────
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
    if (!isActive || !coords || coords.length < 2 || !isNavigating) {
      if (!isNavigating) indexRef.current = 0;
      return;
    }
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

  const isMaritime = freightMode === 'ship';
  const isAir      = freightMode === 'air';

  // Ship icon
  const shipSVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 20s3-3 7-3 7 3 13 3M12 3v10M8 9l4-4 4 4M6 13h12l-2 7H8L6 13z"/>
  </svg>`;

  // Plane icon
  const planeSVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="white">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>`;

  // Arrow (default)
  const arrowSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white">
    <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/>
  </svg>`;

  const iconSVG = isMaritime ? shipSVG : isAir ? planeSVG : arrowSVG;
  const iconBg  = isMaritime ? '#0d47a1' : isAir ? '#0288d1' : '#1a73e8';

  const navIcon = L.divIcon({
    html: `<div style="transform:rotate(${rotation}deg);width:30px;height:30px;
      background:${iconBg};border-radius:${isMaritime ? '6px' : '50%'};border:3px solid white;
      box-shadow:0 0 0 3px rgba(26,115,232,0.3),0 4px 12px rgba(26,115,232,0.4);
      display:flex;align-items:center;justify-content:center;">
      ${iconSVG}
    </div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  return <Marker position={position} icon={navIcon} zIndexOffset={6000} />;
};

// ── Fit bounds when routes change ───────────────────────────────
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
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { map.flyTo([p.coords.latitude, p.coords.longitude], 10, { duration: 1.2 }); setBusy(false); },
      () => setBusy(false)
    );
  };
  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '90px' }}>
      <div className="leaflet-control">
        <button onClick={locate} title="My location"
          className={`w-[30px] h-[30px] bg-white border border-slate-300 rounded flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors ${busy ? 'opacity-60' : ''}`}>
          <Crosshair size={14} className={busy ? 'animate-spin text-blue-500' : 'text-slate-600'} />
        </button>
      </div>
    </div>
  );
};

// ── AI Chat HUD ──────────────────────────────────────────────────
const RouteAIHUD = ({ isOpen, onClose, onRouteResolved, freightMode }) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState([
    { type: 'ai', text: "Hi! I'm Routy, your supply chain AI. Try: \"Route from Shanghai to Rotterdam\" or ask about geopolitical risks." }
  ]);
  const chatEndRef = useRef(null);

  const suggestions = freightMode === 'ship'
    ? ['Route from Shanghai to Rotterdam', 'Red Sea risk alert']
    : freightMode === 'air'
    ? ['Route from JFK to Heathrow', 'Air freight from Dubai to New York']
    : ['Route from New York to Chicago', 'What is RouteGuardian?'];

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  const handleAI = async (text) => {
    if (!text?.trim()) return;
    setHistory(prev => [...prev, { type: 'user', text }]);
    setInputText('');
    setIsThinking(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/ai/intent`, { command: text }, { timeout: 60000 });
      if (res.data.success) {
        const reply = res.data.type === 'MISSION'
          ? (res.data.analysis?.voice_text || res.data.analysis?.summary || 'Route planned!')
          : (res.data.reply || 'Got it!');
        setHistory(prev => [...prev, { type: 'ai', text: reply }]);
        if (res.data.type === 'MISSION' && res.data.source && res.data.destination) {
          setTimeout(() => { onRouteResolved(res.data); onClose(); }, 800);
        }
      } else {
        setHistory(prev => [...prev, { type: 'error', text: res.data.error || "Couldn't parse that. Try: \"Route from X to Y\"." }]);
      }
    } catch {
      setHistory(prev => [...prev, { type: 'error', text: 'Connection error. Please try again.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const startVoice = () => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.'); return; }
    const r = new SR();
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = e => handleAI(e.results[0][0].transcript);
    r.start();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -16, opacity: 0, scale: 0.97 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: -16, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="absolute bottom-20 left-4 z-[1200] w-[300px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-slate-100 flex flex-col overflow-hidden"
          style={{ height: 360 }}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950">
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${isThinking ? 'bg-blue-400 animate-pulse' : isListening ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-xs font-bold text-white">Routy AI</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Supply Chain</span>
            </div>
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors"><X size={14} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.type === 'user'  ? 'bg-blue-600 text-white rounded-tr-sm font-semibold' :
                  msg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-tl-sm' :
                  'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-sm'
                }`}>{msg.text}</div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-3 py-2 flex gap-2 overflow-x-auto border-t border-slate-50 bg-white">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => handleAI(s)}
                className="whitespace-nowrap px-3 py-1.5 bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wide rounded-full hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0">
                {s}
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-slate-100 bg-white">
            <div className={`flex items-center gap-2 bg-slate-50 border-2 rounded-2xl px-3 py-2 transition-colors ${isListening ? 'border-blue-400' : 'border-slate-200'}`}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAI(inputText)}
                placeholder="Ask about a route or risk…"
                className="flex-1 bg-transparent outline-none text-xs font-medium text-slate-800 placeholder:text-slate-400"
              />
              <button onClick={startVoice}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isListening ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                <Mic size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── MAIN MAP COMPONENT ───────────────────────────────────────────
export const RouteMap = ({
  selectedSource, selectedDestination,
  setSelectedSource, setSelectedDestination,
  vehicleMode = 'truck',
  freightMode = 'ship',
  onClearRoute, onRouteData,
  activeRouteIndex = 0, onSetActiveRoute,
  isNavigating = false, simSpeed = 2,
}) => {
  const [allRoutes, setAllRoutes]         = useState([]);
  const [loading, setLoading]             = useState(false);
  const [mapType, setMapType]             = useState('voyager');
  const [showSeamarks, setShowSeamarks]   = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showAIHUD, setShowAIHUD]         = useState(false);
  const [hoveredRoute, setHoveredRoute]   = useState(null);

  // Enable seamarks by default when in ship mode
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
          startLat: parseFloat(start.lat),
          startLng: parseFloat(start.lng || start.lon),
          endLat: parseFloat(end.lat),
          endLng: parseFloat(end.lng || end.lon),
          vehicle: mode,
          sourceName: start.display_name,
          destName: end.display_name,
        },
      });
      if (res.data.success && res.data.routes?.length > 0) {
        const scaleMap = { car: 1, bike: 3, foot: 8, bus: 1.5, truck: 1.3 };
        const scale = scaleMap[mode] || 1;
        const processed = res.data.routes.map((r, i) => ({
          ...r,
          id: i,
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          intelligence: r.intelligence || {},
          baseDuration: r.duration / scale,
        }));
        setAllRoutes(processed);
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
      onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
    }
  }, [selectedSource, selectedDestination, vehicleMode, fetchRoutes]);

  const sourceCoord = useMemo(() => {
    if (!selectedSource) return null;
    const lat = parseFloat(selectedSource.lat);
    const lng = parseFloat(selectedSource.lng || selectedSource.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedSource]);

  const destCoord = useMemo(() => {
    if (!selectedDestination) return null;
    const lat = parseFloat(selectedDestination.lat);
    const lng = parseFloat(selectedDestination.lng || selectedDestination.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedDestination]);

  // Route color by freight mode
  const activeColor = freightMode === 'ship'  ? '#0d47a1'
                    : freightMode === 'air'   ? '#0288d1'
                    : freightMode === 'rail'  ? '#7b1fa2'
                    :                          '#e65100';

  const mapLayers = useMemo(() => {
    const sorted = [...allRoutes].sort((a, b) =>
      a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0
    );
    return sorted.map(route => {
      if (!route.coords?.length) return null;
      const isActive = route.id === activeRouteIndex;
      const isHov    = hoveredRoute === route.id && !isActive;
      const color    = isActive ? activeColor : '#9aa0a6';
      const weight   = isActive ? 6 : (isHov ? 5 : 4);
      const opacity  = isActive ? 1 : (isHov ? 0.75 : 0.5);

      return (
        <React.Fragment key={route.id}>
          <Polyline positions={route.coords} color="white"
            weight={isActive ? 12 : 8} opacity={isActive ? 0.75 : 0.45}
            lineCap="round" lineJoin="round" />
          <Polyline positions={route.coords} color={color}
            weight={weight} opacity={opacity}
            lineCap="round" lineJoin="round"
            eventHandlers={{
              click: () => onSetActiveRoute?.(route.id),
              mouseover: () => setHoveredRoute(route.id),
              mouseout: () => setHoveredRoute(null),
            }}
          >
            <Tooltip sticky direction="top" opacity={1} className="!border-0 !shadow-none !p-0 !bg-transparent">
              <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl pointer-events-none whitespace-nowrap">
                {(route.duration / 60).toFixed(0)} min · {(route.distance / 1000).toFixed(1)} km
              </div>
            </Tooltip>
          </Polyline>

          <NavigationSimulator
            coords={route.coords} isActive={isActive}
            isNavigating={isNavigating} speedMultiplier={simSpeed}
            freightMode={freightMode}
          />

          {isActive && route.intelligence?.waypointReports?.map((wp, idx) => {
            const total = route.intelligence.waypointReports.length;
            const pos = route.coords[Math.floor(idx * (route.coords.length - 1) / Math.max(total - 1, 1))];
            if (!isValidCoord(pos)) return null;
            return (
              <Marker key={`wp-${idx}`} position={pos} icon={makeWaypointIcon(idx + 1, wp.severity === 'CRITICAL')}>
                <Popup>
                  <div className="p-1 text-xs">
                    <div className="font-black text-blue-600 mb-0.5">{wp.place}</div>
                    <div className="text-slate-600">{wp.weather}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </React.Fragment>
      );
    });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed, hoveredRoute, onSetActiveRoute, activeColor, freightMode]);

  // Derived icons based on freight mode
  const isMaritime = freightMode === 'ship';
  const srcIcon    = isMaritime ? portOriginIcon : startPin;
  const dstIcon    = isMaritime ? portDestIcon   : endPin;
  const srcLabel   = isMaritime ? 'Origin Port'  : 'Origin';
  const dstLabel   = isMaritime ? 'Destination Port' : 'Destination';

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
            <motion.div className="h-full bg-blue-500"
              initial={{ x: '-100%' }} animate={{ x: '110%' }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maritime badge — top center */}
      {isMaritime && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1050] pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/90 backdrop-blur-sm rounded-full shadow-lg border border-blue-700/50">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              Maritime Route Intelligence
            </span>
            {showSeamarks && (
              <span className="text-[8px] font-bold text-blue-300 uppercase">· OpenSeaMap Active</span>
            )}
          </div>
        </div>
      )}

      {/* Layer picker — top right */}
      <div className="absolute top-3 right-3 z-[1050] flex flex-col items-end gap-2">
        <AnimatePresence>
          {showLayerPicker && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              className="flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-lg border border-slate-100"
            >
              {/* Map type tiles */}
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
              {/* OpenSeaMap toggle */}
              <button onClick={() => setShowSeamarks(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                  showSeamarks ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
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

      {/* AI HUD — bottom left */}
      <div className="absolute bottom-8 left-3 z-[1050]">
        <RouteAIHUD isOpen={showAIHUD} onClose={() => setShowAIHUD(false)}
          freightMode={freightMode}
          onRouteResolved={data => {
            setSelectedSource?.(data.source);
            setSelectedDestination?.(data.destination);
            setShowAIHUD(false);
          }} />
        <button onClick={() => setShowAIHUD(v => !v)} title="AI Route Assistant"
          className={`w-[34px] h-[34px] rounded-lg shadow-md border flex items-center justify-center transition-all hover:shadow-lg ${showAIHUD ? 'bg-blue-600 text-white border-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <Bot size={15} className={showAIHUD ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* MAP — full absolute fill */}
      <MapContainer
        center={[25, 15]}
        zoom={2}
        style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
        zoomControl={false}
        dragging
        attributionControl={false}
      >
        <MapFitBounds allRoutes={allRoutes} />
        <ZoomControl position="bottomright" />
        <LocateMeButton />

        {/* Base tile layer */}
        <TileLayer
          url={tileUrls[mapType]}
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          maxZoom={20}
        />

        {/* OpenSeaMap overlay (maritime navigation marks) */}
        {showSeamarks && (
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
            opacity={0.8}
            maxZoom={18}
          />
        )}

        {/* Routes */}
        {mapLayers}

        {/* Origin marker */}
        {sourceCoord && (
          <Marker position={sourceCoord} icon={srcIcon} zIndexOffset={1000}>
            <Popup>
              <div className="p-1 text-xs">
                <p className="text-[10px] text-green-600 font-black uppercase mb-0.5">{srcLabel}</p>
                <p className="font-bold text-slate-800">{selectedSource?.display_name?.split(',')[0]}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination marker */}
        {destCoord && (
          <Marker position={destCoord} icon={dstIcon} zIndexOffset={1000}>
            <Popup>
              <div className="p-1 text-xs">
                <p className="text-[10px] text-red-500 font-black uppercase mb-0.5">{dstLabel}</p>
                <p className="font-bold text-slate-800">{selectedDestination?.display_name?.split(',')[0]}</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default RouteMap;
