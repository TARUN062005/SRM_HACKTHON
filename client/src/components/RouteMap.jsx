import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, ZoomControl, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { AlertTriangle, Navigation, ChevronRight, Play, X, Clock, Info, Activity, Wind, Zap, MapPin, ShieldAlert, Globe, ArrowRight, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- VISUAL THEME ---
const THEME = {
  colors: ['#2563eb', '#64748b', '#94a3b8'],
  weights: [8, 5, 5],
  opacities: [1, 0.7, 0.5]
};

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
       indexRef.current = (indexRef.current + Math.max(1, Math.floor(speedMultiplier / 2)));
       if (indexRef.current >= coords.length) {
          indexRef.current = 0;
       }
       
       const cur = coords[indexRef.current];
       if (cur) {
         setPosition(cur);
         map.panTo(cur, { animate: true, duration: 0.1 });
       }
       rafRef.current = setTimeout(() => requestAnimationFrame(animate), 100);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => clearTimeout(rafRef.current);
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
  const [mapType, setMapType] = useState('voyager'); // 'voyager' | 'satellite' | 'dark'

  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  const mapStyles = {
    voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  };

  const fetchRoutes = async (start, end, mode) => {
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
        if (onRouteData) onRouteData({ allRoutes: processed, activeRouteIndex: 0 });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedSource && selectedDestination) {
      fetchRoutes(selectedSource, selectedDestination, vehicleMode);
    } else {
      setAllRoutes([]);
      setIsNavigating(false);
      if (onRouteData) onRouteData({ allRoutes: [], activeRouteIndex: 0 });
    }
  }, [selectedSource, selectedDestination, vehicleMode]);

  const mapLayers = useMemo(() => {
    const sorted = [...allRoutes].sort((a,b) => a.id === activeRouteIndex ? 1 : -1);
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
            eventHandlers={{ click: () => setActiveRouteIndex(route.id) }}
          />
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
            className="absolute top-6 left-1/2 -translate-x-1/2 z-[1100] w-full max-w-sm flex items-center justify-center pointer-events-none"
          >
             <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl px-6 py-4 border border-white dark:border-slate-800 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] flex items-center gap-6 pointer-events-auto">
                <button 
                  onClick={() => setIsNavigating(!isNavigating)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isNavigating ? 'bg-red-500 text-white shadow-xl shadow-red-500/30' : 'bg-primary-600 text-white shadow-xl shadow-primary-600/30 hover:scale-110 active:scale-90'}`}
                >
                  {isNavigating ? <X size={24} /> : <Play size={28} className="translate-x-0.5" />}
                </button>

                <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                   <div className="flex justify-between items-center text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      <span>Sim Velocity</span>
                      <span className="text-primary-600">x{simSpeed}</span>
                   </div>
                   <input 
                      type="range" min="1" max="10" step="1" 
                      value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} 
                      className="w-full accentuate-primary-600 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" 
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

      {/* Layer Control Switcher (Bottom Left) */}
      <div className="absolute bottom-10 left-6 z-[1050] flex flex-col gap-3">
         {[
           { id: 'voyager', label: 'Roads', icon: <Navigation size={14} />, img: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=200' },
           { id: 'satellite', label: 'Tactical', icon: <Globe size={14} />, img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=200' },
           { id: 'dark', label: 'Dark Ops', icon: <Zap size={14} />, img: 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&q=80&w=200' }
         ].map((t) => (
           <button
             key={t.id}
             onClick={() => setMapType(t.id)}
             className={`group relative w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all shadow-xl active:scale-90 ${mapType === t.id ? 'border-primary-600 ring-4 ring-primary-600/10' : 'border-white dark:border-slate-800'}`}
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
  if (allRoutes.length === 0) return null;
  const activeRoute = allRoutes[activeRouteIndex] || allRoutes[0];
  const intel = activeRoute?.intelligence;

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-black text-xl tracking-tighter uppercase">Tactical Dashboard</h2>
          <button onClick={onClearRoute} className="p-2 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition"><X size={18} /></button>
        </div>
        
        {/* Origin & Destination Display */}
        <div className="mt-4 px-3 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
           <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0 mt-1"><MapPin size={12} /></div>
              <div className="flex-1">
                 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Origin Point</div>
                 <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed">{selectedSource?.display_name || "Custom Latitude/Longitude Entry"}</div>
              </div>
           </div>
           
           <div className="flex items-center gap-4 pl-3">
              <div className="w-0.5 h-4 bg-slate-100" />
              <ArrowRight size={14} className="text-slate-200" />
           </div>

           <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-red-50 text-red-600 rounded-full flex items-center justify-center shrink-0 mt-1"><Activity size={12} /></div>
              <div className="flex-1">
                 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Destination Target</div>
                 <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed">{selectedDestination?.display_name || "Target Marker Assigned"}</div>
              </div>
           </div>
        </div>

        {/* Distance & Time Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
           <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg">
              <div className="text-[10px] font-bold uppercase opacity-60 mb-1">Duration</div>
              <div className="text-2xl font-black leading-none">{(activeRoute.duration / 60).toFixed(0)} <span className="text-[10px]">MIN</span></div>
           </div>
           <div className="bg-slate-800 text-white p-4 rounded-2xl shadow-lg">
              <div className="text-[10px] font-bold uppercase opacity-60 mb-1">Distance</div>
              <div className="text-2xl font-black leading-none">{(activeRoute.distance / 1000).toFixed(1)} <span className="text-[10px]">KM</span></div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* AI Intelligence Block */}
        {intel && (
          <div className="space-y-4">
             <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden group border border-slate-800">
                <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-all duration-700"><Globe size={120} /></div>
                
                <div className="flex items-center gap-3 mb-5">
                   <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${intel.riskLevel === 'High' ? 'bg-red-500 shadow-red-500/20 shadow-lg' : intel.riskLevel === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500 text-white'}`}>
                      {intel.riskLevel} Security Status
                   </div>
                   <div className="text-white/40 text-[10px] font-black uppercase tracking-widest">Live AI Intelligence Feed</div>
                </div>
                
                <p className="text-xl font-bold tracking-tight leading-snug mb-8">"{intel.summary}"</p>
                
                <div className="space-y-5">
                   <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-black text-blue-400 uppercase tracking-widest opacity-80"><Wind size={14} /> Global Atmospheric Risks</div>
                      {intel.weatherAlerts?.map((a, i) => (
                         <div key={i} className="flex gap-3 items-start text-xs text-white/70 font-medium bg-white/5 p-3 rounded-2xl border border-white/10 group-hover:bg-white/10 transition-colors">
                            <CloudRain size={14} className="text-blue-500 shrink-0" /> {a}
                         </div>
                      ))}
                   </div>
                   
                   <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-black text-red-400 uppercase tracking-widest opacity-80"><ShieldAlert size={14} /> Geopolitical Disruptions</div>
                      {intel.geopoliticalAlerts?.map((a, i) => (
                         <div key={i} className="flex gap-3 items-start text-xs text-white/70 font-medium bg-white/5 p-3 rounded-2xl border border-white/10 group-hover:bg-white/10 transition-colors">
                            <Zap size={14} className="text-red-500 shrink-0" /> {a}
                         </div>
                      ))}
                   </div>
                </div>
             </div>
             
             <div className="bg-blue-600 text-white p-4 rounded-2xl flex items-center gap-3 shadow-xl">
                <Zap size={24} className="text-white animate-pulse" />
                <div>
                   <div className="text-[10px] font-black uppercase opacity-60 leading-none mb-1">Strategic Command</div>
                   <div className="text-xs font-black uppercase tracking-tighter">{intel.speedRecommendation}</div>
                </div>
             </div>
          </div>
        )}

        {/* Structural Alternatives */}
        <div className="space-y-3">
           <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Structural Path Alternatives</div>
           <div className="flex gap-3">
              {allRoutes.slice(0, 3).map((r, i) => (
                 <button
                   key={i}
                   onClick={() => setActiveRouteIndex(i)}
                   className={`flex-1 p-4 rounded-3xl border-2 transition-all ${i === activeRouteIndex ? 'border-blue-600 bg-blue-50 shadow-lg -translate-y-1' : 'border-slate-100 hover:border-slate-200 opacity-60 hover:opacity-100'}`}
                 >
                    <div className={`text-[10px] font-black uppercase mb-1 tracking-tighter ${i === activeRouteIndex ? 'text-blue-600' : 'text-slate-400'}`}>Path {i+1}</div>
                    <div className="text-lg font-black text-slate-800 leading-none">{(r.duration / 60).toFixed(0)}m</div>
                 </button>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

// Internal icon for UI consistency
const CloudRain = ({ size, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M8 19v2" /><path d="M12 17v2" /><path d="M16 19v2" />
  </svg>
);

RouteMap.SidePanel = SidePanel;
export default RouteMap;
