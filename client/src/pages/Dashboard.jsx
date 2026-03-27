import React, { useState } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { X } from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [weather, setWeather] = useState({ temp: 24, condition: 'Clear', risk: 'Low', icon: 'https://openweathermap.org/img/wn/01d.png' });
  const [vehicleMode, setVehicleMode] = useState('car');

  // Clear/close route handler
  const handleClearRoute = () => {
    setSelectedSource(null);
    setSelectedDest(null);
    setShowSearchPanel(true);
  };
  const resetMapFlow = () => {
     setSelectedSource(null);
     setSelectedDest(null);
  };


  // Only show float when user calls it (e.g. via button)
  const handleOpenFloat = () => setShowSearchPanel(true);

  return (
    <div className="dashboard-root h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">

      {/* Button to open float panel */}
      {!showSearchPanel && (
        <button
          className="absolute top-6 left-6 z-[1100] bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl shadow-xl border border-blue-700 transition"
          onClick={handleOpenFloat}
        >
          Plan AI Route
        </button>
      )}

      {/* Floating Search Panel (only when user opens) */}
      {showSearchPanel && (
        <div className="absolute top-6 left-6 z-[1100] shadow-2xl" style={{ maxWidth: 400 }}>
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
      <div className="flex flex-1 min-h-0 min-w-0 relative" style={{ height: 'calc(100vh - 0px)' }}>
        {/* Map Area (Primary) */}
        <div className="flex-1 min-w-0 min-h-0 relative" style={{ width: '75vw', height: '100%' }}>
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
          />
        </div>
        {/* Side Panel (Route Details, Weather, Risk) */}
        <div className="w-[25vw] min-w-[320px] max-w-[420px] h-full bg-white/90 border-l border-slate-200 shadow-xl flex flex-col p-6 gap-4 overflow-y-auto z-[1050]">
          <RouteMap.SidePanel
            selectedSource={selectedSource}
            selectedDestination={selectedDest}
            vehicleMode={vehicleMode}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
