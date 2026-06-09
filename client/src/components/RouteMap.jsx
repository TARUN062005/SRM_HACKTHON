import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMap, ZoomControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { X, Layers, Crosshair, Anchor, AlertTriangle, Shield, Radio } from 'lucide-react';
import { RiskIntelPanel } from './RiskIntelPanel';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const tileUrls = {
  voyager:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
  osm:       'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

const isValidCoord = c => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);

// ── Port / Anchor marker ─────────────────────────────────────────
const makePortIcon = (type) => {
  const markerColor = type === 'origin' ? '#34a853' : '#ea4335';
  return L.divIcon({
    html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:38px;height:38px;border-radius:50%;background:${markerColor};opacity:0.4;animation:radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:relative;width:38px;height:38px;border-radius:50%;
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
};

const makePinIcon = (label, bg, shadowColor) =>
  L.divIcon({
    html: `<div style="position:relative;width:32px;height:42px;display:flex;flex-direction:column;align-items:center;">
      <div style="position:absolute;top:0;width:32px;height:32px;border-radius:50%;background:${bg};opacity:0.4;animation:radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:relative;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${bg};border:2.5px solid white;box-shadow:0 4px 14px ${shadowColor};
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:white;font-size:12px;font-weight:900;font-family:system-ui;">${label}</span>
      </div>
      <div style="width:2px;height:8px;background:${bg};opacity:0.5;border-radius:0 0 2px 2px;"></div>
    </div>`,
    className: '', iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -44],
  });

const makeWarningIcon = (severity) => {
  const color = severity === 'CRITICAL' ? '#EF4444' : severity === 'HIGH' ? '#F59E0B' : '#EAB308';
  return L.divIcon({
    html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;
      background:${color}22;border:1.5px solid ${color};border-radius:50%;box-shadow:0 0 10px ${color}33;">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>`,
    className: '', iconSize: [24, 24], iconAnchor: [12, 12]
  });
};

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

const hDistKm = (p1, p2) => {
  const dLa = (p2[1] - p1[1]) * (Math.PI / 180);
  const dLo = (p2[0] - p1[0]) * (Math.PI / 180);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ClusteredIncidentMarkers = ({ events }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  const clusters = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    // Clustering radius in km based on map zoom level
    const thresholdKm = zoom > 12 ? 2 
                      : zoom > 9 ? 15 
                      : zoom > 6 ? 80 
                      : zoom > 4 ? 250 
                      : 600;
    
    const result = [];
    for (const event of events) {
      if (!event.location || event.location.length < 2) continue;
      
      let grouped = false;
      for (const cluster of result) {
        const dist = hDistKm(
          [cluster.lon, cluster.lat],
          [event.location[1], event.location[0]]
        );
        
        if (dist < thresholdKm) {
          cluster.events.push(event);
          // Recalculate cluster center as average
          cluster.lat = (cluster.lat * (cluster.events.length - 1) + event.location[0]) / cluster.events.length;
          cluster.lon = (cluster.lon * (cluster.events.length - 1) + event.location[1]) / cluster.events.length;
          grouped = true;
          break;
        }
      }
      
      if (!grouped) {
        result.push({
          lat: event.location[0],
          lon: event.location[1],
          events: [event]
        });
      }
    }
    return result;
  }, [events, zoom]);

  return (
    <>
      {clusters.map((cluster, ci) => {
        if (cluster.events.length === 1) {
          const event = cluster.events[0];
          const severity = event.intensity >= 0.5 ? 'CRITICAL' : event.intensity >= 0.25 ? 'HIGH' : 'MODERATE';
          const severityColor = severity === 'CRITICAL' ? '#EF4444' : severity === 'HIGH' ? '#F59E0B' : '#22C55E';
          
          // Custom divicon with warning symbol inside a glowing dot
          const pinIcon = L.divIcon({
            html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
              <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:${severityColor};opacity:0.3;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
              <div style="position:relative;width:14px;height:14px;border-radius:50%;background:${severityColor};border:2px solid white;box-shadow:0 0 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
                <span style="color:white;font-size:8px;font-weight:950;font-family:system-ui;">!</span>
              </div>
            </div>`,
            className: '', iconSize: [24, 24], iconAnchor: [12, 12]
          });
          
          return (
            <Marker key={`event-${ci}`} position={[cluster.lat, cluster.lon]} icon={pinIcon}>
              <Popup>
                <div className="p-2.5 max-w-xs text-xs" style={{ background: '#0F172A', color: '#F8FAFC', borderRadius: '12px' }}>
                  {(() => {
                    if (event.image_url) {
                      return (
                        <a href={event.source_url || '#'} target={event.source_url ? "_blank" : undefined} rel="noreferrer" className={event.source_url ? "block mb-2" : "block mb-2 pointer-events-none"}>
                          <img src={event.image_url} alt={event.headline} loading="lazy" className="w-full h-24 object-cover rounded-lg hover:opacity-90 transition-opacity" />
                        </a>
                      );
                    }
                    const getDomain = (url) => {
                      if (!url) return '';
                      try { return new URL(url).hostname; } catch { return ''; }
                    };
                    const domain = getDomain(event.source_url);
                    const favicon = domain ? `https://www.google.com/s2/favicons?sz=64&domain=${domain}` : null;
                    const colors = {
                      CRITICAL: { from: '#7f1d1d', to: '#ef4444', border: 'rgba(239,68,68,0.25)', text: '#ef4444' },
                      HIGH:     { from: '#7c2d12', to: '#f97316', border: 'rgba(249,115,22,0.25)', text: '#f97316' },
                      MODERATE: { from: '#713f12', to: '#eab308', border: 'rgba(234,179,8,0.25)', text: '#eab308' },
                    };
                    const theme = colors[severity] || colors.MODERATE;
                    return (
                      <a href={event.source_url || '#'} target={event.source_url ? "_blank" : undefined} rel="noreferrer" className={event.source_url ? "block mb-2 border rounded-lg overflow-hidden" : "block mb-2 border rounded-lg overflow-hidden pointer-events-none"} style={{ borderColor: theme.border }}>
                        <div className="w-full h-20 flex flex-col items-center justify-center gap-1 p-2"
                          style={{ background: `linear-gradient(135deg, ${theme.from}22, ${theme.to}08)` }}>
                          {favicon ? (
                            <img src={favicon} alt={event.publisher || domain} className="w-7 h-7 rounded bg-[#0B1220] p-1 border border-white/10" onError={e => { e.target.style.display = 'none'; }} />
                          ) : (
                            <Radio size={12} style={{ color: theme.text }} className="opacity-60 animate-pulse" />
                          )}
                          {event.publisher && <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">{event.publisher}</span>}
                        </div>
                      </a>
                    );
                  })()}
                  <p className="font-black text-sm mb-1 leading-snug" style={{ color: severityColor }}>{event.headline}</p>
                  <p className="text-[9px] uppercase font-extrabold tracking-wider opacity-85 mb-1.5" style={{ color: severityColor }}>
                    {event.label || 'threat'} · {event.confidence != null ? `${(event.confidence * 100).toFixed(0)}% confidence` : ''}
                  </p>
                  {event.publisher && (
                    <p className="text-[10px] mb-1" style={{ color: '#94A3B8' }}>
                      Publisher: <span className="font-bold">{event.publisher}</span>
                    </p>
                  )}
                  {event.published_at && (
                    <p className="text-[9px] opacity-60 mb-2">
                      Published Date: {new Date(event.published_at).toLocaleDateString()}
                    </p>
                  )}
                  {event.source_url && (
                    <a href={event.source_url} target="_blank" rel="noreferrer" 
                      className="inline-flex items-center justify-center w-full px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-white bg-cyan-600 hover:bg-cyan-500 transition-colors text-center mt-1">
                      Read Article
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        } else {
          const count = cluster.events.length;
          const hasCritical = cluster.events.some(e => e.intensity >= 0.5);
          const hasHigh = cluster.events.some(e => e.intensity >= 0.25);
          const clusterBg = hasCritical ? '#EF4444' : hasHigh ? '#F59E0B' : '#22C55E';
          
          const clusterIcon = L.divIcon({
            html: `<div style="width:34px;height:34px;border-radius:50%;background:${clusterBg};
              border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;
              justify-content:center;color:white;font-size:11px;font-weight:900;font-family:system-ui;">${count}</div>`,
            className: '', iconSize: [34, 34], iconAnchor: [17, 17]
          });

          return (
            <Marker key={`cluster-${ci}`} position={[cluster.lat, cluster.lon]} icon={clusterIcon}
              eventHandlers={{
                click: () => {
                  map.setView([cluster.lat, cluster.lon], Math.min(18, zoom + 2));
                }
              }}
            />
          );
        }
      })}
    </>
  );
};

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

const makeAirportMarkerIcon = (type) => {
  const markerColor = type === 'origin' ? '#34a853' : '#ea4335';
  return L.divIcon({
    html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:38px;height:38px;border-radius:50%;background:${markerColor};opacity:0.4;animation:radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:relative;width:38px;height:38px;border-radius:50%;
        background:${type === 'origin' ? '#1a73e8' : '#ea4335'};
        border:3px solid white;box-shadow:0 4px 16px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
      </div>
      <div style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;
        background:${type === 'origin' ? '#34a853' : '#ea4335'};border:2px solid white;"></div>
    </div>`,
    className: '', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22],
  });
};

const AnimatedPolyline = ({ positions, children, ...props }) => {
  const [visibleCoords, setVisibleCoords] = useState([]);

  useEffect(() => {
    if (!positions || positions.length === 0) {
      setVisibleCoords([]);
      return;
    }

    let currentIdx = 0;
    const totalPoints = positions.length;
    const duration = 800; // 0.8s animation
    const steps = Math.min(totalPoints, 45);
    const stepInterval = duration / steps;
    
    setVisibleCoords([positions[0]]);

    const timer = setInterval(() => {
      currentIdx = Math.min(currentIdx + Math.ceil(totalPoints / steps), totalPoints);
      setVisibleCoords(positions.slice(0, currentIdx));
      if (currentIdx >= totalPoints) {
        clearInterval(timer);
      }
    }, stepInterval);

    return () => clearInterval(timer);
  }, [positions]);

  if (visibleCoords.length < 2) return null;
  return <Polyline positions={visibleCoords} {...props}>{children}</Polyline>;
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

// ── Reset map view on mode change ───────────────────────────────
const MapReset = ({ resetSignal }) => {
  const map = useMap();
  useEffect(() => {
    if (resetSignal == null) return;
    map.setView([25, 15], 2, { animate: false });
  }, [resetSignal, map]);
  return null;
};

// ── Center map on coordinate ──────────────────────────────────────
const CenterMapControl = ({ centerCoord }) => {
  const map = useMap();
  useEffect(() => {
    if (centerCoord && Array.isArray(centerCoord) && centerCoord.length === 2 && !isNaN(centerCoord[0]) && !isNaN(centerCoord[1])) {
      map.flyTo(centerCoord, 8, { duration: 1.2 });
    }
  }, [centerCoord, map]);
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

// ── MAIN MAP ─────────────────────────────────────────────────────
export const RouteMap = ({
  selectedSource, selectedDestination,
  setSelectedSource, setSelectedDestination,
  vehicleMode = 'truck',
  freightMode = 'ship',
  onClearRoute, onRouteData,
  activeRouteIndex = 0, onSetActiveRoute,
  isNavigating = false, simSpeed = 2,
  aiRecommendation = null,
  resetSignal = null,
  replayingShipment = null,
  setReplayingShipment = null,
  centerMapTo = null,
  setCenterMapTo = null,
}) => {
  const [allRoutes, setAllRoutes]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [mapType, setMapType]               = useState('voyager');
  const [showSeamarks, setShowSeamarks]     = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [hoveredRoute, setHoveredRoute]     = useState(null);
  const [showRiskPanel, setShowRiskPanel]   = useState(false);
  // Port-snapped coordinates (sea mode only) — these are the actual port locations
  const [portOriginCoord, setPortOriginCoord] = useState(null);
  const [portDestCoord,   setPortDestCoord]   = useState(null);
  const [portOriginName,  setPortOriginName]  = useState(null);
  const [portDestName,    setPortDestName]    = useState(null);
  // Airport-snapped coordinates (air mode only)
  const [airportOriginCoord, setAirportOriginCoord] = useState(null);
  const [airportDestCoord, setAirportDestCoord] = useState(null);
  const [airportOriginName, setAirportOriginName] = useState(null);
  const [airportDestName, setAirportDestName] = useState(null);
  const [routeError,      setRouteError]      = useState(null);
  const [activeLayers,    setActiveLayers]    = useState({
    route: true,
    weather: true,
    risks: true,
    ports: true,
    airports: true,
    incidents: true
  });

  useEffect(() => { setShowSeamarks(freightMode === 'ship'); }, [freightMode]);

  const onRouteDataRef = useRef(onRouteData);
  useEffect(() => { onRouteDataRef.current = onRouteData; }, [onRouteData]);

  useEffect(() => {
    if (resetSignal == null) return;
    setAllRoutes([]);
    setPortOriginCoord(null);
    setPortDestCoord(null);
    setPortOriginName(null);
    setPortDestName(null);
    setAirportOriginCoord(null);
    setAirportDestCoord(null);
    setAirportOriginName(null);
    setAirportDestName(null);
    setHoveredRoute(null);
    setShowRiskPanel(false);
    setRouteError(null);
    onSetActiveRoute?.(0);
    onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
  }, [resetSignal, onSetActiveRoute]);

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
          intelligence: { loading: true },
          baseDuration: r.duration / scale,
        }));
        setAllRoutes(processed);

        // Extract port coordinates for sea mode — use actual snapped port locations for markers
        const firstRoute = processed[0];
        if (mode === 'ship' && firstRoute?.originPort && firstRoute?.destPort) {
          setPortOriginCoord([firstRoute.originPort.lat, firstRoute.originPort.lon]);
          setPortDestCoord([firstRoute.destPort.lat,   firstRoute.destPort.lon]);
          setPortOriginName(`${firstRoute.originPort.name} Port`);
          setPortDestName(`${firstRoute.destPort.name} Port`);
          console.log(`[MAP] Port markers: ${firstRoute.originPort.name} → ${firstRoute.destPort.name}`);
        } else {
          setPortOriginCoord(null); setPortDestCoord(null);
          setPortOriginName(null);  setPortDestName(null);
        }

        if (mode === 'air' && firstRoute?.originAirport && firstRoute?.destAirport) {
          setAirportOriginCoord([firstRoute.originAirport.lat, firstRoute.originAirport.lon]);
          setAirportDestCoord([firstRoute.destAirport.lat,   firstRoute.destAirport.lon]);
          setAirportOriginName(`${firstRoute.originAirport.name}`);
          setAirportDestName(`${firstRoute.destAirport.name}`);
          console.log(`[MAP] Airport markers: ${firstRoute.originAirport.name} → ${firstRoute.destAirport.name}`);
        } else {
          setAirportOriginCoord(null); setAirportDestCoord(null);
          setAirportOriginName(null);  setAirportDestName(null);
        }

        onRouteDataRef.current?.({ allRoutes: processed, activeRouteIndex: 0 });
        setRouteError(null);

        // Fetch intelligence in parallel for all routes
        processed.forEach(async (route) => {
          try {
            const intelRes = await axios.post(`${BASE_URL}/api/ai/risk/analyze`, {
              origin: start.display_name,
              destination: end.display_name,
              mode: freightMode,
              routeCoords: route.geometry.coordinates
            });
            if (intelRes.data.success) {
              setAllRoutes(curr => {
                const updated = curr.map(cr => cr.id === route.id ? { ...cr, intelligence: intelRes.data.intelligence } : cr);
                onRouteDataRef.current?.({ allRoutes: updated, activeRouteIndex: 0 });
                return updated;
              });
            }
          } catch (intelErr) {
            console.error('[RouteMap] Intel fetch error:', intelErr.message);
            setAllRoutes(curr => {
              const updated = curr.map(cr => cr.id === route.id ? { ...cr, intelligence: { error: true, summary: 'Risk intelligence temporarily unavailable.' } } : cr);
              onRouteDataRef.current?.({ allRoutes: updated, activeRouteIndex: 0 });
              return updated;
            });
          }
        });
      } else {
        setAllRoutes([]);
        setPortOriginCoord(null); setPortDestCoord(null);
        setPortOriginName(null);  setPortDestName(null);
        onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
        setRouteError('No route could be generated between these points.');
      }
    } catch (err) {
      console.error('Route fetch error:', err.message);
      setAllRoutes([]);
      setPortOriginCoord(null); setPortDestCoord(null);
      setPortOriginName(null);  setPortDestName(null);
      onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message || 'Routing engine failed';
      setRouteError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [freightMode]);

  useEffect(() => {
    if (replayingShipment) {
      console.log('[RouteMap] Restoring replayed shipment state...', replayingShipment);
      const coords = replayingShipment.routeGeometry.coordinates || [];
      const replayedRoute = {
        id: 0,
        type: 'Replayed Route',
        geometry: replayingShipment.routeGeometry,
        coords: coords.map(c => [c[1], c[0]]),
        distance: replayingShipment.distance,
        duration: replayingShipment.eta,
        summary: replayingShipment.mode === 'road' ? 'Road Route' : replayingShipment.mode === 'sea' ? 'Sea Route' : 'Air Route',
        intelligence: { loading: true },
        vehicle: replayingShipment.mode === 'road' ? 'truck' : replayingShipment.mode === 'sea' ? 'ship' : 'air'
      };

      setAllRoutes([replayedRoute]);
      
      if (replayingShipment.mode === 'sea') {
        const startPt = [coords[0][1], coords[0][0]];
        const endPt = [coords[coords.length - 1][1], coords[coords.length - 1][0]];
        setPortOriginCoord(startPt);
        setPortDestCoord(endPt);
        setPortOriginName(replayingShipment.origin);
        setPortDestName(replayingShipment.destination);

        setAirportOriginCoord(null); setAirportDestCoord(null);
        setAirportOriginName(null);  setAirportDestName(null);
      } else if (replayingShipment.mode === 'air') {
        const startPt = [coords[0][1], coords[0][0]];
        const endPt = [coords[coords.length - 1][1], coords[coords.length - 1][0]];
        setAirportOriginCoord(startPt);
        setAirportDestCoord(endPt);
        setAirportOriginName(replayingShipment.origin);
        setAirportDestName(replayingShipment.destination);

        setPortOriginCoord(null); setPortDestCoord(null);
        setPortOriginName(null);  setPortDestName(null);
      } else {
        setPortOriginCoord(null); setPortDestCoord(null);
        setPortOriginName(null);  setPortDestName(null);
        setAirportOriginCoord(null); setAirportDestCoord(null);
        setAirportOriginName(null);  setAirportDestName(null);
      }

      onRouteDataRef.current?.({ allRoutes: [replayedRoute], activeRouteIndex: 0 });
      setRouteError(null);

      // Trigger fresh weather & GeoRisk intelligence fetch for the replayed route!
      const fetchReplayedIntel = async () => {
        try {
          const intelRes = await axios.post(`${BASE_URL}/api/ai/risk/analyze`, {
            origin: replayingShipment.origin,
            destination: replayingShipment.destination,
            mode: replayingShipment.mode === 'road' ? 'truck' : replayingShipment.mode === 'sea' ? 'ship' : 'air',
            routeCoords: replayingShipment.routeGeometry.coordinates
          });
          if (intelRes.data.success) {
            const updatedRoute = { ...replayedRoute, intelligence: intelRes.data.intelligence };
            setAllRoutes([updatedRoute]);
            onRouteDataRef.current?.({ allRoutes: [updatedRoute], activeRouteIndex: 0 });
            setShowRiskPanel(true);
          }
        } catch (intelErr) {
          console.error('[RouteMap] Replay intel error:', intelErr.message);
          const updatedRoute = { ...replayedRoute, intelligence: { error: true, summary: 'Risk intelligence temporarily unavailable.' } };
          setAllRoutes([updatedRoute]);
          onRouteDataRef.current?.({ allRoutes: [updatedRoute], activeRouteIndex: 0 });
          setShowRiskPanel(true);
        }
      };

      fetchReplayedIntel();
      setReplayingShipment(null); // Clear the replaying state
      return;
    }

    if (selectedSource && selectedDestination) {
      const t = setTimeout(() => fetchRoutes(selectedSource, selectedDestination, vehicleMode), 300);
      return () => clearTimeout(t);
    } else {
      setAllRoutes([]);
      setPortOriginCoord(null); setPortDestCoord(null);
      setPortOriginName(null);  setPortDestName(null);
      onRouteDataRef.current?.({ allRoutes: [], activeRouteIndex: 0 });
      setRouteError(null);
    }
  }, [selectedSource, selectedDestination, vehicleMode, fetchRoutes, replayingShipment, setReplayingShipment]);

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

  // ── Per-mode visual strategy ──────────────────────────────────────
  const MODE_STYLE = {
    ship:  { activeColor: '#00C2FF', altColor: '#00C2FF', glowColor: 'transparent', weight: 5, altWeight: 4, dashArray: null,    glowW: 0 },
    air:   { activeColor: '#00C2FF', altColor: '#00C2FF', glowColor: 'transparent', weight: 4, altWeight: 3, dashArray: '12 8',  glowW: 0 },
    truck: { activeColor: '#00C2FF', altColor: '#00C2FF', glowColor: 'transparent', weight: 5, altWeight: 4, dashArray: null,    glowW: 0 },
  };
  const modeStyle = MODE_STYLE[freightMode] || MODE_STYLE.truck;

  // ── Active route risk intelligence ────────────────────────────────────────
  const activeIntel    = allRoutes[activeRouteIndex]?.intelligence ?? null;
  const riskScore      = activeIntel?.riskScore    ?? 0;
  const riskSeverity   = activeIntel?.severity     ?? 'STABLE';
  const riskZones      = activeIntel?.riskZones    ?? [];

  // Duration formatter: show in hours/days for ship, minutes for land/air
  const formatDuration = (seconds) => {
    if (freightMode === 'ship') {
      const days = seconds / 86400;
      return days >= 1 ? `${days.toFixed(1)} days` : `${(seconds / 3600).toFixed(0)} hrs`;
    }
    if (freightMode === 'air') {
      const hrs = seconds / 3600;
      return hrs >= 1 ? `${hrs.toFixed(1)} hrs` : `${(seconds / 60).toFixed(0)} min`;
    }
    return `${(seconds / 60).toFixed(0)} min`;
  };

  const mapLayers = useMemo(() => {
    return [...allRoutes]
      .sort((a, b) => a.id === activeRouteIndex ? 1 : b.id === activeRouteIndex ? -1 : 0)
      .map(route => {
        if (!route.coords?.length) return null;
        const isActive = route.id === activeRouteIndex;
        const isHov    = hoveredRoute === route.id && !isActive;
        const riskSev  = route.intelligence?.severity || 'STABLE';
        const riskLineColor = riskSev === 'CRITICAL' ? '#EF4444'
          : (riskSev === 'HIGH' || riskSev === 'CAUTION') ? '#F59E0B'
          : '#22C55E';
        const color    = isActive ? modeStyle.activeColor : riskLineColor;
        const weight   = isActive ? modeStyle.weight : (isHov ? modeStyle.altWeight + 1 : modeStyle.altWeight);
        const opacity  = isActive ? 1 : (isHov ? 0.82 : 0.55);
        const dash     = !isActive && freightMode === 'air' ? modeStyle.dashArray : (isActive ? null : modeStyle.dashArray);

        // Duration label
        const durLabel = freightMode === 'ship'
          ? `${(route.duration / 86400).toFixed(1)}d · ${(route.distance / 1000).toFixed(0)} km`
          : freightMode === 'air'
          ? `${(route.duration / 3600).toFixed(1)}h · ${(route.distance / 1000).toFixed(0)} km`
          : `${(route.duration / 60).toFixed(0)} min · ${(route.distance / 1000).toFixed(1)} km`;

        return (
          <React.Fragment key={route.id}>
            {/* Glow line 1 - Wide soft outer glow */}
            {activeLayers.route && (
              <AnimatedPolyline
                positions={route.coords}
                color={color}
                weight={isActive ? weight + 10 : (isHov ? weight + 8 : weight + 6)}
                opacity={isActive ? 0.15 : (isHov ? 0.08 : 0.04)}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {/* Glow line 2 - Medium inner glow */}
            {activeLayers.route && (
              <AnimatedPolyline
                positions={route.coords}
                color={color}
                weight={isActive ? weight + 4 : (isHov ? weight + 3 : weight + 2)}
                opacity={isActive ? 0.35 : (isHov ? 0.18 : 0.08)}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {/* Outline core */}
            {activeLayers.route && (
              <AnimatedPolyline
                positions={route.coords}
                color="white"
                weight={isActive ? weight + 1 : (isHov ? weight + 1 : weight + 1)}
                opacity={isActive ? 0.85 : 0.35}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {/* Main route line */}
            {activeLayers.route && (
              <AnimatedPolyline
                positions={route.coords}
                color={color}
                weight={isActive ? weight - 1 : (isHov ? weight - 1 : weight - 1)}
                opacity={isActive ? 1.0 : 0.7}
                lineCap="round"
                lineJoin="round"
                dashArray={dash}
                eventHandlers={{
                  click:     () => onSetActiveRoute?.(route.id),
                  mouseover: () => setHoveredRoute(route.id),
                  mouseout:  () => setHoveredRoute(null),
                }}
              >
                <Tooltip sticky direction="top" opacity={1} className="!border-0 !shadow-none !p-0 !bg-transparent">
                  <div
                    className="text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl pointer-events-none whitespace-nowrap"
                    style={{ background: isActive ? modeStyle.activeColor : riskLineColor }}
                  >
                    {durLabel}
                    {route.summary && <span className="ml-2 opacity-70 font-normal">· {route.summary}</span>}
                    {!isActive && (
                      <span
                        className="ml-2 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(0,0,0,0.25)' }}
                      >
                        {riskSev}
                      </span>
                    )}
                  </div>
                </Tooltip>
              </AnimatedPolyline>
            )}

            {/* Navigation simulator dot */}
            {activeLayers.route && (
              <NavigationSimulator
                coords={route.coords}
                isActive={isActive}
                isNavigating={isNavigating}
                speedMultiplier={simSpeed}
                freightMode={freightMode}
              />
            )}

            {/* Waypoint intelligence markers (active route only) */}
            {activeLayers.weather && isActive && route.intelligence?.waypointReports?.map((wp, idx) => {
              const total = route.intelligence.waypointReports.length;
              const pos = route.coords[Math.floor(idx * (route.coords.length - 1) / Math.max(total - 1, 1))];
              if (!isValidCoord(pos)) return null;
              return (
                <Marker key={`wp-${idx}`} position={pos} icon={makeWaypointIcon(idx + 1, wp.severity === 'CRITICAL')}>
                  <Popup>
                    <div className="p-2 text-xs text-white bg-slate-950 rounded-xl space-y-1.5 border border-slate-800" style={{ minWidth: '150px' }}>
                      <div className="font-extrabold text-[13px] border-b border-slate-800 pb-1 text-cyan-400">{wp.place}</div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                        <div>Condition: <span className="font-bold text-slate-200">{wp.condition}</span></div>
                        <div>Temp: <span className="font-bold text-slate-200">{wp.temp}°C</span></div>
                        <div>Wind: <span className="font-bold text-slate-200">{wp.wind} km/h</span></div>
                        <div>Visibility: <span className="font-bold text-slate-200">{wp.visibility || 'N/A'}</span></div>
                        <div>Rain: <span className="font-bold text-slate-200">{wp.rain || '0 mm'}</span></div>
                        <div>Storm Risk: <span className="font-bold text-slate-200">{wp.stormRisk || 'Low'}</span></div>
                      </div>
                      <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded text-center tracking-wider mt-1 ${
                        wp.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800/50' :
                        wp.severity === 'CAUTION' ? 'bg-amber-950 text-amber-400 border border-amber-800/50' :
                        'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                      }`}>
                        Hazard: {wp.severity}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </React.Fragment>
        );
      });
  }, [allRoutes, activeRouteIndex, isNavigating, simSpeed, hoveredRoute, onSetActiveRoute, modeStyle, freightMode, activeLayers]);

  const isMaritime = freightMode === 'ship';
  const srcIcon = isMaritime ? portOriginIcon : startPin;
  const dstIcon = isMaritime ? portDestIcon   : endPin;

  const layerOptions = [
    { id: 'voyager',   label: 'Map',       emoji: '🗺️' },
    { id: 'satellite', label: 'Satellite', emoji: '🛰️' },
    { id: 'terrain',   label: 'Terrain',   emoji: '⛰️' },
    { id: 'dark',      label: 'Dark',      emoji: '🌑' },
    { id: 'light',     label: 'Light',     emoji: '☀️' },
    { id: 'osm',       label: 'Street',    emoji: '🏙️' },
  ];

  return (
    <div className="w-full h-full relative overflow-hidden dashboard-shell">
      <style>{`
        @keyframes radar-pulse {
          0% {
            transform: scale(0.6);
            opacity: 1;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
      `}</style>

      {/* Loading bar */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-[2000] h-[3px] overflow-hidden pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full"
              style={{ background: 'var(--accent)' }}
              initial={{ x: '-100%' }}
              animate={{ x: '110%' }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode badge — always visible */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1050] pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div key={freightMode}
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              {freightMode === 'ship'  ? 'Maritime Route Intelligence'
             : freightMode === 'air'  ? 'Air Route · Great-Circle Path'
             : 'Road Route Intelligence'}
            </span>
            {isMaritime && showSeamarks && <span className="text-[8px] font-bold" style={{ color: 'var(--text-secondary)' }}>· OpenSeaMap</span>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Layer picker — top right */}
      <div className="absolute top-3 right-3 z-[1050] flex flex-col items-end gap-2">
        <AnimatePresence>
          {showLayerPicker && (
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              className="flex flex-col gap-2 p-2.5 rounded-2xl border" style={{ minWidth: 204, background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-[8px] font-black uppercase tracking-widest px-0.5" style={{ color: 'var(--text-secondary)' }}>Map Style</p>
              <div className="grid grid-cols-3 gap-1.5">
                {layerOptions.map(t => (
                  <button key={t.id} onClick={() => { setMapType(t.id); setShowLayerPicker(false); }}
                    className={`flex flex-col items-center justify-center gap-1 h-[54px] rounded-xl border transition-all ${mapType === t.id ? 'text-white' : ''}`}
                    style={{
                      background: mapType === t.id ? 'rgba(0,194,255,0.12)' : 'var(--bg)',
                      borderColor: mapType === t.id ? 'rgba(0,194,255,0.35)' : 'var(--border)',
                    }}>
                    <span className="text-lg leading-none">{t.emoji}</span>
                    <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: mapType === t.id ? 'var(--accent)' : 'var(--text-secondary)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowSeamarks(v => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all"
                style={{
                  background: showSeamarks ? 'rgba(0,194,255,0.12)' : 'var(--bg)',
                  borderColor: showSeamarks ? 'rgba(0,194,255,0.35)' : 'var(--border)',
                  color: showSeamarks ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                <div className="w-3 h-3 rounded border-2 flex items-center justify-center"
                  style={{ borderColor: showSeamarks ? 'var(--accent)' : 'var(--text-secondary)', background: showSeamarks ? 'var(--accent)' : 'transparent' }}>
                  {showSeamarks && <span className="text-white text-[8px] font-black">✓</span>}
                </div>
                OpenSeaMap Overlay
              </button>

              <div className="w-full h-px bg-slate-800/80 my-1" />
              <p className="text-[8px] font-black uppercase tracking-widest px-0.5 mb-1.5" style={{ color: 'var(--text-secondary)' }}>Intelligence Overlays</p>
              <div className="space-y-1.5 text-xs text-slate-300 font-bold px-0.5">
                {[
                  { id: 'route', label: 'Route Corridor', emoji: '🛣️' },
                  { id: 'weather', label: 'Weather Metrics', emoji: '🌤️' },
                  { id: 'risks', label: 'Risk Hotspots', emoji: '⚠️' },
                  { id: 'ports', label: 'Seaports Network', emoji: '⚓' },
                  { id: 'airports', label: 'Airports Network', emoji: '✈️' },
                  { id: 'incidents', label: 'Live Incidents', emoji: '📡' },
                ].map(layer => (
                  <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={activeLayers[layer.id]}
                      onChange={(e) => setActiveLayers(prev => ({ ...prev, [layer.id]: e.target.checked }))}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/20 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{layer.emoji} {layer.label}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => setShowLayerPicker(v => !v)} title="Map layers"
          className={`w-[34px] h-[34px] rounded-xl border flex items-center justify-center transition-all dashboard-surface-strong ${showLayerPicker ? 'text-white' : ''}`}
          style={{ color: showLayerPicker ? 'var(--accent)' : 'var(--text-secondary)' }}>
          <Layers size={15} />
        </button>
      </div>

      {/* Risk score badge — bottom right, above zoom controls */}
      <AnimatePresence>
        {allRoutes.length > 0 && activeIntel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-24 right-3 z-[1050]"
          >
            <button
              onClick={() => setShowRiskPanel(v => !v)}
              title="Open Risk Intelligence Panel"
              className={`flex items-center gap-2.5 pl-3.5 pr-4 py-2.5 rounded-xl shadow-lg border-2 transition-all hover:shadow-xl ${
                showRiskPanel
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : riskSeverity === 'CRITICAL'
                  ? 'bg-red-600 border-red-500 hover:bg-red-700 text-white'
                  : riskSeverity === 'CAUTION'
                  ? 'bg-amber-500 border-amber-400 hover:bg-amber-600 text-white'
                  : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-700 text-white'
              }`}
            >
              <div className="flex flex-col items-center leading-none">
                <span className="text-[20px] font-black leading-none">{riskScore}</span>
                <span className="text-[7px] font-black uppercase tracking-widest opacity-75 mt-0.5">risk</span>
              </div>
              <div className="w-px h-8 bg-white/30" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <Radio size={8} className="animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-wider">{riskSeverity}</span>
                </div>
                <span className="text-[8px] opacity-70 leading-tight">
                  {riskZones.length} zone{riskZones.length !== 1 ? 's' : ''} · tap for intel
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progressive loading overlay HUD */}
      <AnimatePresence>
        {(loading || activeIntel?.loading) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-24 left-3 z-[1050] p-4 rounded-2xl border backdrop-blur-md shadow-2xl"
            style={{
              background: 'rgba(15,23,42,0.85)',
              borderColor: 'rgba(55,65,81,0.7)',
              width: '280px'
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                Intelligence Engine Sync
              </span>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
            </div>
            
            <div className="space-y-2.5 text-[11px] font-bold">
              {/* Step 1: Route */}
              <div className="flex items-center gap-2.5 text-emerald-400">
                {!loading ? (
                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[10px]">✓</div>
                ) : (
                  <div className="w-4 h-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[10px] animate-pulse">⏳</div>
                )}
                <span className={loading ? 'text-cyan-400' : 'text-emerald-400'}>
                  {loading ? 'Loading Route Geometry...' : 'Route Geometry Loaded'}
                </span>
              </div>

              {/* Step 2: Weather */}
              <div className={`flex items-center gap-2.5 ${!loading && activeIntel?.loading ? 'text-cyan-400' : loading ? 'text-slate-500' : 'text-emerald-400'}`}>
                {loading ? (
                  <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">○</div>
                ) : activeIntel?.loading ? (
                  <div className="w-4 h-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[10px] animate-pulse">⏳</div>
                ) : (
                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[10px]">✓</div>
                )}
                <span>
                  {loading ? 'Loading Weather Checkpoints...' : activeIntel?.loading ? 'Loading Weather Checkpoints...' : 'Weather Checkpoints Loaded'}
                </span>
              </div>

              {/* Step 3: Risks */}
              <div className={`flex items-center gap-2.5 ${!loading && activeIntel?.loading ? 'text-cyan-400' : loading ? 'text-slate-500' : 'text-emerald-400'}`}>
                {loading ? (
                  <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">○</div>
                ) : activeIntel?.loading ? (
                  <div className="w-4 h-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[10px] animate-pulse">⏳</div>
                ) : (
                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[10px]">✓</div>
                )}
                <span>
                  {loading ? 'Loading Risk Intelligence...' : activeIntel?.loading ? 'Loading Risk & Threat Intelligence...' : 'Risk & Threat Intelligence Loaded'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAP */}
      <MapContainer center={[25, 15]} zoom={2}
        minZoom={2} maxZoom={18}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        preferCanvas={true}
        style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
        zoomControl={false} dragging attributionControl={false}>
        <CenterMapControl centerCoord={centerMapTo} />
        <MapFitBounds allRoutes={allRoutes} />
        <MapReset resetSignal={resetSignal} />
        <ZoomControl position="bottomright" />
        <LocateMeButton />
        <TileLayer url={tileUrls[mapType]} attribution='&copy; CARTO' maxZoom={20} noWrap={true} bounds={[[-85, -180], [85, 180]]} />
        {showSeamarks && (
          <TileLayer url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='&copy; OpenSeaMap' opacity={0.8} maxZoom={18} noWrap={true} bounds={[[-85, -180], [85, 180]]} />
        )}

        {/* Risk zone threat overlays */}
        {activeLayers.risks && riskZones.map(zone => {
          const zoneColor = zone.severity === 'CRITICAL' ? '#dc2626'
            : zone.severity === 'HIGH' ? '#ea580c'
            : '#d97706';
          return (
            <React.Fragment key={zone.id}>
              <Circle
                center={[zone.lat, zone.lon]}
                radius={zone.radiusKm * 1000}
                pathOptions={{
                  color: zoneColor,
                  fillColor: zoneColor,
                  fillOpacity: 0.07,
                  weight: 1.5,
                  opacity: 0.5,
                  dashArray: '6 5',
                }}
              >
                <Popup>
                  <div className="p-1" style={{ minWidth: 180, maxWidth: 220 }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ fontSize: 13 }}>
                        {zone.type === 'conflict' ? '⚔️' : zone.type === 'piracy' ? '🏴' : '🚩'}
                      </span>
                      <p className="font-black text-slate-800 text-xs">{zone.name}</p>
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: zoneColor }} className="mb-1">
                      {zone.severity} · {zone.type}
                    </p>
                    <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{zone.reason}</p>
                  </div>
                </Popup>
              </Circle>
              <Marker
                position={[zone.lat, zone.lon]}
                icon={makeWarningIcon(zone.severity)}
              >
                <Popup>
                  <div className="p-1" style={{ minWidth: 180, maxWidth: 220 }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ fontSize: 13 }}>
                        {zone.type === 'conflict' ? '⚔️' : zone.type === 'piracy' ? '🏴' : '🚩'}
                      </span>
                      <p className="font-black text-slate-800 text-xs">{zone.name}</p>
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: zoneColor }} className="mb-1">
                      {zone.severity} · {zone.type}
                    </p>
                    <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{zone.reason}</p>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {mapLayers}

        {/* Plot actual event locations returned by GEO_RISK_ENGINE with clustering */}
        {activeLayers.incidents && (
          <ClusteredIncidentMarkers events={activeIntel?.events || []} />
        )}

        {/* Dynamic snaps and indicators based on activeLayers */}
        {(() => {
          const isMaritime = freightMode === 'ship';
          const isAir = freightMode === 'air';

          const originPos = isMaritime && portOriginCoord ? portOriginCoord 
                          : isAir && airportOriginCoord ? airportOriginCoord 
                          : sourceCoord;

          const destPos = isMaritime && portDestCoord ? portDestCoord 
                        : isAir && airportDestCoord ? airportDestCoord 
                        : destCoord;

          const originIcon = isMaritime && activeLayers.ports ? portOriginIcon 
                           : isAir && activeLayers.airports ? makeAirportMarkerIcon('origin') 
                           : startPin;

          const destIcon = isMaritime && activeLayers.ports ? portDestIcon 
                         : isAir && activeLayers.airports ? makeAirportMarkerIcon('dest') 
                         : endPin;

          return (
            <>
              {originPos && (
                <Marker position={originPos} icon={originIcon} zIndexOffset={1000}>
                  <Popup>
                    <div className="p-1 text-xs">
                      <p className="text-[10px] text-green-600 font-black uppercase mb-0.5">
                        {isMaritime && activeLayers.ports ? 'Origin Port' 
                         : isAir && activeLayers.airports ? 'Origin Airport' 
                         : 'Origin'}
                      </p>
                      <p className="font-bold text-slate-800">
                        {isMaritime ? (portOriginName || selectedSource?.display_name?.split(',')[0])
                         : isAir ? (airportOriginName || selectedSource?.display_name?.split(',')[0])
                         : selectedSource?.display_name?.split(',')[0]}
                      </p>
                      {((isMaritime && portOriginName) || (isAir && airportOriginName)) && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                          Nearest {isMaritime ? 'port' : 'airport'} to {selectedSource?.display_name?.split(',')[0]}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}

              {destPos && (
                <Marker position={destPos} icon={destIcon} zIndexOffset={1000}>
                  <Popup>
                    <div className="p-1 text-xs">
                      <p className="text-[10px] text-red-500 font-black uppercase mb-0.5">
                        {isMaritime && activeLayers.ports ? 'Destination Port' 
                         : isAir && activeLayers.airports ? 'Destination Airport' 
                         : 'Destination'}
                      </p>
                      <p className="font-bold text-slate-800">
                        {isMaritime ? (portDestName || selectedDestination?.display_name?.split(',')[0])
                         : isAir ? (airportDestName || selectedDestination?.display_name?.split(',')[0])
                         : selectedDestination?.display_name?.split(',')[0]}
                      </p>
                      {((isMaritime && portDestName) || (isAir && airportDestName)) && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                          Nearest {isMaritime ? 'port' : 'airport'} to {selectedDestination?.display_name?.split(',')[0]}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          );
        })()}
      </MapContainer>

      {/* Risk Intelligence Panel — slides in from right */}
      <RiskIntelPanel
        intelligence={activeIntel}
        isOpen={showRiskPanel}
        onClose={() => setShowRiskPanel(false)}
        allRoutes={allRoutes}
        activeRouteIndex={activeRouteIndex}
        onSwitchRoute={onSetActiveRoute}
        freightMode={freightMode}
        aiRecommendation={aiRecommendation}
      />

      {/* Error Warning Banner Overlay */}
      <AnimatePresence>
        {routeError && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-[2000] w-[90%] max-w-lg p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3.5"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderColor: 'rgba(239, 68, 68, 0.35)',
              boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.2), inset 0 0 12px rgba(239, 68, 68, 0.1)'
            }}
          >
            <div className="p-2 rounded-xl flex-shrink-0" style={{ background: 'rgba(239, 68, 68, 0.25)' }}>
              <AlertTriangle size={18} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black text-red-200 tracking-wide uppercase">Route Computation Blocked</h4>
              <p className="text-xs text-red-300/90 mt-1 font-medium leading-relaxed">{routeError}</p>
            </div>
            <button
              onClick={() => setRouteError(null)}
              className="p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
              style={{ color: 'rgba(239, 68, 68, 0.7)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#FCA5A5'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(239, 68, 68, 0.7)'}
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RouteMap;
