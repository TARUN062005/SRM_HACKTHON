import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap, useMapEvents, LayersControl, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

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
       <div className="leaflet-control leaflet-bar" style={{ pointerEvents: 'auto', marginBottom: '90px', marginRight: '10px' }}>
         <a 
            href="#"
            onClick={(e) => {
               e.preventDefault();
               e.stopPropagation();
               map.locate();
            }}
            title="Find my location"
            style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', color: '#666' }}
         >
           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
         </a>
       </div>
    </div>
  );
};

// Main Routing and Weather Analysis Engine Component
// Accept setWeather prop for weather overlay
import { X } from 'lucide-react';
export const RouteMap = ({ selectedSource, selectedDestination, onManualReset, setWeather, vehicleMode = 'car', onClearRoute }) => {
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

      // Ask OSRM for up to 3 alternative routes
      // Use OSRM for car/bike/foot, fallback to driving for others
      let profile = mode;
      if (!['car', 'bike', 'foot'].includes(mode)) profile = 'car';
      const osrmUrl = `https://router.project-osrm.org/route/v1/${profile === 'car' ? 'driving' : profile}/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&alternatives=3`;
      const routeRes = await axios.get(osrmUrl);
      
      let parsedRoutes = [];
      if (routeRes.data.routes && routeRes.data.routes.length > 0) {
        parsedRoutes = routeRes.data.routes.slice(0, 3).map((r, i) => {
           let type = 'Best (Lowest Risk)';
           let color = '#3b82f6'; // Blue
           if (i === 1) { type = 'Fastest'; color = '#22c55e'; } // Green
           if (i === 2) { type = 'Alternative'; color = '#f97316'; } // Orange

           return {
             id: i,
             type,
             color,
             coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
             distance: r.distance / 1000, // km
             duration: r.duration / 60, // mins
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

  return (
    <div className="w-full h-full relative z-0 min-h-full dashboard-map-area">
      {/* Close/clear route button */}
      {onClearRoute && (selectedSource || selectedDestination) && (
        <button
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-white border border-slate-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-slate-500 hover:text-red-600 hover:border-red-400 transition"
          onClick={onClearRoute}
        >
          <X size={18} /> Close Route
        </button>
      )}
      
      {/* Right side floating Weather / Route details overlay */}
      {allRoutes.length > 0 && !loading && (
        <div className="absolute top-4 right-16 z-[500] bg-white/90 backdrop-blur-md border border-slate-200 p-4 shadow-xl rounded-xl w-80">
          <h3 className="font-bold text-slate-800 text-sm mb-3 border-b flex items-center justify-between pb-2 border-slate-200">
            <span>AI Route Intelligence</span>
            <span className="text-xs text-slate-500">{allRoutes[activeRouteIndex]?.distance?.toFixed(1)} km</span>
          </h3>
          <div className={`p-2 rounded font-bold text-[11px] mb-3 uppercase flex flex-col items-center justify-center`}
            style={{ backgroundColor: `${riskConfig.color}15`, color: riskConfig.color }}>
            <span className="mb-1">{riskConfig.label}</span>
            <span className="text-slate-500 font-semibold tracking-wide">
              Est. Time: {allRoutes[activeRouteIndex]?.duration?.toFixed(0)} minutes
            </span>
            <span className="text-xs text-slate-400 mt-1">Vehicle: {vehicleMode.charAt(0).toUpperCase() + vehicleMode.slice(1)}</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Routes</div>
            {allRoutes.map((r, i) => (
              <div
                key={i}
                onClick={() => setActiveRouteIndex(r.id)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer transition ${r.id === activeRouteIndex ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="text-xs font-bold text-slate-700">{r.type}</span>
                </div>
                <span className="text-xs text-slate-500 font-semibold">{r.duration.toFixed(0)}m</span>
              </div>
            ))}
          </div>
          {riskZones.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
              <div className="text-xs font-bold text-red-600 mb-1">WEATHER HAZARDS DETECTED</div>
              <div className="text-xs text-red-500 font-medium">
                {riskZones.length} checkpoint(s) reported <span className="uppercase font-bold">{riskZones[0].condition}</span>.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading Blockers */}
      {loading && (
        <div className="absolute inset-0 z-[1000] bg-slate-900/60 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-4 rounded-xl shadow-2xl flex items-center space-x-3">
             <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
             <span className="font-bold text-slate-800">Processing Route Intel...</span>
          </div>
        </div>
      )}
      
      {/* Interactive Geomatics Map */}
      <MapContainer 
        center={[39.8283, -98.5795]} 
        zoom={4} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        zoomSnap={0.25}
        zoomDelta={0.25}
        wheelPxPerZoomLevel={120}
        minZoom={3}
        maxZoom={18}
        preferCanvas={true}
        inertia={true}
        inertiaDeceleration={3000}
        inertiaMaxSpeed={1500}
      >
        <ZoomControl position="bottomright" />
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Google Streets">
            <TileLayer
              url="http://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}"
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
              attribution="&copy; Google Maps"
              maxZoom={20}
            />
          </LayersControl.BaseLayer>
          
          <LayersControl.BaseLayer name="Google Satellite (Hybrid)">
            <TileLayer
              url="http://{s}.google.com/vt?lyrs=s,h&x={x}&y={y}&z={z}"
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
              attribution="&copy; Google Maps"
              maxZoom={20}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Google Terrain">
            <TileLayer
              url="http://{s}.google.com/vt?lyrs=p&x={x}&y={y}&z={z}"
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
              attribution="&copy; Google Maps"
              maxZoom={20}
            />
          </LayersControl.BaseLayer>
          
          <LayersControl.Overlay name="Live Traffic Layer">
            <TileLayer
              url="https://{s}.google.com/vt?lyrs=m@221097413,traffic,transit&x={x}&y={y}&z={z}"
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
              attribution="&copy; Google Maps Traffic"
              maxZoom={20}
              opacity={0.7}
            />
          </LayersControl.Overlay>
        </LayersControl>

        <MapInteractionHandler 
          allRoutes={allRoutes} 
          onMapClick={handleMapClick} 
        />
        
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
        {allRoutes.length > 0 && allRoutes.slice().reverse().map((route, idx) => (
          <Polyline 
            key={route.id}
            positions={route.coords} 
            color={route.color} 
            weight={route.id === activeRouteIndex ? 7 : 4} 
            opacity={route.id === activeRouteIndex ? 1 : 0.6}
            lineCap="round"
            lineJoin="round"
          >
            <Popup>
               <div className="text-center font-bold font-sans p-1">
                 <div style={{ color: route.color }}>{route.type} Route</div>
                 <div className="text-xs text-slate-500 mt-1">{route.duration.toFixed(0)} min • {route.distance.toFixed(1)} km</div>
               </div>
            </Popup>
          </Polyline>
        ))}

      </MapContainer>
    </div>
  );
};
