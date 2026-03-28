import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { X, Car, Bike, Bus, Truck, Footprints, Shield, Navigation, Activity, Zap, Play, ArrowRight, Fingerprint, Globe, Cpu, MapPin, Calendar, Phone, Mail, Save, Trash2, Edit3, Bell, BellOff, Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const vehicleOptions = [
  { label: 'Car', value: 'car', icon: <Car size={18} /> },
  { label: 'Bike', value: 'bike', icon: <Bike size={18} /> },
  { label: 'Walk', value: 'foot', icon: <Footprints size={18} /> },
  { label: 'Bus', value: 'bus', icon: <Bus size={18} /> },
  { label: 'Truck', value: 'truck', icon: <Truck size={18} /> },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [vehicleMode, setVehicleMode] = useState('car');
  const [routeData, setRouteData] = useState(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);

  const handleClearRoute = () => {
    setSelectedSource(null);
    setSelectedDest(null);
    setRouteData(null);
  };

  const resetMapFlow = () => {
    setSelectedSource(null);
    setSelectedDest(null);
  };

  useEffect(() => {
    const fn = () => setShowSearchPanel(true);
    window.addEventListener('toggleNewRoute', fn);
    return () => window.removeEventListener('toggleNewRoute', fn);
  }, []);

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col">
      <AnimatePresence>
        {showSearchPanel && (
          <motion.div 
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            className="absolute top-24 left-6 lg:left-10 z-[1100] w-full max-w-[420px]"
          >
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] rounded-[2.5rem] overflow-hidden flex flex-col border border-white dark:border-slate-800">
              <div className="bg-primary-600 px-8 py-5 flex items-center justify-between text-white shadow-lg">
                <div className="flex items-center gap-3 font-black text-sm uppercase tracking-widest">
                  <Shield size={18} /> Plan Neural Route
                </div>
                <button onClick={() => setShowSearchPanel(false)} className="hover:bg-primary-700 p-2 rounded-xl transition-all active:scale-90">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8">
                <ShipmentCreationFlow
                  onLocationSelect={(src, dest) => {
                    setSelectedSource(src);
                    setSelectedDest(dest);
                    setShowSearchPanel(false);
                  }}
                  onClearRoute={handleClearRoute}
                  vehicleMode={vehicleMode}
                  setVehicleMode={setVehicleMode}
                  initialSource={selectedSource}
                  initialDest={selectedDest}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 relative">
        <div className="absolute inset-0 z-0">
          <RouteMap
            selectedSource={selectedSource}
            selectedDestination={selectedDest}
            setSelectedSource={setSelectedSource}
            setSelectedDestination={setSelectedDest}
            setShowSearchPanel={setShowSearchPanel}
            onManualReset={resetMapFlow}
            vehicleMode={vehicleMode}
            onClearRoute={handleClearRoute}
            mapTiles="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            mapAttribution="&copy; <a href='https://carto.com/attributions'>CARTO</a>"
            showWeatherInPanel={true}
            onRouteData={setRouteData}
            externalActiveRouteIndex={routeData?.activeRouteIndex}
            activeCheckpoint={activeCheckpoint}
          />
        </div>

        {/* Transportation Mode HUD */}
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1050] bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl px-3 py-3 rounded-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] border border-white dark:border-slate-800 flex items-center gap-2"
        >
          {vehicleOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setVehicleMode(opt.value)}
              className={`p-4 rounded-full flex items-center justify-center transition-all ${vehicleMode === opt.value ? 'bg-primary-600 text-white shadow-xl shadow-primary-600/40 scale-110 active:scale-95' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {opt.icon}
            </button>
          ))}
        </motion.div>

        {/* Tactical Intelligence SidePanel */}
        <AnimatePresence>
          {routeData && routeData.allRoutes && routeData.allRoutes.length > 0 && (
            <motion.div 
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="absolute right-6 top-6 bottom-6 w-[28vw] min-w-[360px] max-w-[480px] bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-white dark:border-slate-800 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] rounded-[3rem] flex flex-col p-8 z-[1050] overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <RouteMap.SidePanel
                  selectedSource={selectedSource}
                  selectedDestination={selectedDest}
                  vehicleMode={vehicleMode}
                  setActiveCheckpoint={setActiveCheckpoint}
                  activeCheckpoint={activeCheckpoint}
                  onClearRoute={handleClearRoute}
                  {...routeData}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
