import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, ZoomControl, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import {
  AlertTriangle, Navigation, ChevronRight, Play, X, Clock, Info, Activity, Wind, Zap,
  MapPin, ShieldAlert, Globe, ArrowRight, Shield, Sun, CloudRain, Footprints, Car,
  Bike, Bus, Truck, ExternalLink, Volume2, Mic, Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// Force HMR Refresh: 2026-03-28T16:55:00Z


// --- VISUAL THEME (Tactical Grade) ---
const THEME = {
  colors: ['#2563eb', '#10b981', '#ef4444'], // Blue (Optimal), Green (Balanced), Red (Alternative)
  weights: [8, 6, 6],
  opacities: [1, 0.7, 0.5]
};

/**
 * HELPER: Map condition to Icon
 */
const getWeatherIcon = (condition) => {
  if (!condition) return Wind;
  if (condition.includes("Storm")) return Zap;
  if (condition.includes("Heavy Rain")) return CloudRain;
  if (condition.includes("Rain")) return CloudRain;
  if (condition.includes("Clear") || condition.includes("Sun")) return Sun;
  return Wind;
};

// HELPER: Coordinate Integrity Check
const isValidCoord = (c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Fix typical leaflet marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * NavigationSimulator: Moves an indicator with directional bearing and high-fidelity velocity
 */
const NavigationSimulator = ({ coords, isActive, color, speedMultiplier = 1, isNavigating }) => {
  const map = useMap();
  const [position, setPosition] = useState(coords && coords.length > 0 ? coords[0] : null);
  const [rotation, setRotation] = useState(0);
  const indexRef = useRef(0);
  const rafRef = useRef();

  // Helper to calculate bearing
  const getBearing = (p1, p2) => {
    if (!p1 || !p2) return 0;
    const lat1 = (p1[0] * Math.PI) / 180;
    const lon1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const lon2 = (p2[1] * Math.PI) / 180;
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  useEffect(() => {
    if (!isActive || !coords || coords.length < 2 || !isNavigating) {
      if (!isNavigating) indexRef.current = 0;
      return;
    }

    const animate = () => {
      if (!isNavigating) return;

      const increment = Math.max(1, Math.floor(speedMultiplier * 2));
      const nextIndex = Math.min(indexRef.current + increment, coords.length - 1);

      const prev = coords[indexRef.current];
      const cur = coords[nextIndex];

      if (cur) {
        setRotation(getBearing(prev, cur));
        setPosition(cur);
        indexRef.current = nextIndex;

        // Auto-center map during mission preview
        if (isActive) map.panTo(cur, { animate: true, duration: 0.1 });

        if (nextIndex >= coords.length - 1) {
          indexRef.current = 0; // Restart loop
        }

        rafRef.current = setTimeout(() => {
          requestAnimationFrame(animate);
        }, 300 / speedMultiplier);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(rafRef.current);
    };
  }, [isActive, coords, isNavigating, speedMultiplier, map]);

  if (!isActive || !position || !isValidCoord(position)) return null;

  const arrowIcon = L.divIcon({
    html: `
      <div style="transform: rotate(${rotation}deg); color: ${color}; filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.4));">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
           <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/>
        </svg>
      </div>`,
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  return <Marker position={position} icon={arrowIcon} zIndexOffset={5000} />;
};

/**
 * MapInteractionHandler: Fit bounds
 */
const MapInteractionHandler = ({ allRoutes }) => {
  const map = useMap();
  useEffect(() => {
    if (allRoutes && allRoutes.length > 0) {
      // Filter for valid coordinates to avoid NaN/Invalid bounds
      const allCoords = allRoutes.flatMap(r => r.coords).filter(c => isValidCoord(c));

      if (allCoords.length > 0) {
        try {
          const bounds = L.polyline(allCoords).getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [100, 100], duration: 1.0 });
          }
        } catch (e) {
          console.warn("[MAP] Bound resolution failure:", e.message);
        }
      }
    }
  }, [allRoutes, map]);
  return null;
};

// --- MAIN ROUTE MAP ---

export const RouteMap = ({
  selectedSource, selectedDestination, onManualReset,
  vehicleMode = 'car', onClearRoute, onRouteData,
  setSelectedSource, setSelectedDestination, setShowSearchPanel
}) => {
  const [allRoutes, setAllRoutes] = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(2);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [mapType, setMapType] = useState('voyager');
  const [showAIHUD, setShowAIHUD] = useState(false);

  const onRouteDataRef = useRef(onRouteData);
  useEffect(() => { onRouteDataRef.current = onRouteData; }, [onRouteData]);

  const mapStyles = {
    voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    traffic: "https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=HIDDEN"
  };

  const fetchRoutes = useCallback(async (start, end, mode) => {
    // Corrected Heuristic: Update UI instantly without cumulative multiplier errors
    setAllRoutes(prev => {
      if (prev.length > 0) {
        const scaleMap = { 'car': 1, 'bike': 3, 'foot': 8, 'bus': 1.5, 'truck': 1.3 };
        const scale = scaleMap[mode] || 1;

        return prev.map(r => {
          // If we don't have baseDuration yet (first load), treat current duration as base (likely car)
          const base = r.baseDuration || r.duration;
          return {
            ...r,
            duration: base * scale,
            baseDuration: base // Preserve ground-truth
          };
        });
      }
      return prev;
    });

    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/directions`, {
        params: {
          startLat: parseFloat(start.lat), startLng: parseFloat(start.lng || start.lon),
          endLat: parseFloat(end.lat), endLng: parseFloat(end.lng || end.lon),
          vehicle: mode,
          sourceName: selectedSource?.display_name,
          destName: selectedDestination?.display_name
        }
      });
      if (res.data.success && res.data.routes?.length > 0) {
        const scaleMap = { 'car': 1, 'bike': 3, 'foot': 8, 'bus': 1.5, 'truck': 1.3 };
        const currentScale = scaleMap[mode] || 1;

        const processed = res.data.routes.map((r, i) => ({
          ...r,
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          color: THEME.colors[i % THEME.colors.length],
          intelligence: r.intelligence || {},
          // Store ground-truth for future scaling
          baseDuration: r.duration / currentScale
        }));
        setAllRoutes(processed);
        setActiveRouteIndex(0);
        if (onRouteDataRef.current) onRouteDataRef.current({ allRoutes: processed, activeRouteIndex: 0 });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  // Handle vehicleMode changes instantly with heuristic if possible
  useEffect(() => {
    if (selectedSource && selectedDestination) {
      const timer = setTimeout(() => {
        fetchRoutes(selectedSource, selectedDestination, vehicleMode);
      }, 300); // 300ms debounce
      return () => clearTimeout(timer);
    } else {
      setAllRoutes([]);
      setIsNavigating(false);
      if (onRouteData) onRouteData({ allRoutes: [], activeRouteIndex: 0 });
    }
  }, [selectedSource, selectedDestination, vehicleMode, fetchRoutes]);

  const [hoveredInfo, setHoveredInfo] = useState(null);

  // HELPER: Compute distance from start to hover point on route
  const getEtaToPoint = (route, e) => {
    const coords = route.coords;
    const hoverLatLng = e.latlng;

    // Find closest index in course
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = L.latLng(coords[i]).distanceTo(hoverLatLng);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }

    // Estimate total time based on fraction of total distance
    const totalDist = route.distance;
    const totalDuration = route.duration;

    // Estimate cumulative distance along polyline to that point
    let partialDist = 0;
    for (let i = 1; i <= closestIdx; i++) {
      partialDist += L.latLng(coords[i - 1]).distanceTo(L.latLng(coords[i]));
    }

    const etaAtPoint = (partialDist / totalDist) * totalDuration;
    return {
      distKm: (partialDist / 1000).toFixed(1),
      durMin: (etaAtPoint / 60).toFixed(0)
    };
  };

  const mapLayers = useMemo(() => {
    const sorted = [...allRoutes].sort((a, b) => a.id === activeRouteIndex ? 1 : -1);
    return sorted.map((route) => {
      if (!route.coords || route.coords.length === 0) return null;
      const isActive = route.id === activeRouteIndex;
      // Fixed Colors (Route 0 is Blue, 1 is Green, 2 is Red)
      const pathColor = THEME.colors[route.id % THEME.colors.length];

      return (
        <React.Fragment key={route.id}>
          {/* Neon Under-glow for high visibility */}
          <Polyline
            positions={route.coords}
            color={pathColor}
            weight={isActive ? 12 : 8}
            opacity={0.15}
            lineCap="round"
          />
          {/* Tactical Ground-Truth Path */}
          <Polyline
            positions={route.coords}
            color={pathColor}
            weight={isActive ? 8 : 4}
            opacity={isActive ? 1 : 0.6}
            lineCap="round"
            lineJoin="round"
            eventHandlers={{
              click: () => setActiveRouteIndex(route.id),
              mouseover: (e) => {
                const info = getEtaToPoint(route, e);
                setHoveredInfo({ ...info, id: route.id });
                e.target.setStyle({ weight: isActive ? 10 : 6, opacity: 1 });
              },
              mousemove: (e) => {
                const info = getEtaToPoint(route, e);
                setHoveredInfo({ ...info, id: route.id });
                e.target.setStyle({ weight: 10, opacity: 1 });
              },
              mouseout: (e) => {
                setHoveredInfo(null);
                e.target.setStyle({ weight: isActive ? 8 : 4, opacity: isActive ? 1 : 0.4 });
              }
            }}
          >
            <Tooltip sticky direction="top" opacity={1} className="tactical-tooltip">
              <div className="flex flex-col items-center bg-slate-900 border border-slate-700 text-white p-3 rounded-2xl shadow-2xl min-w-[120px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-primary-500 mb-2">Path Intelligence</div>

                {hoveredInfo && hoveredInfo.id === route.id ? (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xl font-black">{hoveredInfo.durMin} <span className="text-[10px] opacity-60">MIN</span></div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ETA TO POINT • {hoveredInfo.distKm} KM</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <div className="text-xs font-black">{(route.distance / 1000).toFixed(1)} <span className="text-[8px] opacity-60">KM</span></div>
                    <div className="w-1 h-3 bg-white/10 rounded-full" />
                    <div className="text-xs font-black">{(route.duration / 60).toFixed(0)} <span className="text-[8px] opacity-60">MIN</span></div>
                  </div>
                )}
              </div>
            </Tooltip>
          </Polyline>
          <NavigationSimulator
            coords={route.coords} isActive={isActive}
            color={pathColor} isNavigating={isNavigating} speedMultiplier={simSpeed}
          />
          {isActive && route.intelligence?.waypointReports?.map((wp, idx) => {
            const wpPos = wp.coords || (route.coords && route.coords.length > 0 ? route.coords[Math.floor(idx * (route.coords.length - 1) / (route.intelligence.waypointReports.length - 1))] : null);
            if (!isValidCoord(wpPos)) return null;

            return (
              <Marker
                key={`wp-${idx}`}
                position={wpPos}
                icon={L.divIcon({
                  className: 'custom-wp-icon',
                  html: `<div class="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border-2 ${wp.severity === 'CRITICAL' ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'border-primary-500'} flex items-center justify-center text-[10px] font-black shadow-lg">${idx + 1}</div>`,
                  iconSize: [24, 24]
                })}
              >
                <Popup>
                  <div className="p-1 font-sans">
                    <div className="text-[10px] font-black text-primary-600 uppercase mb-0.5">{wp.place}</div>
                    <div className="text-xs font-bold text-slate-800">{wp.weather}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </React.Fragment>
      );
    });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed, hoveredInfo]);

  return (
    <div className="w-full h-full relative bg-slate-900 overflow-hidden">
      {/* Simulation Controls HUD */}
      <AnimatePresence>
        {allRoutes.length > 0 && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] w-full max-w-[280px] flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl px-4 py-3 border border-white dark:border-slate-800 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[1.8rem] flex items-center gap-4 pointer-events-auto w-full">
              <button
                onClick={() => setIsNavigating(!isNavigating)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${isNavigating ? 'bg-red-500 text-white shadow-xl shadow-red-500/20' : 'bg-primary-600 text-white shadow-xl shadow-primary-600/30 hover:scale-105 active:scale-95'}`}
              >
                {isNavigating ? <X size={18} /> : <Play size={20} className="translate-x-0.5" />}
              </button>
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex justify-between items-center text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <span className="truncate">Sim Velocity</span>
                  <span className="text-primary-600 ml-1">x{simSpeed}</span>
                </div>
                <input
                  type="range" min="1" max="10" step="1"
                  value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))}
                  className="w-full h-1 accentuate-primary-600 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Content Notification */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center"
          >
            <div className="relative">
              <div className="w-24 h-24 border-2 border-primary-600/20 rounded-full animate-ping" />
              <div className="absolute inset-0 w-24 h-24 border-t-2 border-primary-600 rounded-full animate-spin" />
              <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-600 animate-pulse" size={32} />
            </div>
            <p className="mt-8 font-black text-[10px] uppercase tracking-[0.4em] text-white">Synthesizing Tactical Mesh...</p>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Layer Control Retractable HUD (Bottom Left) */}
      <div className="absolute bottom-10 left-6 z-[1050] flex flex-col items-start gap-4">
        <AnimatePresence>
          {showLayerPicker && (
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -100, opacity: 0 }}
              className="flex gap-4 p-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-3xl rounded-[2rem] border border-white dark:border-slate-800 shadow-2xl"
            >
              {[
                { id: 'voyager', label: 'Roads', icon: <Navigation size={14} />, img: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=200' },
                { id: 'satellite', label: 'Tactical', icon: <Globe size={14} />, img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=200' },
                { id: 'dark', label: 'Dark Ops', icon: <Zap size={14} />, img: 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&q=80&w=200' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMapType(t.id)}
                  className={`group relative w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all shadow-xl active:scale-90 ${mapType === t.id ? 'border-primary-600 ring-4 ring-primary-600/10' : 'border-white dark:border-slate-800'}`}
                >
                  <img src={t.img} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={t.label} />
                  <div className={`absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors`} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white pointer-events-none drop-shadow-lg">
                    {t.icon}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-widest text-white py-0.5 text-center transition-all opacity-0 group-hover:opacity-100">
                    {t.label}
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowAIHUD(!showAIHUD)}
            className={`w-14 h-14 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white dark:border-slate-800 shadow-xl flex items-center justify-center transition-all ${showAIHUD ? 'bg-primary-600 text-white border-primary-600 shadow-primary-600/30' : 'text-slate-600 dark:text-slate-300 hover:scale-110 active:scale-90'}`}
          >
            <Bot size={24} className={showAIHUD ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            className={`w-14 h-14 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white dark:border-slate-800 shadow-xl flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all ${showLayerPicker ? 'rotate-90 bg-primary-600 text-white border-primary-600' : 'hover:scale-110 active:scale-90'}`}
          >
            {showLayerPicker ? <X size={24} /> : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 18-9-5 9-5 9 5-9 5Z" /><path d="m3 10 9 5 9-5" /><path d="m3 6 9 5 9-5" /></svg>
            )}
          </button>
        </div>
      </div>

      <RouteAIHUD
        isOpen={showAIHUD}
        onClose={() => setShowAIHUD(false)}
        onRouteResolved={(data) => {
          // Protocol v20.3: Simulate Manual Handshake
          // We set the targets, and the RouteMap's useEffect will automatically
          // trigger the manual fetchRoutes() logic (weather, news, etc).
          setSelectedSource(data.source);
          setSelectedDestination(data.destination);

          if (setShowSearchPanel) setShowSearchPanel(false);
          setShowAIHUD(false);
        }}
      />

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={true}>
        <MapInteractionHandler allRoutes={allRoutes} />
        <ZoomControl position="bottomright" />
        <TileLayer url={mapStyles[mapType]} attribution='&copy; CARTO' />
        {mapLayers}
      </MapContainer>
    </div>
  );
};

/**
 * SidePanel: Intelligent Analysis Dashboard
 */
const SidePanel = ({
  selectedSource, selectedDestination, allRoutes = [],
  activeRouteIndex = 0, setActiveRouteIndex, onClearRoute
}) => {
  const [showWeatherChain, setShowWeatherChain] = useState(true);

  if (allRoutes.length === 0) return null;
  const activeRoute = allRoutes[activeRouteIndex] || allRoutes[0];
  const intel = activeRoute?.intelligence;

  // Global Severity Logic based on 35km nodes
  const hasCritical = intel?.waypointReports?.some(w => w.severity === 'CRITICAL');
  const globalSeverity = hasCritical ? 'CRITICAL' : (intel?.waypointReports?.some(w => w.severity === 'CAUTION') ? 'CAUTION' : 'STABLE');

  // Status mapping for visual styles
  const getStatusColor = (sev) => {
    if (sev === 'CRITICAL') return 'bg-red-500 shadow-red-600/20';
    if (sev === 'CAUTION') return 'bg-amber-500 shadow-amber-600/20';
    return 'bg-emerald-500 shadow-emerald-600/20';
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 relative">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl text-white shadow-lg ${globalSeverity === 'CRITICAL' ? 'bg-red-600 shadow-red-600/20' : 'bg-primary-600 shadow-primary-600/20'}`}>
              <Shield size={18} />
            </div>
            <h2 className="font-black text-xl tracking-tighter uppercase dark:text-white">Objective Hub</h2>
          </div>
          <button onClick={onClearRoute} className="p-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition active:scale-90"><X size={18} /></button>
        </div>

        {/* Origin & Destination Display */}
        <div className="px-4 py-4 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-start gap-4 uppercase relative">
            <div className="relative flex flex-col items-center pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-600/20 z-10" />
              <div className="w-0.5 h-8 bg-slate-100 dark:bg-slate-800 my-1" />
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 ring-4 ring-red-600/20 z-10" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="text-[10px] font-black text-slate-400 tracking-widest leading-none mb-1">Origin Node</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{selectedSource?.display_name || "Point Alpha"}</div>
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-400 tracking-widest leading-none mb-1">Target Point</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{selectedDestination?.display_name || "Point Beta"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Vital Stats HUD */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-primary-600 text-white p-4 rounded-2xl shadow-xl shadow-primary-600/10">
            <div className="flex justify-between items-start mb-1">
              <div className="text-[10px] font-black uppercase opacity-60">Length</div>
              <div className="text-[10px] font-black uppercase opacity-60">Time</div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black leading-none">{(activeRoute.distance / 1000).toFixed(0)} <span className="text-[10px]">KM</span></div>
              <div className="text-sm font-black opacity-90">{(activeRoute.duration / 60).toFixed(0)} <span className="text-[8px]">MIN</span></div>
            </div>
          </div>
          <button
            onClick={() => setShowWeatherChain(!showWeatherChain)}
            className={`p-4 rounded-2xl shadow-xl flex flex-col items-start transition-all border ${showWeatherChain ? 'bg-slate-900 border-slate-800 text-white shadow-2xl' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-400 opacity-60 hover:opacity-100'}`}
          >
            <div className="text-[10px] font-black uppercase opacity-60 mb-1">{(activeRoute.distance / 1000).toFixed(0)} KM</div>
            <div className="text-xl font-black leading-none flex items-center gap-2">
              Chain <CloudRain size={16} className={showWeatherChain ? 'text-primary-500' : ''} />
            </div>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Mission Route Selector (Exactly 3 Routes) */}
        <div className="space-y-4">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2 mb-2">Tactical Route Selection</div>
          <div className="grid grid-cols-3 gap-2">
            {allRoutes.slice(0, 3).map((route, idx) => {
              const isActive = idx === activeRouteIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveRouteIndex(idx)}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-1.5 ${isActive
                    ? 'border-primary-600 bg-primary-600/10 shadow-lg shadow-primary-600/5'
                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                >
                  <div className={`text-[8px] font-black uppercase tracking-tighter ${isActive ? 'text-primary-600' : 'text-slate-400'}`}>
                    Route {String.fromCharCode(65 + idx)}
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-white leading-none">
                    {(route.duration / 60).toFixed(0)}<span className="text-[8px] opacity-60 ml-0.5">MIN</span>
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">
                    {(route.distance / 1000).toFixed(0)}KM
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {showWeatherChain && intel && intel.waypointReports && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
            {/* Weather Chain Section (Already there) */}
            {/* Strategic Corridor Intel (Geography-based) */}
            <div className="flex items-center justify-between px-2">
              <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Strategic Corridor Intel</div>
              <div className="px-2 py-1 bg-primary-600/10 text-primary-600 rounded-md text-[8px] font-black">REGIONAL TELEMETRY</div>
            </div>

            <div className="flex flex-col gap-5">
              {intel.waypointReports.map((item, i) => {
                const WeatherIcon = getWeatherIcon(item.weather);
                const severityColor =
                  item.severity === 'CRITICAL' ? 'bg-red-500 shadow-red-500/20' :
                    item.severity === 'CAUTION' ? 'bg-amber-500 shadow-amber-500/20' :
                      'bg-blue-500 shadow-blue-500/20';

                const parts = (item.weather || "Clear • 25°C").split(" • ");

                return (
                  <div key={i} className="flex items-center gap-6 relative group">
                    {/* Connection Line */}
                    {i < intel.waypointReports.length - 1 && (
                      <div className="absolute left-[23px] top-12 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800 z-0" />
                    )}

                    {/* Geography Node Diagram */}
                    <div className="flex flex-col items-center z-10 shrink-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all duration-300 group-hover:scale-110 ${severityColor}`}>
                        <WeatherIcon size={20} strokeWidth={2.5} />
                      </div>
                    </div>

                    {/* Tactical Nexus Detail */}
                    <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[1.5rem] p-5 shadow-sm group-hover:border-primary-500/30 transition-all flex justify-between items-center pr-6">
                      <div className="min-w-0">
                        <div className="text-[9px] font-black text-primary-500 uppercase tracking-widest mb-1 opacity-60">
                          Nexus {i + 1}
                        </div>
                        <div className="text-[13px] font-black text-slate-900 dark:text-white uppercase leading-tight truncate">
                          {item.place}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-black text-slate-900 dark:text-white leading-none">
                          {parts[0]}
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase mt-1">
                          {parts[1]}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tactical Briefing (Logistics Risk Alerts) */}
            {intel.newsFeed && intel.newsFeed.length > 0 && (
              <div className="pt-8 space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Tactical Briefing (Risk Alerts)</div>
                  <div className="px-2 py-1 bg-red-600/10 text-red-600 rounded-md text-[8px] font-black">{intel.newsFeed.length} DISRUPTIONS</div>
                </div>

                <div className="grid gap-4">
                  {intel.newsFeed.map((news, i) => (
                    <div key={i} className="bg-slate-950/5 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 hover:border-red-500/30 transition-all space-y-4 group">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-wrap gap-1.5">
                          {news.categories?.map((cat, ci) => (
                            <span key={ci} className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${cat === 'conflict' ? 'bg-red-600 text-white' :
                              cat === 'weather' ? 'bg-blue-600 text-white' :
                                'bg-amber-500 text-white'
                              }`}>
                              {cat}
                            </span>
                          ))}
                        </div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase">{new Date(news.date).toLocaleDateString()}</div>
                      </div>

                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug group-hover:text-red-500 transition-colors">
                        {news.title}
                      </h4>

                      <div className="flex justify-between items-center">
                        <div className="text-[9px] font-bold text-slate-400 uppercase">{news.source || 'Intel Link'}</div>
                        <a
                          href={news.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-black text-primary-500 hover:text-primary-600 flex items-center gap-1 uppercase tracking-tighter"
                        >
                          Analyze Brief <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

RouteMap.SidePanel = SidePanel;

// --- FEATURE 18: DETERMINISTIC AI AGENT COMPONENT (Protocol v18) ---
const RouteAIHUD = ({ isOpen, onClose, onRouteResolved }) => {
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [statusText, setStatusText] = useState("INITIATE MISSION");
  const [history, setHistory] = useState([
    { type: 'ai', summary: "MISSION COMMAND SYNC", voice_text: "I am Routy, your Tactical Logistics Operational Assistant. I help optimize hazardous routes and analyze predictive mission risks. State your targets or select a protocol below." }
  ]);

  const chatEndRef = useRef(null);

  // Auto-scroll to latest neural insight
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const SUGGESTIONS = [
    "What is RouteGuardian?",
    "How does it help people?",
    "How does it help customers?",
    "What can you help with?"
  ];

  const speak = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const startVoice = () => {
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");
    const recognition = new SpeechRecognition();
    recognition.onstart = () => { setIsListening(true); setStatusText("LISTENING"); speak("Listening."); };
    recognition.onend = () => { setIsListening(false); if (statusText === "LISTENING") setStatusText("INITIATE MISSION"); };
    recognition.onresult = (e) => handleAI(e.results[0][0].transcript);
    recognition.start();
  };

  const handleAI = async (text) => {
    if (!text) return;
    setHistory(prev => [...prev, { type: 'user', text }]);
    setIsThinking(true);
    setStatusText("PLANNING NEURAL ROUTE");
    speak("Planning neural route.");
    try {
      const res = await axios.post(`${BASE_URL}/api/ai/intent`, { command: text }, { timeout: 60000 });
      if (res.data.success) {
        if (res.data.type === 'MISSION') {
          setHistory(prev => [...prev, { type: 'ai', ...res.data.analysis }]);
          speak(res.data.analysis.voice_text || res.data.analysis.summary);
          setStatusText("INITIATING MISSION");
          if (res.data.source && res.data.destination) {
            setTimeout(() => onRouteResolved(res.data), 1200);
          }
        } else {
          // CHAT MODE
          setHistory(prev => [...prev, { type: 'ai', summary: "Routy Insight.", voice_text: res.data.reply }]);
          speak(res.data.reply);
          setStatusText("INITIATE MISSION");
        }
      } else {
        const errorMsg = res.data.error || "Neural Desync: Targets unclear.";
        setHistory(prev => [...prev, { type: 'error', summary: errorMsg }]);
        setStatusText("INITIATE MISSION");
      }
    } catch (err) {
      console.error("AI HUD Failure:", err);
      const errorMsg = err.code === 'ECONNABORTED' ? "Neural Latency Timeout (60s)." : "Mission Link Lost.";
      setHistory(prev => [...prev, { type: 'error', summary: errorMsg }]);
      setStatusText("INITIATE MISSION");
    } finally {
      setIsThinking(false);
      setInputText("");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }}
          className="fixed left-6 bottom-32 z-[1200] w-full max-w-[320px] bg-white border border-slate-200 shadow-[20px_40px_80px_-15px_rgba(0,0,0,0.2)] flex flex-col h-[380px] rounded-[32px] overflow-hidden"
        >
          {/* HUD Header */}
          <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-950">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isThinking ? 'bg-primary-400 animate-ping' : isListening ? 'bg-rose-500' : 'bg-emerald-400'}`} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white font-sans">ROUTY | Tactical Optimizer</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-50 rounded-md transition-colors"><X size={14} className="text-slate-400" /></button>
          </div>

          {/* Chat History Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar bg-white">
            {history.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-[24px] px-5 py-4 shadow-sm text-[12px] leading-relaxed font-sans ${msg.type === 'user' ? 'bg-primary-600 text-white rounded-tr-none font-black' : msg.type === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none font-bold'}`}>
                  {msg.voice_text || msg.summary || msg.text}

                  {msg.type === 'ai' && msg.reasons && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {msg.reasons.map((r, ri) => (
                        <span key={ri} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-400 text-[8px] uppercase font-black rounded-lg">{r}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300 ml-2">
                <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions Layer */}
          <div className="px-5 py-4 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth border-t border-slate-50 bg-white">
            {SUGGESTIONS.map((s, si) => (
              <button
                key={si}
                onClick={() => handleAI(s)}
                className="whitespace-nowrap px-4 py-2 bg-slate-50 border border-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest rounded-full hover:border-primary-500 hover:text-primary-600 transition-all hover:shadow-sm active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-5 border-t border-slate-100 bg-white">
            <div className={`relative flex items-center bg-slate-50 border-2 rounded-[24px] transition-all px-4 py-3 ${isListening ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-slate-100'}`}>
              <input
                value={inputText} onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAI(inputText)}
                placeholder="MISSION COMMAND..."
                className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-[11px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary-600/20 transition-all shadow-sm"
              />
              <button onClick={startVoice} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-white text-slate-400 border border-slate-200 hover:text-slate-600'}`}>
                <Mic size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RouteMap;
