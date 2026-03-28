import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, ZoomControl, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { AlertTriangle, CloudRain, Wind, AlertCircle, Navigation, ChevronRight, Play, X, Clock, Info } from 'lucide-react';

// --- VISUAL THEME ---
const THEME = {
  colors: ['#1976D2', '#616161', '#94a3b8'],
  weights: [8, 5, 5],
  opacities: [1, 0.7, 0.5]
};

// Fix typical leaflet marker icon issues in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * RouteAnimator: Moves a directional arrow along the active path
 */
const RouteAnimator = ({ coords, isActive, color }) => {
  const [position, setPosition] = useState(coords && coords.length > 0 ? coords[0] : null);
  const [rotation, setRotation] = useState(0);
  const indexRef = useRef(0);
  const frameRef = useRef();

  useEffect(() => {
    if (!isActive || !coords || coords.length < 2) return;

    const animate = () => {
      indexRef.current = (indexRef.current + 2) % coords.length;
      const cur = coords[indexRef.current];
      const next = coords[(indexRef.current + 2) % coords.length];
      
      if (cur && next) {
        const deltaLon = next[1] - cur[1];
        const deltaLat = next[0] - cur[0];
        const angle = Math.atan2(deltaLon, deltaLat) * (180 / Math.PI);
        setRotation(angle);
        setPosition(cur);
      }
      frameRef.current = setTimeout(() => requestAnimationFrame(animate), 50);
    };

    animate();
    return () => clearTimeout(frameRef.current);
  }, [isActive, coords]);

  if (!isActive || !position) return null;

  const arrowIcon = L.divIcon({
    html: `<div style="transform: rotate(${rotation}deg); color: ${color};"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z"/></svg></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  return <Marker position={position} icon={arrowIcon} zIndexOffset={5000} />;
};

/**
 * MapInteractionHandler: Auto-bounds and manual location tracking
 */
const MapInteractionHandler = ({ allRoutes, activeRouteIndex, onMapClick }) => {
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

  useMapEvents({ click: (e) => onMapClick && onMapClick(e.latlng) });

  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'none', marginBottom: '80px', marginRight: '10px' }}>
      <div className="leaflet-control leaflet-bar shadow-xl" style={{ pointerEvents: 'auto' }}>
        <button 
          onClick={() => map.locate()}
          className="bg-white p-2 hover:bg-slate-50 transition-colors rounded-md flex items-center justify-center w-10 h-10 border-0"
        >
          <Navigation size={18} className="text-slate-700" />
        </button>
      </div>
    </div>
  );
};

// --- MAIN ROUTE ENGINE ---

export const RouteMap = ({ 
  selectedSource, selectedDestination, onManualReset, setWeather, 
  vehicleMode = 'car', onClearRoute, onRouteData, 
  externalActiveRouteIndex = 0, activeCheckpoint 
}) => {
  const [allRoutes, setAllRoutes] = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  const fetchRoutes = async (start, end, mode) => {
    setLoading(true);
    try {
      const sLat = parseFloat(start.lat);
      const sLng = parseFloat(start.lng || start.lon);
      const eLat = parseFloat(end.lat);
      const eLng = parseFloat(end.lng || end.lon);

      const res = await axios.get(`${BASE_URL}/api/ai/directions`, {
        params: { startLat: sLat, startLng: sLng, endLat: eLat, endLng: eLng, vehicle: mode }
      });

      if (res.data.success && res.data.routes?.length > 0) {
        const processed = res.data.routes.map((r, i) => ({
          id: i,
          type: r.type,
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          distance: r.distance,
          duration: r.duration,
          summary: r.summary,
          steps: r.steps || [],
          color: THEME.colors[i % THEME.colors.length],
          weight: THEME.weights[i % THEME.weights.length],
          opacity: THEME.opacities[i % THEME.opacities.length]
        }));
        setAllRoutes(processed);
        setActiveRouteIndex(0);
        if (onRouteData) onRouteData({ allRoutes: processed, activeRouteIndex: 0 });
      }
    } catch (err) {
      console.error("Routing Error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSource && selectedDestination) {
      fetchRoutes(selectedSource, selectedDestination, vehicleMode);
    } else {
      setAllRoutes([]);
    }
  }, [selectedSource, selectedDestination, vehicleMode]);

  const routeLayers = useMemo(() => {
    // Render active route last to be on top
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
            eventHandlers={{ click: () => {
              setActiveRouteIndex(route.id);
              if (onRouteData) onRouteData({ allRoutes, activeRouteIndex: route.id });
            }}}
          >
            <Tooltip sticky>
              <div className="font-bold text-xs uppercase p-1">
                {route.type} • {(route.duration / 60).toFixed(0)}m
              </div>
            </Tooltip>
          </Polyline>
          <RouteAnimator coords={route.coords} isActive={isActive} color={route.color} />
        </React.Fragment>
      );
    });
  }, [allRoutes, activeRouteIndex]);

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      {loading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-[2000] flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
          <div className="font-black text-slate-800 uppercase tracking-widest text-xs">AI Route Orchestration...</div>
        </div>
      )}

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <MapInteractionHandler allRoutes={allRoutes} activeRouteIndex={activeRouteIndex} onMapClick={null} />
        <ZoomControl position="bottomright" />
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Voyager">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
        </LayersControl>

        {selectedSource && <Marker position={[parseFloat(selectedSource.lat), parseFloat(selectedSource.lng || selectedSource.lon)]}><Popup>Origin</Popup></Marker>}
        {selectedDestination && <Marker position={[parseFloat(selectedDestination.lat), parseFloat(selectedDestination.lng || selectedDestination.lon)]}><Popup>Destination</Popup></Marker>}
        
        {routeLayers}
      </MapContainer>
    </div>
  );
};

/**
 * SidePanel: Integrated Intelligence Feedback
 */
const SidePanel = ({ 
  selectedSource, selectedDestination, allRoutes = [], 
  activeRouteIndex = 0, setActiveRouteIndex, onClearRoute 
}) => {
  if (!selectedSource || allRoutes.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
        <Navigation size={32} />
      </div>
      <p className="font-bold text-sm uppercase tracking-widest">Waiting for Input...</p>
    </div>
  );

  const activeRoute = allRoutes[activeRouteIndex] || allRoutes[0];

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-black text-xl tracking-tighter uppercase leading-none">Route Intel</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Automated Telemetry</p>
          </div>
          <button onClick={onClearRoute} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {allRoutes.map((r, i) => (
            <button
              key={i}
              onClick={() => setActiveRouteIndex(i)}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${i === activeRouteIndex ? 'border-primary-600 bg-primary-50' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[10px] font-black uppercase tracking-widest ${i === activeRouteIndex ? 'text-primary-600' : 'text-slate-400'}`}>Path {i + 1}</span>
                {i === 0 && <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Best</span>}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{(r.duration / 60).toFixed(0)}</span>
                <span className="text-xs font-bold text-slate-500 uppercase">min</span>
                <span className="text-xs font-bold text-slate-400 ml-auto">{(r.distance / 1000).toFixed(1)} km</span>
              </div>
              <div className="text-[10px] font-bold text-slate-500 mt-1 truncate uppercase">Via {r.summary}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-2 text-slate-400 font-black uppercase text-[10px] tracking-widest mb-6">
          <Clock size={12} /> Navigation Steps
        </div>
        <div className="space-y-6 relative pl-4 border-l-2 border-slate-100 ml-2">
          {activeRoute.steps?.map((s, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-white border-2 border-slate-300 shadow-sm" />
              <div className="text-xs font-bold text-slate-700 leading-tight mb-0.5">{s.instruction}</div>
              <div className="text-[10px] font-bold text-slate-400">{(s.distance).toFixed(0)}m</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

RouteMap.SidePanel = SidePanel;
export default RouteMap;
