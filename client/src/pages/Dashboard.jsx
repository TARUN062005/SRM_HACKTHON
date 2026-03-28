import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { X, Car, Bike, Bus, Truck, Footprints } from 'lucide-react';

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
  const [weather, setWeather] = useState({ temp: 24, condition: 'Clear', risk: 'Low', icon: 'https://openweathermap.org/img/wn/01d.png' });
  const [vehicleMode, setVehicleMode] = useState('car');

  const [routeData, setRouteData] = useState(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);

  // Clear/close route handler
  const handleClearRoute = () => {
    setSelectedSource(null);
    setSelectedDest(null);
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

  // Only show float when user calls it (e.g. via button)
  const handleOpenFloat = () => setShowSearchPanel(true);

  return (
    <div className="dashboard-root h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">

      {/* Floating Search Panel (only when user opens) */}
      {showSearchPanel && (
        <div className="absolute top-24 left-6 lg:left-10 z-[1100] shadow-2xl" style={{ maxWidth: 400 }}>
          <div className="bg-white shadow-2xl rounded-2xl w-96 max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-bold">
                Plan AI Route
              </div>
              <button onClick={() => setShowSearchPanel(false)} className="hover:bg-blue-700 p-1 rounded transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <ShipmentCreationFlow
                onLocationSelect={(src, dest) => {
                  setSelectedSource(src);
                  setSelectedDest(dest);
                  setShowSearchPanel(false);
                }}
                onClearRoute={handleClearRoute}
                vehicleMode={vehicleMode}
                setVehicleMode={setVehicleMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Map + Side Panel */}
      <div className="w-full flex-1 relative h-[calc(100vh-0px)]">
        {/* Map Area (Primary) */}
        <div className="w-full h-full relative">

          {/* Main Map Component */}
          <RouteMap
            selectedSource={selectedSource}
            selectedDestination={selectedDest}
            onManualReset={resetMapFlow}
            setWeather={setWeather}
            vehicleMode={vehicleMode}
            onClearRoute={handleClearRoute}
            mapTiles="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            mapAttribution="&copy; <a href='https://carto.com/attributions'>CARTO</a>"
            showWeatherInPanel={true}
            onRouteData={setRouteData}
            externalActiveRouteIndex={routeData?.activeRouteIndex}
            activeCheckpoint={activeCheckpoint}
          />

          {/* Floating Transportation Modes (Bottom Center) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1050] bg-white/90 backdrop-blur-md px-2 py-2 rounded-full shadow-2xl border border-slate-200 flex items-center gap-1">
            {vehicleOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setVehicleMode(opt.value)}
                title={`Route via ${opt.label}`}
                className={`p-3 rounded-full flex items-center justify-center transition-all ${vehicleMode === opt.value ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 scale-105' : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'}`}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>
        {/* Side Panel (Route Details, Weather, Risk) */}
        {routeData && routeData.allRoutes && routeData.allRoutes.length > 0 && (
          <div className="absolute right-4 top-24 bottom-6 w-[25vw] min-w-[320px] max-w-[420px] bg-slate-50 border border-slate-200 shadow-2xl rounded-2xl flex flex-col p-5 gap-4 overflow-y-auto z-[1050]">
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
        )}
      </div>
    </div>
  );
};

export default Dashboard;
