import React, { useState, useCallback } from 'react';
import { RouteMap } from '../components/RouteMap';
import RoutyChatPanel, { saveRouteToHistory, loadRouteHistory } from '../components/RoutyChatPanel';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Plane, Train, Truck, Bot, X, ChevronDown } from 'lucide-react';

const FREIGHT_MODES = [
  { label: 'Sea',  value: 'ship',  Icon: Anchor },
  { label: 'Air',  value: 'air',   Icon: Plane  },
  { label: 'Rail', value: 'rail',  Icon: Train  },
  { label: 'Road', value: 'truck', Icon: Truck  },
];

const RoutesMapPage = () => {
  const [selectedSource, setSelectedSource]     = useState(null);
  const [selectedDest, setSelectedDest]         = useState(null);
  const [freightMode, setFreightMode]           = useState('ship');
  const [allRoutes, setAllRoutes]               = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [isNavigating, setIsNavigating]         = useState(false);
  const [simSpeed, setSimSpeed]                 = useState(2);
  const [showRouty, setShowRouty]               = useState(false);
  const [showControls, setShowControls]         = useState(true);

  const vehicleMode = FREIGHT_MODES.find(m => m.value === freightMode)?.vehicle || 'truck';

  const handleRouteData = useCallback(({ allRoutes: routes, activeRouteIndex: idx }) => {
    setAllRoutes(routes || []);
    setActiveRouteIndex(idx ?? 0);
    if (routes?.length > 0 && selectedSource && selectedDest) {
      saveRouteToHistory({
        state: {
          origin: selectedSource.display_name?.split(',')[0] || 'Origin',
          destination: selectedDest.display_name?.split(',')[0] || 'Destination',
          mode: freightMode === 'ship' ? 'sea' : freightMode,
        },
        source: selectedSource,
        destination: selectedDest,
        riskScore: routes[0]?.intelligence?.riskScore ?? null,
        severity: routes[0]?.intelligence?.severity ?? null,
      });
    }
  }, [selectedSource, selectedDest, freightMode]);

  const handleClearRoute = useCallback(() => {
    setSelectedSource(null);
    setSelectedDest(null);
    setAllRoutes([]);
    setActiveRouteIndex(0);
    setIsNavigating(false);
  }, []);

  const handleRoutyRoute = useCallback(({ source, destination, mode }) => {
    setSelectedSource(source);
    setSelectedDest(destination);
    const modeMap = { sea: 'ship', air: 'air', rail: 'rail', truck: 'truck', road: 'truck' };
    setFreightMode(modeMap[mode] || freightMode);
    setShowRouty(false);
  }, [freightMode]);

  return (
    <div className="dashboard-shell h-full w-full relative overflow-hidden text-white">

      {/* Floating control bar — top left */}
      <div className="absolute top-3 left-3 z-[1050] flex flex-col gap-2" style={{ maxWidth: 340 }}>

        {/* Mode selector + Routy button */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-2xl shadow-lg dashboard-surface-strong">
            {FREIGHT_MODES.map(({ label, value, Icon }) => (
              <button
                key={value}
                onClick={() => setFreightMode(value)}
                title={label}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                style={{
                  background: freightMode === value ? 'rgba(0,194,255,0.14)' : 'transparent',
                  color: freightMode === value ? '#E0F2FE' : '#94A3B8',
                }}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowRouty(true)}
            className="rg-btn-secondary flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold shadow-lg transition-all"
          >
            <Bot size={13} className="animate-pulse" />
            Ask Routy
          </button>

          <button
            onClick={() => setShowControls(v => !v)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-2xl text-[10px] font-bold shadow-lg transition-all dashboard-chip"
          >
            <ChevronDown size={12} style={{ transform: showControls ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {showControls ? 'Hide' : 'Route'}
          </button>
        </div>

        {/* Route input panel */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="rounded-[1.5rem] shadow-2xl p-3 dashboard-surface-strong"
            >
              <ShipmentCreationFlow
                freightMode={freightMode}
                onLocationSelect={(src, dest) => { setSelectedSource(src); setSelectedDest(dest); }}
                onClearRoute={handleClearRoute}
                initialSource={selectedSource}
                initialDest={selectedDest}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map */}
      <RouteMap
        selectedSource={selectedSource}
        selectedDestination={selectedDest}
        setSelectedSource={setSelectedSource}
        setSelectedDestination={setSelectedDest}
        vehicleMode={vehicleMode}
        freightMode={freightMode}
        onClearRoute={handleClearRoute}
        onRouteData={handleRouteData}
        activeRouteIndex={activeRouteIndex}
        onSetActiveRoute={setActiveRouteIndex}
        isNavigating={isNavigating}
        simSpeed={simSpeed}
      />

      {/* Routy chat panel */}
      <RoutyChatPanel
        isOpen={showRouty}
        onClose={() => setShowRouty(false)}
        onRouteGenerated={handleRoutyRoute}
        freightMode={freightMode}
        onRouteSaved={() => {}}
      />
    </div>
  );
};

export default RoutesMapPage;
