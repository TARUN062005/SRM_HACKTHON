import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { Navigation, X } from 'lucide-react';

// WeatherOverlay: floating weather panel for the map
const WeatherOverlay = ({ weather }) => (
  <div className="absolute top-4 right-4 z-[1100] bg-white/90 backdrop-blur-md border border-slate-200 p-4 shadow-xl rounded-xl w-64 flex flex-col gap-2">
    <div className="flex items-center gap-2 mb-2">
      <img src={weather.icon} alt={weather.condition} className="w-8 h-8" />
      <div>
        <div className="font-bold text-slate-700 text-lg">{weather.temp}&deg;C</div>
        <div className="text-xs text-slate-500 font-semibold uppercase">{weather.condition}</div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-slate-500">Risk:</span>
      <span className={`text-xs font-bold rounded px-2 py-1 ${weather.risk === 'High' ? 'bg-red-100 text-red-600' : weather.risk === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{weather.risk}</span>
    </div>
    <div className="text-xs text-slate-400 mt-2">Live weather overlay powered by AI</div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [showSearchPanel, setShowSearchPanel] = useState(true);
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

  useEffect(() => {
    const handleToggle = () => setShowSearchPanel(prev => !prev);
    window.addEventListener('toggleNewRoute', handleToggle);
    return () => window.removeEventListener('toggleNewRoute', handleToggle);
  }, []);

  return (
    <div className="dashboard-root h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Floating Search Panel */}
      <div
        className={`absolute top-6 left-6 z-[1100] transition-all duration-300 ${showSearchPanel ? 'translate-x-0' : '-translate-x-2/3'} shadow-2xl`}
        style={{ maxWidth: 400 }}
      >
        <div className="bg-white shadow-2xl rounded-2xl w-96 max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col border border-slate-200">
          <div className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2 font-bold">
              <Navigation size={18} /> Plan AI Route
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
          />
          {/* Weather Overlay (floating) */}
          <WeatherOverlay weather={weather} />
        </div>
        {/* Side Panel (Route Details, Suggestions) */}
        <div className="w-[25vw] min-w-[320px] max-w-[420px] h-full bg-white/90 border-l border-slate-200 shadow-xl flex flex-col p-6 gap-4 overflow-y-auto z-[1050]">
          <div className="font-bold text-lg text-slate-800 mb-2">Route Details</div>
          {/* TODO: Add route details, risk score, suggestions here (can be filled by RouteMap via props or context) */}
          <div className="text-slate-500 text-sm">Select a route to see details, risk, and suggestions.</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
