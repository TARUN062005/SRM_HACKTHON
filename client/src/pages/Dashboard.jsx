import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { ShipmentCreationFlow } from '../components/ShipmentCreationFlow';
import { RouteMap } from '../components/RouteMap';
import { Navigation, Menu, X } from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [showSearchPanel, setShowSearchPanel] = useState(true);

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
    <div className="h-[calc(100vh-80px)] w-full flex flex-col bg-transparent overflow-hidden relative">
      
      {/* Floating Panel (Google Maps Style) */}
      <div 
        className={`absolute top-4 left-4 z-[1000] transition-all duration-300 ${
          showSearchPanel ? 'translate-x-0' : '-translate-x-[150%]'
        }`}
      >
        <div className="bg-white shadow-2xl rounded-2xl w-96 max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col">
          {/* Header of floating panel */}
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
                // setShowSearchPanel(false); // optionally hide after selecting
              }}
            />
          </div>
        </div>
      </div>

      {/* Map Area Filling the Entire Screen */}
      <div className="flex-1 w-full h-full relative z-0">
          <RouteMap 
            selectedSource={selectedSource} 
            selectedDestination={selectedDest}
            onManualReset={resetMapFlow}
          />
      </div>

    </div>
  );
};

export default Dashboard;
