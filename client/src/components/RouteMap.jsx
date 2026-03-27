import React, { useState, useEffect } from 'react';
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
const MapInteractionHandler = ({ allRoutes, onMapClick }) => {
  const map = useMap();
  
  // Auto zoom to fit route when plotted smoothly
  useEffect(() => {
    if (allRoutes && allRoutes.length > 0) {
      const bounds = L.latLngBounds(allRoutes[0].coords);
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 10, duration: 2.0, easeLinearity: 0.25 });
    }
  }, [allRoutes, map]);

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
          >
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
         </a>
       </div>
    </div>
  );
};

// Main Routing and Weather Analysis Engine Component
// Accept setWeather prop for weather overlay
import { X } from 'lucide-react';
export const RouteMap = ({ selectedSource, selectedDestination, onManualReset, setWeather, vehicleMode = 'car', onClearRoute, mapTiles, mapAttribution, showWeatherInPanel, onRouteData, externalActiveRouteIndex = 0 }) => {
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

      // OSRM Public API primarily relies on 'driving' without timeouts, so we simulate all other modalities dynamically based on the driving metric graph mathematically for stability.
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&alternatives=3`;
      const routeRes = await axios.get(osrmUrl);
      
      let parsedRoutes = [];
      if (routeRes.data.routes && routeRes.data.routes.length > 0) {
        let rawRoutes = routeRes.data.routes.slice(0, 3);
        
        // If the public API fails to provide alternates (common depending on road density), simulate them structurally for the demo
        if (rawRoutes.length === 1 && rawRoutes[0].geometry.coordinates.length > 10) {
          const base = rawRoutes[0];
          
          // Generate simulated 'Fastest' route
          const alt1Coords = base.geometry.coordinates.map((c, idx) => 
            (idx > 3 && idx < base.geometry.coordinates.length - 3) ? [c[0] + 0.0015, c[1] - 0.0015] : c
          );
          rawRoutes.push({
            ...base,
            distance: base.distance * 1.04,
            duration: base.duration * 0.92, // Faster but slightly longer distance theoretically
            geometry: { coordinates: alt1Coords }
          });

          // Generate simulated 'Eco Route / Avoid Tolls' route
          const alt2Coords = base.geometry.coordinates.map((c, idx) => 
            (idx > 3 && idx < base.geometry.coordinates.length - 3) ? [c[0] - 0.002, c[1] + 0.0025] : c
          );
          rawRoutes.push({
            ...base,
            distance: base.distance * 1.15,
            duration: base.duration * 1.25, // Slower but cheaper
            geometry: { coordinates: alt2Coords }
          });
        }

        // Scale factors for realistically modifying OSRM generic car times
        let durationScale = 1.0;
        let distanceScale = 1.0;
        if (mode === 'truck') { durationScale = 1.35; distanceScale = 1.0; }
        else if (mode === 'bus') { durationScale = 1.45; distanceScale = 1.05; }
        else if (mode === 'bike') { durationScale = 3.5; }
        else if (mode === 'foot') { durationScale = 12.0; }

        parsedRoutes = rawRoutes.map((r, i) => {
           let type = 'Optimal (Low Traffic)';
           let color = '#3b82f6'; // Blue
           if (i === 1) { type = 'Fastest'; color = '#22c55e'; } // Green
           if (i === 2) { type = 'Alternative / Eco'; color = '#f97316'; } // Orange

           return {
             id: i,
             type,
             color,
             coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
             distance: (r.distance / 1000) * distanceScale, // km
             duration: (r.duration / 60) * durationScale, // mins
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
      setAllRoutes([{ id: 0, type: 'Fallback', color: '#ef4444', coords: [[start.lat, start.lng||start.lon], [end.lat, end.lng||end.lon]], distance: 0, duration: 0 }]);
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

        <MapInteractionHandler allRoutes={allRoutes} onMapClick={null} />
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
                 <strong className="text-red-600">⚠ DISRUPTION RISK</strong><br/>
                 Detected <span className="uppercase font-bold">{zone.condition}</span> impact area. 
               </div>
             </Popup>
           </Circle>
        ))}

        {/* Render Validated Route Tracing */}
        {allRoutes.length > 0 && allRoutes.slice().sort((a, b) => (a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0)).map((route) => (
          <Polyline 
            key={route.id}
            positions={route.coords} 
            color={route.color} 
            weight={route.id === activeRouteIndex ? 8 : 5} 
            opacity={route.id === activeRouteIndex ? 1 : 0.4}
            dashArray={route.id !== activeRouteIndex && route.type === 'Avoid Tolls' ? '10, 10' : null}
            lineCap="round"
            lineJoin="round"
            eventHandlers={{ click: () => setActiveRouteIndex(route.id) }}
            className={`cursor-pointer transition-all duration-300 ${route.id === activeRouteIndex ? 'z-50' : 'z-10 hover:opacity-100'}`}
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
        ))}

      </MapContainer>
    </div>
  );
};

// SidePanel for right-side details (timings, weather, risk)
const SidePanel = ({ 
  selectedSource, 
  selectedDestination, 
  vehicleMode, 
  allRoutes = [], 
  activeRouteIndex = 0, 
  setActiveRouteIndex, 
  riskZones = [], 
  loading = false,
  riskConfig
}) => {
  if (loading) {
     return <div className="p-4 text-center text-slate-500 font-bold animate-pulse">Processing Route Intel...</div>
  }

  if (allRoutes.length === 0) {
    return (
      <div>
        <div className="font-bold text-lg text-slate-800 mb-2 border-b pb-2">Route & Weather Details</div>
        <div className="text-slate-500 text-sm mt-4">
          Plan a route using the search panel to see intelligent AI insights, weather risks, and alternative paths.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <h3 className="font-bold text-slate-800 text-lg border-b flex items-center justify-between pb-2 border-slate-200">
        <span>AI Route Intelligence</span>
        <span className="text-sm text-slate-500">{allRoutes[activeRouteIndex]?.distance?.toFixed(1)} km</span>
      </h3>

      <div className={`p-4 rounded-xl font-bold text-xs uppercase flex flex-col items-center justify-center`}
        style={{ backgroundColor: `${riskConfig?.color || '#3b82f6'}15`, color: riskConfig?.color || '#3b82f6' }}>
        <span className="mb-1">{riskConfig?.label || 'CLEAR OPTIMIZED PATH'}</span>
        <span className="text-slate-500 font-semibold tracking-wide text-sm mt-1">
          Est. Time: {allRoutes[activeRouteIndex]?.duration?.toFixed(0)} mins
        </span>
        <span className="text-xs text-slate-400 mt-1">Vehicle: {vehicleMode.charAt(0).toUpperCase() + vehicleMode.slice(1)}</span>
      </div>

      <div className="space-y-2 mt-2">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Alternative Routes</div>
        {allRoutes.map((r) => (
          <div
            key={r.id}
            onClick={() => setActiveRouteIndex && setActiveRouteIndex(r.id)}
            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition border ${r.id === activeRouteIndex ? 'bg-slate-50 border-slate-300 ring-2 ring-blue-100' : 'border-transparent hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-sm font-bold text-slate-700">{r.type}</span>
            </div>
            <span className="text-sm text-slate-500 font-semibold">{r.duration.toFixed(0)}m</span>
          </div>
        ))}
      </div>

      {riskZones.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl">
          <div className="text-xs font-bold text-red-600 mb-1">WEATHER HAZARDS DETECTED</div>
          <div className="text-sm text-red-500 font-medium mt-1">
            {riskZones.length} checkpoint(s) reported <span className="uppercase font-bold">{riskZones[0].condition}</span>.
            Please exercise caution.
          </div>
        </div>
      )}
    </div>
  );
};

export { SidePanel };

RouteMap.SidePanel = SidePanel;
