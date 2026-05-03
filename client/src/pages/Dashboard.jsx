import React, { useState, useCallback } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Bike, Bus, Truck, Footprints, Navigation,
  Play, Square, CloudRain, Wind, Sun, Zap,
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  ExternalLink, X,
} from 'lucide-react';

const VEHICLE_MODES = [
  { label: 'Drive', value: 'car', Icon: Car },
  { label: 'Bike', value: 'bike', Icon: Bike },
  { label: 'Walk', value: 'foot', Icon: Footprints },
  { label: 'Transit', value: 'bus', Icon: Bus },
  { label: 'Truck', value: 'truck', Icon: Truck },
];

const ROUTE_LABELS = ['Best route', 'Alternate 1', 'Alternate 2'];

const getWeatherIcon = (condition) => {
  if (!condition) return Wind;
  if (condition.includes('Storm')) return Zap;
  if (condition.includes('Rain')) return CloudRain;
  if (condition.includes('Clear') || condition.includes('Sun')) return Sun;
  return Wind;
};

const Dashboard = () => {
  const { user } = useAuth();

  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [vehicleMode, setVehicleMode] = useState('car');
  const [allRoutes, setAllRoutes] = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(2);
  const [showIntel, setShowIntel] = useState(true);

  const handleRouteData = useCallback(({ allRoutes: routes, activeRouteIndex: idx }) => {
    setAllRoutes(routes || []);
    setActiveRouteIndex(idx ?? 0);
  }, []);

  const handleClearRoute = useCallback(() => {
    setSelectedSource(null);
    setSelectedDest(null);
    setAllRoutes([]);
    setActiveRouteIndex(0);
    setIsNavigating(false);
  }, []);

  const activeRoute = allRoutes[activeRouteIndex] || allRoutes[0];
  const intel = activeRoute?.intelligence;
  const hasCritical = intel?.waypointReports?.some(w => w.severity === 'CRITICAL');
  const globalSeverity = hasCritical
    ? 'CRITICAL'
    : intel?.waypointReports?.some(w => w.severity === 'CAUTION')
    ? 'CAUTION'
    : 'STABLE';

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">

      {/* ─── LEFT SIDEBAR ─────────────────────────────────────── */}
      <div className="w-[380px] h-full bg-white shadow-[2px_0_16px_rgba(0,0,0,0.07)] z-10 flex flex-col flex-shrink-0">

        {/* Search + Vehicle */}
        <div className="p-4 border-b border-slate-100">
          <ShipmentCreationFlow
            onLocationSelect={(src, dest) => { setSelectedSource(src); setSelectedDest(dest); }}
            onClearRoute={handleClearRoute}
            initialSource={selectedSource}
            initialDest={selectedDest}
          />

          {/* Vehicle mode pills */}
          <div className="flex gap-1 mt-3 bg-slate-50 p-1 rounded-xl">
            {VEHICLE_MODES.map(({ label, value, Icon }) => (
              <button
                key={value}
                onClick={() => setVehicleMode(value)}
                title={label}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[9px] font-bold transition-all ${
                  vehicleMode === value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results / empty */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {allRoutes.length > 0 ? (
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                {/* Origin / Destination strip */}
                <div className="px-4 py-3 border-b border-slate-50 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="flex flex-col items-center mt-1 gap-0.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100" />
                      <div className="w-px h-3 bg-slate-200" />
                      <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-100" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">
                        {selectedSource?.display_name?.split(',')[0] || 'Origin'}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400 truncate leading-tight mt-1">
                        {selectedDest?.display_name?.split(',')[0] || 'Destination'}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleClearRoute} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>

                {/* Route cards */}
                <div className="p-3 space-y-2">
                  {allRoutes.slice(0, 3).map((route, idx) => {
                    const isActive = idx === activeRouteIndex;
                    return (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setActiveRouteIndex(idx)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                          isActive
                            ? 'border-blue-400 bg-blue-50 shadow-sm'
                            : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                            {ROUTE_LABELS[idx] || `Route ${idx + 1}`}
                          </p>
                          <div className="flex items-baseline gap-2">
                            <span className={`text-xl font-black ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                              {(route.duration / 60).toFixed(0)}
                            </span>
                            <span className="text-xs text-slate-400 font-semibold">min</span>
                            <span className="text-slate-200">·</span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                              {(route.distance / 1000).toFixed(1)} km
                            </span>
                          </div>
                        </div>
                        {isActive && <CheckCircle size={16} className="text-blue-500 flex-shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Simulate controls */}
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl">
                    <button
                      onClick={() => setIsNavigating(v => !v)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isNavigating
                          ? 'bg-red-500 text-white shadow-md shadow-red-200'
                          : 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700'
                      }`}
                    >
                      {isNavigating
                        ? <Square size={12} fill="white" />
                        : <Play size={14} className="translate-x-0.5" fill="white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>{isNavigating ? 'Simulating…' : 'Simulate route'}</span>
                        <span className="text-blue-600">×{simSpeed}</span>
                      </div>
                      <input
                        type="range" min="1" max="10" step="1"
                        value={simSpeed}
                        onChange={e => setSimSpeed(Number(e.target.value))}
                        className="w-full h-1 rounded-full cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Route intelligence collapsible */}
                {intel?.waypointReports?.length > 0 && (
                  <div className="px-3 pb-5">
                    <button
                      onClick={() => setShowIntel(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CloudRain size={13} className="text-blue-500" />
                        <span className="text-xs font-bold text-slate-700">Route Intelligence</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          globalSeverity === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                          globalSeverity === 'CAUTION' ? 'bg-amber-100 text-amber-600' :
                          'bg-emerald-100 text-emerald-600'
                        }`}>{globalSeverity}</span>
                      </div>
                      {showIntel ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                    </button>

                    <AnimatePresence>
                      {showIntel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2.5 mt-2 px-1">
                            {intel.waypointReports.map((wp, i) => {
                              const WeatherIcon = getWeatherIcon(wp.weather);
                              const parts = (wp.weather || 'Clear • 25°C').split(' • ');
                              const colorCls =
                                wp.severity === 'CRITICAL' ? 'text-red-500 bg-red-50' :
                                wp.severity === 'CAUTION' ? 'text-amber-500 bg-amber-50' :
                                'text-blue-500 bg-blue-50';
                              return (
                                <div key={i} className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                                    <WeatherIcon size={14} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-slate-800 truncate">{wp.place}</p>
                                    <p className="text-[10px] text-slate-400">{parts.join(' · ')}</p>
                                  </div>
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    wp.severity === 'CRITICAL' ? 'bg-red-500' :
                                    wp.severity === 'CAUTION' ? 'bg-amber-500' : 'bg-green-500'
                                  }`} />
                                </div>
                              );
                            })}
                          </div>

                          {intel.newsFeed?.length > 0 && (
                            <div className="mt-4 space-y-2 px-1">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={11} className="text-red-500" />
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-wider">
                                  Risk Alerts ({intel.newsFeed.length})
                                </span>
                              </div>
                              {intel.newsFeed.slice(0, 3).map((news, i) => (
                                <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                                  <p className="text-[11px] font-semibold text-slate-700 leading-snug mb-2 line-clamp-2">{news.title}</p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                      {news.categories?.slice(0, 2).map((cat, ci) => (
                                        <span key={ci} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[8px] font-black uppercase">{cat}</span>
                                      ))}
                                    </div>
                                    {news.link && (
                                      <a href={news.link} target="_blank" rel="noreferrer"
                                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                        View <ExternalLink size={9} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full p-10 text-center"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-5"
                >
                  <Navigation size={28} className="text-blue-500" />
                </motion.div>
                <h3 className="text-sm font-bold text-slate-700 mb-2">Plan your route</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[180px]">
                  Search an origin and destination to get directions with real-time intelligence.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── MAP ───────────────────────────────────────────────── */}
      <div className="flex-1 h-full relative">
        <RouteMap
          selectedSource={selectedSource}
          selectedDestination={selectedDest}
          setSelectedSource={setSelectedSource}
          setSelectedDestination={setSelectedDest}
          vehicleMode={vehicleMode}
          onClearRoute={handleClearRoute}
          onRouteData={handleRouteData}
          activeRouteIndex={activeRouteIndex}
          onSetActiveRoute={setActiveRouteIndex}
          isNavigating={isNavigating}
          simSpeed={simSpeed}
        />
      </div>
    </div>
  );
};

export default Dashboard;
