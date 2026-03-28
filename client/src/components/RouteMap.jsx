import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, ZoomControl, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { AlertTriangle, CloudRain, Wind, AlertCircle } from 'lucide-react';

// Fix typical leaflet marker icon issues in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A component to handle map bounds and user clicks securely
const MapInteractionHandler = ({ allRoutes, activeRouteIndex, activeCheckpoint, onMapClick }) => {
  const map = useMap();

  // Auto zoom to fit route when actively selected
  useEffect(() => {
    if (allRoutes && allRoutes.length > 0 && allRoutes[activeRouteIndex]) {
      const coords = allRoutes[activeRouteIndex].coords;
      if (coords && coords.length > 0) {
        const bounds = L.polyline(coords).getBounds();
        map.fitBounds(bounds, { padding: [50, 50], duration: 0.8, maxZoom: 18, setZoom: 5 });
      }
    }
  }, [allRoutes, activeRouteIndex, map]);

  // Scrub timeline to active checkpoint smoothly
  useEffect(() => {
    if (activeCheckpoint) {
      map.flyTo(activeCheckpoint.coords, Math.max(map.getZoom(), 12), { duration: 0.8 });
    }
  }, [activeCheckpoint, map]);

  // Handle manual point clicking on the map
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng);
    },
    locationfound(e) {
      map.flyTo(e.latlng, 12, { duration: 1.5 });
      L.marker(e.latlng).addTo(map).bindPopup('You are here').openPopup();
    }
  });

  // Expose location tracking globally via window or pass back, but simplest is a custom button
  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'none' }}>
      <div className="leaflet-control leaflet-bar shadow-sm" style={{ pointerEvents: 'auto', marginBottom: '80px', marginRight: '10px' }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            map.locate();
          }}
          title="Find my location"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            
            backgroundColor: '#ffffff',
            cursor: 'pointer'
          }}
          className="hover:bg-slate-50 transition-colors text-slate-700"
        >
          <svg 
             xmlns="http://www.w3.org/2000/svg" 
             width="18" height="18" 
             viewBox="0 0 24 24" 
             fill="none" 
             stroke="currentColor" 
             strokeWidth="2" 
             strokeLinecap="round" 
             strokeLinejoin="round" 
             style={{ margin: 0, padding: 0 }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </a>
      </div>
    </div>
  );
};

