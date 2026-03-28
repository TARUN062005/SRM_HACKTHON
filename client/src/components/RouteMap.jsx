import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, ZoomControl, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { AlertTriangle, Navigation, ChevronRight, Play, X, Clock, Info, Activity, Wind, Zap, MapPin, ShieldAlert, Globe, ArrowRight, Shield, Sun, CloudRain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// Force HMR Refresh: 2026-03-28T13:46:00Z


// --- VISUAL THEME ---
const THEME = {
  colors: ['#2563eb', '#64748b', '#94a3b8'],
  weights: [8, 5, 5],
  opacities: [1, 0.7, 0.5]
};

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Fix typical leaflet marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * NavigationSimulator: Moves an indicator with high-fidelity interpolation
 */
const NavigationSimulator = ({ coords, isActive, color, speedMultiplier = 1, isNavigating }) => {
  const map = useMap();
  const [position, setPosition] = useState(coords && coords.length > 0 ? coords[0] : null);
  const [rotation, setRotation] = useState(0);
  const indexRef = useRef(0);
  const rafRef = useRef();

  useEffect(() => {
    if (!isActive || !coords || coords.length < 2 || !isNavigating) {
      if (!isNavigating) indexRef.current = 0;
      return;
    }

    const animate = () => {
      // Deep check inside animation frame to handle quick state changes
      if (!isNavigating) return;

      indexRef.current = (indexRef.current + Math.max(1, Math.floor(speedMultiplier / 2)));
      if (indexRef.current >= coords.length) {
        indexRef.current = 0;
      }

      const cur = coords[indexRef.current];
      if (cur) {
        setPosition(cur);
        map.panTo(cur, { animate: true, duration: 0.1 });
      }
      rafRef.current = setTimeout(() => {
        if (isNavigating) requestAnimationFrame(animate);
      }, 100);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(rafRef.current);
    };
  }, [isActive, coords, isNavigating, speedMultiplier, map]);

  if (!isActive || !position) return null;

  const arrowIcon = L.divIcon({
    html: `<div style="transform: rotate(${rotation}deg); color: ${color};"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/></svg></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
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
      const allCoords = allRoutes.flatMap(r => r.coords);
      if (allCoords.length > 0) {
        const bounds = L.polyline(allCoords).getBounds();
        map.fitBounds(bounds, { padding: [100, 100], duration: 1.0 });
      }
    }
  }, [allRoutes, map]);
  return null;
};

// --- MAIN ROUTE MAP ---

export const RouteMap = ({
  selectedSource, selectedDestination, onManualReset,
  vehicleMode = 'car', onClearRoute, onRouteData,
}) => {
  const [allRoutes, setAllRoutes] = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(2);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [mapType, setMapType] = useState('voyager');

  const onRouteDataRef = useRef(onRouteData);
  useEffect(() => { onRouteDataRef.current = onRouteData; }, [onRouteData]);

  const mapStyles = {
    voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    traffic: "https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=HIDDEN"
  };

  const fetchRoutes = useCallback(async (start, end, mode) => {
    // Heuristic scaling for instant UI feedback
    setAllRoutes(prev => {
      if (prev.length > 0) {
        const scaleMap = { 'car': 1, 'bike': 3.5, 'foot': 9, 'bus': 1.2, 'truck': 1.3 };
        const scale = scaleMap[mode] || 1;
        const heuristicallyUpdated = prev.map(r => ({
          ...r,
          duration: r.duration * scale
        }));
        if (onRouteDataRef.current) onRouteDataRef.current({ allRoutes: heuristicallyUpdated, activeRouteIndex: 0 });
        return heuristicallyUpdated;
      }
      return prev;
    });

    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/directions`, {
        params: {
          startLat: parseFloat(start.lat), startLng: parseFloat(start.lng || start.lon),
          endLat: parseFloat(end.lat), endLng: parseFloat(end.lng || end.lon),
          vehicle: mode
        }
      });
      if (res.data.success && res.data.routes?.length > 0) {
        const processed = res.data.routes.map((r, i) => ({
          ...r,
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          color: THEME.colors[i % THEME.colors.length]
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

  const mapLayers = useMemo(() => {
    const sorted = [...allRoutes].sort((a, b) => a.id === activeRouteIndex ? 1 : -1);
    return sorted.map((route) => {
      const isActive = route.id === activeRouteIndex;
      return (
        <React.Fragment key={route.id}>
          <Polyline
            positions={route.coords}
            color={route.color}
            weight={isActive ? 8 : 4}
            opacity={isActive ? 1 : 0.4}
            lineCap="round"
            lineJoin="round"
            eventHandlers={{ 
              click: () => setActiveRouteIndex(route.id),
              mouseover: (e) => e.target.setStyle({ weight: isActive ? 10 : 6, opacity: 1 }),
              mouseout: (e) => e.target.setStyle({ weight: isActive ? 8 : 4, opacity: isActive ? 1 : 0.4 })
            }}
          >
            <Tooltip sticky direction="top" opacity={1} className="tactical-tooltip">
              <div className="flex flex-col items-center bg-slate-900 text-white p-2 rounded-lg border border-slate-700 shadow-2xl">
                <div className="text-[8px] font-black uppercase tracking-widest text-primary-500 mb-1">Path Intelligence</div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                   <div className="text-xs font-black">{(route.distance / 1000).toFixed(1)} <span className="text-[8px] opacity-60">KM</span></div>
                   <div className="w-1 h-3 bg-white/10 rounded-full" />
                   <div className="text-xs font-black">{(route.duration / 60).toFixed(0)} <span className="text-[8px] opacity-60">MIN</span></div>
                </div>
              </div>
            </Tooltip>
          </Polyline>
          <NavigationSimulator
            coords={route.coords} isActive={isActive}
            color={route.color} isNavigating={isNavigating} speedMultiplier={simSpeed}
          />
        </React.Fragment>
      );
    });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed]);

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

        <button
          onClick={() => setShowLayerPicker(!showLayerPicker)}
          className={`w-14 h-14 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white dark:border-slate-800 shadow-xl flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all ${showLayerPicker ? 'rotate-90 bg-primary-600 text-white border-primary-600' : 'hover:scale-110 active:scale-90'}`}
        >
          {showLayerPicker ? <X size={24} /> : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 18-9-5 9-5 9 5-9 5Z" /><path d="m3 10 9 5 9-5" /><path d="m3 6 9 5 9-5" /></svg>
          )}
        </button>
      </div>

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
            <div className="text-[10px] font-black uppercase opacity-60 mb-1">Duration</div>
            <div className="text-2xl font-black leading-none">{(activeRoute.duration / 60).toFixed(0)} <span className="text-[10px]">MIN</span></div>
          </div>
          <button 
            onClick={() => setShowWeatherChain(!showWeatherChain)}
            className={`p-4 rounded-2xl shadow-xl flex flex-col items-start transition-all border ${showWeatherChain ? 'bg-slate-900 border-slate-800 text-white shadow-2xl' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-400 opacity-60 hover:opacity-100'}`}
          >
            <div className="text-[10px] font-black uppercase opacity-60 mb-1">Weather</div>
            <div className="text-xl font-black leading-none flex items-center gap-2">
               Chain <CloudRain size={16} className={showWeatherChain ? 'text-primary-500' : ''} />
            </div>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Intel Alert HUD */}
        {intel && (
          <div className="space-y-6">
            {/* Risk Score Meter */}
            <div className="bg-slate-900 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden group border border-slate-800">
              <div className="absolute right-0 top-0 w-32 h-32 bg-primary-600/10 blur-[60px] rounded-full" />

              <div className="flex justify-between items-center mb-6">
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase text-white shadow-lg ${getStatusColor(intel.severity)}`}>
                  {intel.severity} Status
                </div>
                <div className="text-white/40 text-[10px] font-black uppercase tracking-widest">Active Intelligence</div>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <div className="text-5xl font-black text-white">{intel.riskScore}%</div>
                <div className="text-xs font-black text-red-500 uppercase tracking-widest">Risk Index</div>
              </div>

              <div className="w-full h-2 bg-white/5 rounded-full mb-6 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${intel.riskScore}%` }}
                  className={`h-full ${intel.riskScore > 60 ? 'bg-red-500' : 'bg-primary-500'}`}
                />
              </div>

              <p className="text-lg font-black text-white leading-snug">"{intel.summary}"</p>
            </div>

            {/* Weather Order Chain (35km Intervals) */}
            {showWeatherChain && (
               <div className="space-y-4">
                 <div className="flex items-center justify-between px-2">
                   <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Mission Chain (35KM Steps)</div>
                   <div className="px-2 py-1 bg-red-500 text-white rounded-md text-[8px] font-black">{intel.waypointReports?.length || 0} SECTORS</div>
                 </div>
                 <div className="relative pl-6 space-y-4">
                    {/* Visual Vertical Line Chain */}
                    <div className="absolute left-2.5 top-2 bottom-6 w-0.5 border-l-2 border-dashed border-slate-200 dark:border-slate-800" />
                    
                    {intel.waypointReports?.map((item, i) => {
                      const isFirst = i === 0;
                      const isLast = i === (intel.waypointReports.length - 1);
                      const severityColor = 
                        item.severity === 'CRITICAL' ? 'text-red-500' : 
                        item.severity === 'CAUTION' ? 'text-amber-500' : 'text-blue-500';

                      const WeatherIcon = item.weather.includes('Rain') || item.weather.includes('Storm') ? CloudRain : item.weather.includes('Clear') ? Sun : Wind;

                      return (
                        <div key={i} className="relative group">
                          {/* Node Circle */}
                          <div className={`absolute -left-[24px] top-4 w-4 h-4 rounded-full ring-4 ring-white dark:ring-slate-900 flex items-center justify-center transition-all ${item.severity === 'CRITICAL' ? 'bg-red-500 scale-125 shadow-lg shadow-red-500/30' : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-primary-500'}`} />
                          
                          <div className={`bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl flex items-center gap-4 transition-all shadow-sm ${isFirst || isLast ? 'ring-2 ring-primary-600/10' : ''}`}>
                             <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${item.severity === 'CRITICAL' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-slate-50 dark:bg-slate-950 text-slate-400'}`}>
                                <WeatherIcon size={20} />
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                   <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-400">STAGE {i+1}</span>
                                      <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase truncate">{item.place}</span>
                                   </div>
                                   <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-50 dark:bg-slate-950 ${severityColor}`}>{item.severity}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                   <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{item.weather.split(' • ')[0]}</span>
                                   <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{item.weather.split(' • ')[1]}</span>
                                   <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{item.weather.split(' • ')[2]}</span>
                                </div>
                             </div>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               </div>
            )}

            {/* Geopolitical Flashpoint Briefing */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-red-500 uppercase tracking-widest px-2"><AlertTriangle size={14} /> Critical Warnings</div>
              <div className="bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 rounded-3xl p-6 space-y-4">
                {intel.strategicWarnings?.map((alert, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{alert}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Strategic Command Message */}
            <div className="bg-primary-600 text-white p-6 rounded-[2rem] shadow-xl group overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 -rotate-45 translate-x-8 -translate-y-8" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-white/20 rounded-2xl"><Zap size={24} className="animate-pulse" /></div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-1">Tactical Directive</div>
                  <div className="text-sm font-black leading-tight">{intel.commandDirective}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Path Selection HUD */}
        <div className="space-y-4 pb-12">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-2">Structural Path Alternatives</div>
          <div className="grid grid-cols-3 gap-2">
            {allRoutes.slice(0, 3).map((r, i) => (
              <button
                key={i}
                onClick={() => setActiveRouteIndex(i)}
                className={`p-4 rounded-2xl border-2 transition-all text-left group ${i === activeRouteIndex ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/10' : 'border-slate-100 dark:border-slate-800 opacity-60'}`}
              >
                <div className={`text-[8px] font-black uppercase mb-1 tracking-tighter ${i === activeRouteIndex ? 'text-primary-600' : 'text-slate-500'}`}>Path {i + 1}</div>
                <div className="text-base font-black text-slate-900 dark:text-white">{(r.duration / 60).toFixed(0)}<span className="text-[10px] ml-0.5 whitespace-nowrap">MIN</span></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

RouteMap.SidePanel = SidePanel;
export default RouteMap;
