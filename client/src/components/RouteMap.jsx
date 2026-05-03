import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ZoomControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { X, Layers, Bot, Mic, Crosshair, MicOff, Send, Anchor, AlertTriangle } from 'lucide-react';
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

// ── Agentic AI Chat HUD ─────────────────────────────────────────
const RouteAIHUD = ({ isOpen, onClose, onRouteResolved, freightMode }) => {
  const [inputText, setInputText]   = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory]       = useState([{
    type: 'ai',
    text: "Hi! I'm Routy, your supply chain AI. Try: \"Mumbai to Rotterdam\" or just say a country pair like \"India to America\" and I'll help narrow it down."
  }]);

  // Pending ports for 2-step clarification
  const pendingOriginRef = useRef(null);
  const pendingDestRef   = useRef(null);
  const chatEndRef = useRef(null);

  const suggestions = freightMode === 'ship'
    ? ['Route from Shanghai to Rotterdam', 'India to America', 'Red Sea risk status']
    : freightMode === 'air'
    ? ['Route from JFK to Heathrow', 'Dubai to Los Angeles']
    : ['Route from New York to Chicago', 'What is RouteGuardian?'];

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  // Geocode a port name → lat/lon object
  const geocodePort = async (portName) => {
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/search`, { params: { q: portName, limit: 1 }, timeout: 5000 });
      const data = res.data?.results?.[0] || res.data?.[0];
      if (data) {
        const lat = parseFloat(data.lat || data.latitude);
        const lon = parseFloat(data.lon || data.longitude || data.lng);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, display_name: data.display_name || portName };
      }
    } catch {}
    return null;
  };

  // Handle clicking a suggested port option in CLARIFY flow
  const handlePortSelect = async (portName, side) => {
    setHistory(prev => [...prev, { type: 'user', text: portName }]);
    const loc = await geocodePort(portName);
    if (!loc) {
      setHistory(prev => [...prev, { type: 'error', text: `Couldn't locate "${portName}". Try a more specific name.` }]);
      return;
    }
    if (side === 'origin') {
      pendingOriginRef.current = loc;
      if (pendingDestRef.current) {
        // Both resolved
        setHistory(prev => [...prev, { type: 'ai', text: `Route set: ${portName} → ${pendingDestRef.current.display_name?.split(',')[0]}. Calculating route with weather and risk analysis…` }]);
        setTimeout(() => { onRouteResolved({ source: pendingOriginRef.current, destination: pendingDestRef.current }); onClose(); }, 600);
        pendingOriginRef.current = null; pendingDestRef.current = null;
      } else {
        setHistory(prev => [...prev, { type: 'ai', text: `Got it — origin: ${portName}. Now select the destination port above.` }]);
      }
    } else {
      pendingDestRef.current = loc;
      if (pendingOriginRef.current) {
        setHistory(prev => [...prev, { type: 'ai', text: `Route set: ${pendingOriginRef.current.display_name?.split(',')[0]} → ${portName}. Calculating route…` }]);
        setTimeout(() => { onRouteResolved({ source: pendingOriginRef.current, destination: pendingDestRef.current }); onClose(); }, 600);
        pendingOriginRef.current = null; pendingDestRef.current = null;
      } else {
        setHistory(prev => [...prev, { type: 'ai', text: `Destination: ${portName}. Now select the origin port above.` }]);
      }
    }
  };

  const handleAI = async (text) => {
    const cmd = text?.trim();
    if (!cmd) return;
    setHistory(prev => [...prev, { type: 'user', text: cmd }]);
    setInputText('');
    setIsThinking(true);
    pendingOriginRef.current = null;
    pendingDestRef.current = null;
    try {
      const res = await axios.post(`${BASE_URL}/api/ai/intent`, { command: cmd }, { timeout: 60000 });
      if (res.data.success) {
        if (res.data.type === 'MISSION') {
          const reply = res.data.analysis?.voice_text || 'Route found! Calculating…';
          setHistory(prev => [...prev, { type: 'ai', text: reply }]);
          if (res.data.source && res.data.destination) {
            setTimeout(() => { onRouteResolved(res.data); onClose(); }, 700);
          }
        } else if (res.data.type === 'CLARIFY') {
          setHistory(prev => [...prev, {
            type: 'clarify',
            text: res.data.message,
            originOptions: res.data.originOptions || [],
            destOptions: res.data.destOptions || [],
          }]);
        } else {
          setHistory(prev => [...prev, { type: 'ai', text: res.data.reply || 'How can I help?' }]);
        }
      } else {
        setHistory(prev => [...prev, { type: 'error', text: res.data.error || "Try: \"Mumbai to Rotterdam\"." }]);
      }
    } catch {
      setHistory(prev => [...prev, { type: 'error', text: 'Connection error. Please try again.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const startVoice = () => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => { setIsListening(true); setTranscript(''); };
    r.onend   = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { handleAI(e.results[i][0].transcript); setTranscript(''); }
        else interim += e.results[i][0].transcript;
      }
      setTranscript(interim);
    };
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
          className="absolute bottom-20 left-4 z-[1200] w-[320px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-slate-100 flex flex-col overflow-hidden"
          style={{ height: 440 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950">
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${isThinking ? 'bg-blue-400 animate-pulse' : isListening ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-xs font-bold text-white">Routy AI</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Maritime Intelligence</span>
            </div>
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors"><X size={14} /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.type === 'clarify' ? (
                  <div className="w-full space-y-2">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs text-slate-700 leading-relaxed">
                      {msg.text}
                    </div>
                    {msg.originOptions?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1.5 px-1">Origin Port</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.originOptions.map((port, pi) => (
                            <button key={pi} onClick={() => handlePortSelect(port, 'origin')}
                              className="px-2.5 py-1.5 text-[10px] font-bold bg-white border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-50 hover:border-emerald-400 transition-all">
                              {port.split(',')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.destOptions?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black text-red-500 uppercase tracking-wider mb-1.5 px-1">Destination Port</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.destOptions.map((port, pi) => (
                            <button key={pi} onClick={() => handlePortSelect(port, 'dest')}
                              className="px-2.5 py-1.5 text-[10px] font-bold bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-400 transition-all">
                              {port.split(',')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.type === 'user'  ? 'bg-blue-600 text-white rounded-tr-sm font-semibold' :
                    msg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-tl-sm' :
                    'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-sm'
                  }`}>{msg.text}</div>
                )}
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
            {/* Live voice transcript */}
            {isListening && transcript && (
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs bg-blue-100 text-blue-700 border border-blue-200 italic">{transcript}</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick suggestions */}
          <div className="px-3 py-2 flex gap-2 overflow-x-auto border-t border-slate-50 bg-white no-scrollbar">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => handleAI(s)}
                className="whitespace-nowrap px-3 py-1.5 bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wide rounded-full hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0">
                {s}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div className="p-3 border-t border-slate-100 bg-white">
            {/* Voice listening indicator */}
            {isListening && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-xl">
                <div className="flex gap-0.5 items-center">
                  {[0.4, 0.8, 1, 0.8, 0.4].map((h, i) => (
                    <div key={i} className="w-0.5 bg-red-400 rounded-full animate-pulse" style={{ height: `${h * 16}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <span className="text-[10px] font-bold text-red-600">Listening… speak now</span>
              </div>
            )}
            <div className={`flex items-center gap-2 bg-slate-50 border-2 rounded-2xl px-3 py-2 transition-colors ${isListening ? 'border-red-300' : 'border-slate-200 focus-within:border-blue-400'}`}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAI(inputText)}
                placeholder={isListening ? 'Listening…' : 'Type a route or ask a question…'}
                disabled={isListening}
                className="flex-1 bg-transparent outline-none text-xs font-medium text-slate-800 placeholder:text-slate-400"
              />
              <button onClick={inputText.trim() ? () => handleAI(inputText) : startVoice}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                  isListening ? 'bg-red-500 text-white' :
                  inputText.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' :
                  'text-slate-400 hover:text-blue-600'
                }`}>
                {isListening ? <MicOff size={13} /> : inputText.trim() ? <Send size={12} /> : <Mic size={13} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
}) => {
  const [allRoutes, setAllRoutes]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [mapType, setMapType]               = useState('voyager');
  const [showSeamarks, setShowSeamarks]     = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showAIHUD, setShowAIHUD]           = useState(false);
  const [hoveredRoute, setHoveredRoute]     = useState(null);

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
    const lat = parseFloat(selectedSource.lat), lng = parseFloat(selectedSource.lng || selectedSource.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedSource]);

  const destCoord = useMemo(() => {
    if (!selectedDestination) return null;
    const lat = parseFloat(selectedDestination.lat), lng = parseFloat(selectedDestination.lng || selectedDestination.lon);
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }, [selectedDestination]);

  const activeColor = freightMode === 'ship'  ? '#0d47a1'
                    : freightMode === 'air'   ? '#0288d1'
                    : freightMode === 'rail'  ? '#7b1fa2' : '#e65100';

  const mapLayers = useMemo(() => {
    return [...allRoutes]
      .sort((a, b) => a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0)
      .map(route => {
        if (!route.coords?.length) return null;
        const isActive = route.id === activeRouteIndex;
        const isHov    = hoveredRoute === route.id && !isActive;
        const color = isActive ? activeColor : '#9aa0a6';
        const weight = isActive ? 6 : (isHov ? 5 : 4);
        const opacity = isActive ? 1 : (isHov ? 0.75 : 0.5);
        return (
          <React.Fragment key={route.id}>
            <Polyline positions={route.coords} color="white" weight={isActive ? 12 : 8} opacity={isActive ? 0.75 : 0.4} lineCap="round" lineJoin="round" />
            <Polyline positions={route.coords} color={color} weight={weight} opacity={opacity} lineCap="round" lineJoin="round"
              eventHandlers={{
                click: () => onSetActiveRoute?.(route.id),
                mouseover: () => setHoveredRoute(route.id),
                mouseout: () => setHoveredRoute(null),
              }}>
              <Tooltip sticky direction="top" opacity={1} className="!border-0 !shadow-none !p-0 !bg-transparent">
                <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl pointer-events-none whitespace-nowrap">
                  {(route.duration / 60).toFixed(0)} min · {(route.distance / 1000).toFixed(1)} km
                </div>
              </Tooltip>
            </Polyline>
            <NavigationSimulator coords={route.coords} isActive={isActive} isNavigating={isNavigating} speedMultiplier={simSpeed} freightMode={freightMode} />
            {isActive && route.intelligence?.waypointReports?.map((wp, idx) => {
              const total = route.intelligence.waypointReports.length;
              const pos = route.coords[Math.floor(idx * (route.coords.length - 1) / Math.max(total - 1, 1))];
              if (!isValidCoord(pos)) return null;
              return (
                <Marker key={`wp-${idx}`} position={pos} icon={makeWaypointIcon(idx + 1, wp.severity === 'CRITICAL')}>
                  <Popup><div className="p-1 text-xs"><div className="font-black text-blue-600 mb-0.5">{wp.place}</div><div className="text-slate-600">{wp.weather}</div></div></Popup>
                </Marker>
              );
            })}
          </React.Fragment>
        );
      });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed, hoveredRoute, onSetActiveRoute, activeColor, freightMode]);

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

      {/* Maritime badge */}
      {isMaritime && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1050] pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/90 backdrop-blur-sm rounded-full shadow-lg border border-blue-700/50">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Maritime Route Intelligence</span>
            {showSeamarks && <span className="text-[8px] font-bold text-blue-300">· OpenSeaMap</span>}
          </div>
        </div>
      )}

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

      {/* AI HUD trigger — bottom left */}
      <div className="absolute bottom-8 left-3 z-[1050]">
        <RouteAIHUD isOpen={showAIHUD} onClose={() => setShowAIHUD(false)} freightMode={freightMode}
          onRouteResolved={data => {
            setSelectedSource?.(data.source);
            setSelectedDestination?.(data.destination);
            setShowAIHUD(false);
          }} />
        <button onClick={() => setShowAIHUD(v => !v)} title="Ask Routy AI"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow-md border transition-all hover:shadow-lg text-sm font-bold ${showAIHUD ? 'bg-blue-600 text-white border-blue-500' : 'bg-white border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'}`}>
          <Bot size={15} className={showAIHUD ? 'animate-pulse' : ''} />
          <span>Ask Routy AI</span>
        </button>
      </div>

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
        {mapLayers}
        {sourceCoord && (
          <Marker position={sourceCoord} icon={srcIcon} zIndexOffset={1000}>
            <Popup><div className="p-1 text-xs">
              <p className="text-[10px] text-green-600 font-black uppercase mb-0.5">{isMaritime ? 'Origin Port' : 'Origin'}</p>
              <p className="font-bold text-slate-800">{selectedSource?.display_name?.split(',')[0]}</p>
            </div></Popup>
          </Marker>
        )}
        {destCoord && (
          <Marker position={destCoord} icon={dstIcon} zIndexOffset={1000}>
            <Popup><div className="p-1 text-xs">
              <p className="text-[10px] text-red-500 font-black uppercase mb-0.5">{isMaritime ? 'Destination Port' : 'Destination'}</p>
              <p className="font-bold text-slate-800">{selectedDestination?.display_name?.split(',')[0]}</p>
            </div></Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default RouteMap;