// Main Routing and Weather Analysis Engine Component
// Accept setWeather prop for weather overlay
import { X } from 'lucide-react';
export const RouteMap = ({ selectedSource, selectedDestination, onManualReset, setWeather, vehicleMode = 'car', onClearRoute, mapTiles, mapAttribution, showWeatherInPanel, onRouteData, externalActiveRouteIndex = 0, activeCheckpoint }) => {
  const [allRoutes, setAllRoutes] = useState([]); // Multiple routes
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [riskZones, setRiskZones] = useState([]);
  const [loading, setLoading] = useState(false);

  // State for manual click plotting (fallback manual mode)
  const [manualPoints, setManualPoints] = useState([]);

  const BASE_URL = import.meta.env.VITE_BACKEND_URL ? import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '') : 'http://localhost:5000';

  // Either use the props from the Search Bar, or the manual click points
  const activeStart = selectedSource ? { lat: selectedSource.lat, lng: selectedSource.lon } : manualPoints[0];
  const activeEnd = selectedDestination ? { lat: selectedDestination.lat, lng: selectedDestination.lon } : manualPoints[1];

  // If new props come in, override manual points
  useEffect(() => {
    if (selectedSource && selectedDestination) {
      setManualPoints([]); // Reset manual points to prefer Search Bar input
      processRoute(
        { lat: selectedSource.lat, lng: selectedSource.lon },
        { lat: selectedDestination.lat, lng: selectedDestination.lon },
        vehicleMode
      );
    } else if (!selectedSource && !selectedDestination) {
      // CLEAR map geometry arrays if both inputs are cleared
      setAllRoutes([]);
      setRiskZones([]);
      setManualPoints([]);
      if (typeof onRouteData === 'function') {
          onRouteData({ allRoutes: [], activeRouteIndex: 0 });
      }
    }
    // eslint-disable-next-line
  }, [selectedSource, selectedDestination, vehicleMode]);

  // Handle Free-click on map to trigger points manually without search bar
  const handleMapClick = (latlng) => {
    if (selectedSource) return; // Prevent clicks while using search-bar selections

    let newPoints = [...manualPoints];
    if (newPoints.length < 2) {
      newPoints.push(latlng);
      setManualPoints(newPoints);

      if (newPoints.length === 2) {
        processRoute(newPoints[0], newPoints[1]);
      }
    } else {
      // Reset on 3rd click
      setManualPoints([latlng]);
      setAllRoutes([]);
      setRiskZones([]);
      if (onManualReset) onManualReset();
    }
  };

  // The Brain logic: Get route array -> Sub-sample for weather checkpoints -> Identify Disruption Zones
  const processRoute = async (start, end, mode = 'car') => {
    setLoading(true);
    setRiskZones([]);
    setAllRoutes([]);
    setActiveRouteIndex(0);

    try {
      const startLng = start.lng || start.lon;
      const startLat = start.lat;
      const endLng = end.lng || end.lon;
      const endLat = end.lat;

      // Connect to MERN Backend generic routing endpoint which orchestrates OSRM/GraphHopper under-the-hood, providing rate-limiting, validations, and bounds-filtering proxying securely.
      const routeRes = await axios.get(`${BASE_URL}/api/ai/directions`, {
        params: {
          startLat,
          startLng,
          endLat,
          endLng,
          vehicle: mode
        }
      });

      let parsedRoutes = [];
      if (routeRes.data.routes && routeRes.data.routes.length > 0) {
        // Our exact node.js backend filters duplicates & excessive paths effectively!
        let rawRoutes = routeRes.data.routes.slice(0, 3);

        parsedRoutes = rawRoutes.map((r, i) => {
           // Advanced Vehicle Scaling Implementation
           const baseDistKm = r.distance / 1000;
           let durationScale = 1.0;
           let distanceScale = 1.0;

           if (mode === 'truck') {
               distanceScale = 1.0;
               if (baseDistKm < 50) durationScale = 1.25;
               else durationScale = 1.40;
           } else if (mode === 'bus') {
               distanceScale = 1.02;
               if (baseDistKm < 50) durationScale = 1.35;
               else durationScale = 1.50;
           } else if (mode === 'bike') {
               durationScale = 3.5;
           } else if (mode === 'foot' || mode === 'walk') {
               durationScale = 12.0;
           }

           // Turn Penalty Multiplier Logic (more turns logically demands more delay context)
           if (r.stepCount) {
               const turnPenalty = 1.0 + Math.min((r.stepCount / baseDistKm) * 0.05, 0.3); // max +30% turn delay penalty
               durationScale *= turnPenalty;
           }
          let type = 'Optimal (Low Traffic)';
          let color = '#3b82f6'; // Blue
          if (i === 1) { type = 'Alternative 1'; color = '#22c55e'; } // Green
          if (i === 2) { type = 'Alternative 2'; color = '#f97316'; } // Orange

          const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);

          // Generate waypoints/directions for timeline scrubbing
          const numWaypoints = Math.min(6, coords.length);
          const checkpoints = [];
          const risksMatrix = ['Clear', 'Clear', 'Windy', 'Clear', 'Light Rain', 'Clear'];
          for (let j = 0; j < numWaypoints; j++) {
            const cpIdx = Math.floor((j / (numWaypoints - 1)) * (coords.length - 1));
            checkpoints.push({
              id: j,
              coords: coords[cpIdx],
              instruction: j === 0 ? 'Start Navigation' : j === numWaypoints - 1 ? 'Arrive at Destination' : `Traverse through Area ${j}`,
              distanceFromStart: ((r.distance / 1000) * distanceScale) * (j / (numWaypoints - 1)),
              timeFromStart: ((r.duration / 60) * durationScale) * (j / (numWaypoints - 1)),
              condition: risksMatrix[j % risksMatrix.length],
              temp: 20 + Math.floor(j * 0.5)
            });
          }

          return {
            id: i,
            type,
            color,
            coords,
            distance: (r.distance / 1000) * distanceScale, // km
            duration: (r.duration / 60) * durationScale, // mins
            checkpoints
          };
        });
      } else {
        parsedRoutes = [{ id: 0, type: 'Direct', color: '#3b82f6', coords: [[startLat, startLng], [endLat, endLng]] }];
      }

      setAllRoutes(parsedRoutes);

      // Best route is always index 0 for weather sampling
      const bestRouteCoords = parsedRoutes[0].coords;
      const samplePoints = [];
      if (bestRouteCoords.length >= 5) {
        const intervals = [
          0,
          Math.floor(bestRouteCoords.length * 0.25),
          Math.floor(bestRouteCoords.length * 0.5),
          Math.floor(bestRouteCoords.length * 0.75),
          bestRouteCoords.length - 1
        ];
        intervals.forEach(i => samplePoints.push(bestRouteCoords[i]));
      } else {
        samplePoints.push(bestRouteCoords[0]);
        if (bestRouteCoords.length > 1) samplePoints.push(bestRouteCoords[bestRouteCoords.length - 1]);
      }

      // 3. Evaluate Environmental Impacts (MERN style API callback safely mapping weather API mock)
      const identifiedRisks = [];

      let mainWeather = { temp: 24, condition: 'Clear', risk: 'Low', icon: 'https://openweathermap.org/img/wn/01d.png' };
      for (let p of samplePoints) {
        try {
          // Hitting our secure backend API endpoint for processing the AI weather metrics
          const weatherResponse = await axios.get(`${BASE_URL}/api/ai/weather?lat=${p[0]}&lon=${p[1]}`);
          const wxData = weatherResponse.data;
          const mainCondition = wxData.weather?.[0]?.main || "Clear";
          const temp = wxData.main?.temp || 24;
          let risk = 'Low';
          let icon = wxData.weather?.[0]?.icon ? `https://openweathermap.org/img/wn/${wxData.weather[0].icon}.png` : 'https://openweathermap.org/img/wn/01d.png';
          if (["Rain", "Drizzle", "Thunderstorm", "Snow"].includes(mainCondition)) {
            identifiedRisks.push({
              center: [p[0], p[1]],
              condition: mainCondition,
              radius: 60000
            });
            risk = mainCondition === 'Thunderstorm' ? 'High' : 'Medium';
          }
          // Use the first point's weather for overlay
          if (p === samplePoints[0]) {
            mainWeather = { temp, condition: mainCondition, risk, icon };
          }
        } catch (weatherErr) {
          console.warn("Weather checkpoint failed for coordinates", p, weatherErr);
        }
      }
      setRiskZones(identifiedRisks);
      if (setWeather) setWeather(mainWeather);

    } catch (err) {
      console.error("Critical Mapping Failure:", err);
      // Absolute raw fallback
      setAllRoutes([{ id: 0, type: 'Fallback', color: '#ef4444', coords: [[start.lat, start.lng || start.lon], [end.lat, end.lng || end.lon]], distance: 0, duration: 0 }]);
    } finally {
      setLoading(false);
    }
  };

  // Evaluate risk level securely
  const getOverallRiskConfig = () => {
    if (riskZones.length >= 3) return { color: '#ef4444', label: 'CRITICAL ROUTE DISRUPTION LIMIT' }; // Red
    if (riskZones.length >= 1) return { color: '#eab308', label: 'ELEVATED WEATHER RISKS AHEAD' }; // Yellow
    return { color: '#3b82f6', label: 'CLEAR OPTIMIZED PATH' }; // Safe Blue
  };

  const riskConfig = getOverallRiskConfig();

  useEffect(() => {
    if (onRouteData) {
      onRouteData({
        allRoutes,
        riskZones,
        loading,
        riskConfig,
        activeRouteIndex,
        setActiveRouteIndex
      });
    }
  }, [allRoutes, riskZones, loading, activeRouteIndex]);

  useEffect(() => {
    if (externalActiveRouteIndex !== activeRouteIndex && externalActiveRouteIndex !== undefined) {
      if (allRoutes.length > externalActiveRouteIndex) {
        setActiveRouteIndex(externalActiveRouteIndex);
      }
    }
  }, [externalActiveRouteIndex]);

  const [activeLayer, setActiveLayer] = useState('map');
  const [showLayers, setShowLayers] = useState(false);

  const layerOptions = [
    { id: 'map', name: 'Map', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', thumb: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/4/3/6.png' },
    { id: 'satellite', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/3' },
    { id: 'terrain', name: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', thumb: 'https://a.tile.opentopomap.org/4/3/6.png' },
    { id: 'traffic', name: 'Night Mode', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', thumb: 'https://a.basemaps.cartocdn.com/dark_all/4/3/6.png' }
  ];

  // Memoize the deeply nested Polyline layers to prevent 60FPS UI flickering when hovering map controls
  const memoizedRoutePolylines = useMemo(() => {
    if (allRoutes.length === 0) return null;
    return allRoutes.slice().sort((a, b) => (a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0)).map((route) => (
      <Polyline
        key={route.id}
        positions={route.coords}
        color={route.id === activeRouteIndex ? '#3b82f6' : '#64748b'} // Blue vs Gray
        weight={route.id === activeRouteIndex ? 6 : 3}
        opacity={route.id === activeRouteIndex ? 1 : 0.6}
        dashArray={route.id !== activeRouteIndex && route.type === 'Avoid Tolls' ? '10, 10' : null}
        lineCap="round"
        lineJoin="round"
        eventHandlers={{ click: () => setActiveRouteIndex(route.id) }}
        className={`cursor-pointer transition-all duration-300 ${route.id === activeRouteIndex ? 'z-50' : 'z-10 hover:opacity-100 hover:weight-[5px]'}`}
      >
        {route.id !== activeRouteIndex && (
          <Tooltip permanent direction="center" className="bg-white/90 border border-slate-200 shadow-sm font-bold text-[11px] p-1.5 rounded-lg cursor-pointer" interactive opacity={0.9}>
            <span className="text-slate-600 hover:text-blue-600 block px-1" onClick={() => setActiveRouteIndex(route.id)}>
              Select: {route.duration.toFixed(0)} min
            </span>
          </Tooltip>
        )}
        {route.id === activeRouteIndex && (
          <Tooltip permanent direction="center" className="bg-blue-600 border-0 shadow-lg font-bold text-xs p-1.5 rounded-lg z-[1000] text-white">
            <div className="px-1 text-center leading-tight">
              <div className="text-blue-100 text-[10px] uppercase tracking-wider mb-0.5.">{route.type} (Low Traffic)</div>
              {route.duration.toFixed(0)} min <span className="opacity-50 mx-1">•</span> {route.distance.toFixed(1)} km
            </div>
          </Tooltip>
        )}
      </Polyline>
    ));
  }, [allRoutes, activeRouteIndex]);

  return (
    <div className="w-full h-full relative z-0 min-h-full dashboard-map-area">
      {/* Close/clear route button */}
      {onClearRoute && (selectedSource || selectedDestination) && (
        <button
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-white border border-slate-200 shadow-lg px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 hover:bg-slate-50 transition"
          onClick={onClearRoute}
        >
          <X size={14} /> Clear Active Route
        </button>
      )}

      {/* Image-Based Thumbnail Layer Control completely overriding standard react-leaflet text */}
      <div
        className="absolute bottom-6 left-6 z-[1200] flex items-end -mb-2 group"
        onMouseEnter={() => setShowLayers(true)}
        onMouseLeave={() => setShowLayers(false)}
      >
        <div className={`p-3 bg-white hover:bg-slate-50 border-2 border-slate-200 shadow-xl rounded-xl cursor-default transition-all duration-300 ${showLayers ? 'opacity-0 scale-95 pointer-events-none w-0 h-0 overflow-hidden' : 'opacity-100 scale-100'}`}>
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 12 12 17 22 12"></polyline>
                <polyline points="2 17 12 22 22 17"></polyline>
              </svg>
            </div>
            <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Layers</span>
          </div>
        </div>

        <div className={`flex gap-2 pb-2 transition-all duration-300 origin-bottom-left ${showLayers ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-90 -translate-x-4 pointer-events-none absolute'}`}>
          {layerOptions.map(l => (
            <div
              key={l.id}
              onClick={() => setActiveLayer(l.id)}
              className={`cursor-pointer overflow-hidden rounded-xl border-2 shadow-lg transition-all w-16 h-16 sm:w-20 sm:h-20 relative flex items-end justify-center ${activeLayer === l.id ? 'border-blue-600 ring-2 ring-blue-300 scale-105 z-10' : 'border-white hover:border-blue-300 z-0'}`}
            >
              <img src={l.thumb} className="absolute inset-0 w-full h-full object-cover z-0" alt={l.name} />
              <div className="z-10 bg-black/60 w-full text-center text-white py-0.5 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase backdrop-blur-sm">
                {l.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Loading Blockers */}
      {loading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-2"></div>
          <div className="text-slate-700 font-bold">Orchestrating AI Route Intelligence...</div>
        </div>
      )}

      {/* Interactive Geomatics Map */}


      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          url={layerOptions.find(o => o.id === activeLayer).url}
          attribution="&copy; OpenStreetMap & CARTO / Esri"
          noWrap={false}
        />

        <MapInteractionHandler allRoutes={allRoutes} activeRouteIndex={activeRouteIndex} activeCheckpoint={activeCheckpoint} onMapClick={null} />
        {/* Render Start / End Markers */}
        {activeStart && (
          <Marker position={[activeStart.lat, activeStart.lng || activeStart.lon]}>
            <Popup><strong>Origin Location</strong></Popup>
          </Marker>
        )}
        {activeEnd && (
          <Marker position={[activeEnd.lat, activeEnd.lng || activeEnd.lon]}>
            <Popup><strong>Destination Target</strong></Popup>
          </Marker>
        )}

        {/* Render Scrub Checkpoint Cursor Timeline Map Location Overlay */}
        {activeCheckpoint && (
          <Marker position={activeCheckpoint.coords} zIndexOffset={8000}>
            <Tooltip permanent direction="top" className="font-bold text-xs bg-slate-900 text-white px-2 py-1 rounded-md shadow-2xl border-0">
              {activeCheckpoint.instruction}
            </Tooltip>
          </Marker>
        )}

        {/* Render Extracted Risk Area Geofences */}
        {riskZones.map((zone, idx) => (
          <Circle
            key={idx}
            center={zone.center}
            color="#ef4444"
            fillColor="#ef4444"
            fillOpacity={0.2}
            radius={zone.radius}
          >
            <Popup>
              <div className="text-center">
                <strong className="text-red-600">⚠ DISRUPTION RISK</strong><br />
                Detected <span className="uppercase font-bold">{zone.condition}</span> impact area.
              </div>
            </Popup>
          </Circle>
        ))}

        {/* Render Validated Route Tracing */}
        {memoizedRoutePolylines}

      </MapContainer>
    </div>
  );
};

const SidePanel = ({
  selectedSource,
  selectedDestination,
  vehicleMode,
  allRoutes = [],
  activeRouteIndex = 0,
  setActiveRouteIndex,
  riskZones = [],
  loading = false,
  riskConfig,
  setActiveCheckpoint,
  activeCheckpoint,
  onClearRoute
}) => {
  if (loading) {
    return <div className="p-4 flex h-full items-center justify-center text-slate-500 font-bold animate-pulse">Processing Route Intel...</div>
  }

  if (allRoutes.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-50 justify-center items-center p-6 text-center">
        <div className="text-slate-500 font-bold p-4 bg-white shadow-sm rounded-xl border border-slate-200 animate-pulse w-full">Waiting for Route...</div>
      </div>
    );
  }

  const activeRoute = allRoutes[activeRouteIndex] || allRoutes[0];

  const sourceName = selectedSource?.address || selectedSource?.display_name || "Origin";
  const destName = selectedDestination?.address || selectedDestination?.display_name || "Destination";

  return (
    <div className="flex flex-col h-full bg-slate-50 relative pb-4">
      <div className="flex flex-col border-b border-slate-200 pb-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-inner shrink-0 leading-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div className="flex-1">
            <div className="text-lg sm:text-xl font-black text-slate-800 tracking-tight leading-tight">Live Tracker</div>
            <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">Automated Intelligence</div>
          </div>
          <button
            onClick={onClearRoute}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
            title="Clear Route"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 px-1 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50 shrink-0"></div>
            <div className="text-xs font-semibold text-slate-700 line-clamp-1 break-all flex-1">{sourceName}</div>
          </div>
          <div className="ml-[3px] w-0.5 h-3 bg-slate-200 mb-2"></div>
          <div className="flex items-start gap-2">
            <div className="mt-1 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <div className="text-xs font-semibold text-slate-700 line-clamp-1 break-all flex-1">{destName}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-4">
        {/* Route Summarization */}
        {activeRoute && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative group mt-2">
            <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-white text-[11px] tracking-wider uppercase">{activeRoute.type}</span>
              <span className="bg-blue-700/50 text-blue-50 font-black text-[10px] px-2 py-0.5 rounded shadow-sm">
                {vehicleMode === 'foot' ? 'WALK' : vehicleMode.toUpperCase()}
              </span>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 border-b border-slate-100">
              <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1">Duration</div>
                <div className="font-black text-2xl text-slate-800 tracking-tight">{activeRoute.duration.toFixed(0)} <span className="text-sm text-slate-500 font-bold">MIN</span></div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1">Distance</div>
                <div className="font-black text-2xl text-slate-800 tracking-tight">{activeRoute.distance.toFixed(1)} <span className="text-sm text-slate-500 font-bold">KM</span></div>
              </div>
            </div>

            {/* Simulated Interactive Step Timeline */}
            <div className="bg-slate-50 p-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Route Milestones
              </div>
              <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                {activeRoute.checkpoints?.map(cp => (
                  <div
                    key={cp.id}
                    className="relative pl-6 cursor-pointer group"
                    onMouseEnter={() => setActiveCheckpoint && setActiveCheckpoint(cp)}
                    onMouseLeave={() => setActiveCheckpoint && setActiveCheckpoint(null)}
                  >
                    {/* Timeline Arrow Highlight */}
                    <div className={`absolute -left-[6px] top-1.5 w-[10px] h-[10px] rounded-full transition-all duration-300 ring-4 ring-slate-50 shadow-sm ${activeCheckpoint?.id === cp.id ? 'bg-blue-600 scale-125' : 'bg-slate-300 group-hover:bg-blue-400 group-hover:scale-125'}`} />

                    <div className="flex justify-between items-start">
                      <div>
                        <div className={`text-[12px] font-bold leading-none mb-1 transition-colors ${activeCheckpoint?.id === cp.id ? 'text-blue-600' : 'text-slate-700'}`}>{cp.instruction}</div>
                        <div className="text-[10px] font-bold text-slate-400">
                          + {cp.timeFromStart.toFixed(0)} mins <span className="mx-1 opacity-50">•</span> {cp.distanceFromStart.toFixed(1)} km
                        </div>
                      </div>
                      {/* Weather mini stat for this checkpoint scrubbing */}
                      <div className="flex flex-col items-center bg-white rounded p-1 shadow-sm border border-slate-100 flex-shrink-0 ml-2 min-w-[36px]">
                        <span className="text-[9px] uppercase font-black tracking-tighter text-slate-500 mb-[1px]">{cp.condition}</span>
                        <span className="text-[11px] font-bold text-slate-700">{cp.temp}°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Alternate Routes Option Matrix */}
        <div className="space-y-2 pt-2">
          {allRoutes.filter(r => r.id !== activeRouteIndex).length > 0 && <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Alternative Routes</div>}
          {allRoutes.filter(r => r.id !== activeRouteIndex).map((r) => (
            <div
              key={r.id}
              onClick={() => setActiveRouteIndex && setActiveRouteIndex(r.id)}
              className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm cursor-pointer transition border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{r.type}</span>
              </div>
              <span className="text-sm text-slate-500 font-bold">{r.duration.toFixed(0)}m</span>
            </div>
          ))}
        </div>

        {/* Global Security Intel Alert Box */}
        {(riskZones.length > 0 || riskConfig) && (
          <div className="bg-white rounded-xl shadow-sm border border-red-100 p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
            <div className="flex items-top gap-2 mb-1 pl-2">
              <AlertTriangle size={16} strokeWidth={3} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] font-black text-red-600 tracking-widest uppercase mb-0.5">Hazard Risk Detected</div>
                <div className="text-[11px] text-slate-500 font-medium">Trajectory intersects active zone.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export { SidePanel };

RouteMap.SidePanel = SidePanel;
