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
const MapInteractionHandler = ({ routeCoordinates, onMapClick }) => {
  const map = useMap();
  
  // Auto zoom to fit route when plotted smoothly
  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 0) {
      const bounds = L.latLngBounds(routeCoordinates);
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 10, duration: 2.0, easeLinearity: 0.25 });
    }
  }, [routeCoordinates, map]);

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
export const RouteMap = ({ selectedSource, selectedDestination, onManualReset }) => {
  const [routeCoordinates, setRouteCoordinates] = useState([]);
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
             { lat: selectedDestination.lat, lng: selectedDestination.lon }
         );
     }
  }, [selectedSource, selectedDestination]);

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
         setRouteCoordinates([]);
         setRiskZones([]);
         if (onManualReset) onManualReset();
     }
  };

  // The Brain logic: Get route array -> Sub-sample for weather checkpoints -> Identify Disruption Zones
  const processRoute = async (start, end) => {
    setLoading(true);
    setRiskZones([]);
    setRouteCoordinates([]);

    try {
      // 1. Fetch Driving Route Geometry securely from OSRM
      const startLng = start.lng || start.lon; // handling mixed lat/lng schemas safely
      const startLat = start.lat;
      const endLng = end.lng || end.lon;
      const endLat = end.lat;

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson`;
      const routeRes = await axios.get(osrmUrl);
      
      let latLngs = [];
      if (routeRes.data.routes && routeRes.data.routes.length > 0) {
        const coords = routeRes.data.routes[0].geometry.coordinates;
        // OSRM provides [lng, lat], leaflet needs [lat, lng]
        latLngs = coords.map(c => [c[1], c[0]]);
      } else {
        // Fallback straight line
        latLngs = [[startLat, startLng], [endLat, endLng]];
      }
      
      setRouteCoordinates(latLngs);

      // 2. Generate sampling checkpoints evenly across the real route arrays
      // We will sample exactly 5 positions intelligently along the route to survey weather risks
      const samplePoints = [];
      if (latLngs.length >= 5) {
         const intervals = [
             0,
             Math.floor(latLngs.length * 0.25),
             Math.floor(latLngs.length * 0.5),
             Math.floor(latLngs.length * 0.75),
             latLngs.length - 1
         ];
         intervals.forEach(i => samplePoints.push(latLngs[i]));
      } else {
         // If path too small, just use start and end
         samplePoints.push(latLngs[0]);
         if (latLngs.length > 1) samplePoints.push(latLngs[latLngs.length - 1]);
      }

      // 3. Evaluate Environmental Impacts (MERN style API callback safely mapping weather API mock)
      const identifiedRisks = [];
      
      for (let p of samplePoints) {
          try {
              // Hitting our secure backend API endpoint for processing the AI weather metrics
              const weatherResponse = await axios.get(`${BASE_URL}/api/ai/weather?lat=${p[0]}&lon=${p[1]}`);
              const wxData = weatherResponse.data;
              const mainCondition = wxData.weather?.[0]?.main || "Clear";

              // Define disruptive weather logic
              if (["Rain", "Drizzle", "Thunderstorm", "Snow"].includes(mainCondition)) {
                  identifiedRisks.push({
                      center: [p[0], p[1]],
                      condition: mainCondition,
                      radius: 60000 // 60 kilometers radius impact zone natively
                  });
              }
          } catch (weatherErr) {
              console.warn("Weather checkpoint failed for coordinates", p, weatherErr);
          }
      }

      setRiskZones(identifiedRisks);

    } catch (err) {
      console.error("Critical Mapping Failure:", err);
      // Absolute raw fallback
      setRouteCoordinates([[start.lat, start.lng||start.lon], [end.lat, end.lng||end.lon]]);
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
    <div className="w-full h-full relative z-0 min-h-full">
      
      {/* Heads-up floating overlay showing Active Risk */}
      {routeCoordinates.length > 0 && !loading && (
        <div className="absolute top-4 left-4 z-[500] bg-white border border-slate-200 p-4 shadow-xl rounded-xl w-72">
           <h3 className="font-bold text-slate-800 text-sm mb-2">AI Route Verification</h3>
           
           <div className={`p-2 rounded font-bold text-xs uppercase flex items-center justify-center`} 
                style={{ backgroundColor: `${riskConfig.color}20`, color: riskConfig.color }}>
             {riskConfig.label}
           </div>

           {riskZones.length > 0 && (
              <p className="mt-3 text-xs text-slate-600 font-semibold leading-relaxed border-t border-slate-100 pt-2">
                Identified {riskZones.length} hazard zone(s) natively crossing your transit path. Consider enabling auto-reroute safely.
              </p>
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
          routeCoordinates={routeCoordinates} 
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
        {routeCoordinates.length > 0 && (
          <Polyline 
            positions={routeCoordinates} 
            color={riskConfig.color} 
            weight={6} 
            opacity={0.9}
            lineCap="round"
            lineJoin="round"
          />
        )}

      </MapContainer>
    </div>
  );
};
