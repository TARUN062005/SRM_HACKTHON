import React, { useState, useEffect } from 'react';
import { Search, MapPin, Loader2, Navigation, Check } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * INTERNAL COMPONENT: Specialized Location Input
 * Defined outside to prevent re-remounting/focus-loss on parent re-render.
 */
const LocationInput = ({ label, query, setQuery, results, searching, type, selected, setSelected, activeDropdown, setActiveDropdown, onSelect }) => (
  <div className="relative w-full">
    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block font-sans">
      {label}
    </label>
    <div className={`relative flex items-center bg-slate-50 dark:bg-slate-950 border-2 transition-all rounded-2xl px-4 py-3.5 ${activeDropdown === type ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-slate-100 dark:border-slate-800'}`}>
      <div className="mr-3 text-slate-400 shrink-0">
        {searching ? <Loader2 size={18} className="animate-spin text-primary-500" /> : <Search size={18} />}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selected) setSelected(null);
        }}
        onFocus={() => setActiveDropdown(type)}
        placeholder={`Enter ${label.toLowerCase()}...`}
        className="w-full bg-transparent outline-none text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 font-sans"
      />
      {selected && (
        <div className="ml-2 text-primary-500 animate-in zoom-in-50 duration-200">
          <Check size={18} strokeWidth={3} />
        </div>
      )}
    </div>

    <AnimatePresence>
      {activeDropdown === type && results.length > 0 && !selected && (
        <motion.div 
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] rounded-2xl overflow-hidden z-[2000] p-1.5"
        >
          {results.map((loc, i) => (
            <button
              key={i}
              onClick={() => onSelect(loc, type)}
              className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl flex items-start gap-3 transition-colors group"
            >
              <div className="mt-1 p-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 rounded-md group-hover:scale-110 transition-transform">
                <MapPin size={12} strokeWidth={3} />
              </div>
              <div className="flex-1 min-w-0">
                 <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-black text-slate-900 dark:text-slate-100 truncate leading-tight font-sans">
                      {loc.display_name.split(',')[0]}
                    </div>
                    <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[8px] font-black uppercase tracking-tighter shrink-0">
                      {loc.address?.state || loc.display_name.split(',').slice(-3, -2)[0]?.trim() || 'POI'}
                    </div>
                 </div>
                 <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 truncate mt-1 font-sans">
                   {loc.display_name.split(',').slice(1).join(',')}
                 </div>
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const searchCache = new Map();
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const ShipmentCreationFlow = ({ onLocationSelect, onClearRoute, vehicleMode, setVehicleMode }) => {
  const [sourceQuery, setSourceQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [sourceResults, setSourceResults] = useState([]);
  const [destResults, setDestResults] = useState([]);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Optimized Search Logic with Intelligent Backend Proxy
  const fetchLocations = async (query, setResults, setSearching) => {
    if (!query || query.trim().length < 3) {
      setResults([]);
      return;
    }

    const trimmedQuery = query.trim().toLowerCase();
    if (searchCache.has(trimmedQuery)) {
      setResults(searchCache.get(trimmedQuery));
      return;
    }

    setSearching(true);
    try {
      // PROXIED Search: Call backend to bypass CORS and centralize geocoding
      const res = await axios.get(`${BASE_URL}/api/ai/search`, {
        params: { q: query, limit: 6 },
        timeout: 8000
      });
      searchCache.set(trimmedQuery, res.data || []);
      setResults(res.data || []);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  };

  // Debounced Search Effects
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeDropdown === 'source' && !selectedSource) {
        fetchLocations(sourceQuery, setSourceResults, setSearchingSource);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sourceQuery, activeDropdown, selectedSource]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeDropdown === 'dest' && !selectedDest) {
        fetchLocations(destQuery, setDestResults, setSearchingDest);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destQuery, activeDropdown, selectedDest]);

  const handleSelect = (loc, type) => {
    if (type === 'source') {
      setSelectedSource(loc);
      setSourceQuery(loc.display_name);
      setSourceResults([]);
    } else {
      setSelectedDest(loc);
      setDestQuery(loc.display_name);
      setDestResults([]);
    }
    setActiveDropdown(null);
  };

  const confirmSelection = () => {
    if (selectedSource && selectedDest) {
      onLocationSelect(selectedSource, selectedDest);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="space-y-6">
        <LocationInput 
          label="Origin Point" 
          query={sourceQuery} 
          setQuery={setSourceQuery} 
          results={sourceResults} 
          searching={searchingSource}
          type="source"
          selected={selectedSource}
          setSelected={setSelectedSource}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          onSelect={handleSelect}
        />

        <div className="relative h-0 flex items-center justify-center">
           <div className="absolute w-8 h-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 z-10 shadow-sm">
              <Navigation size={14} />
           </div>
           <div className="w-full h-px bg-slate-100 dark:bg-slate-800" />
        </div>

        <LocationInput 
          label="Destination Point" 
          query={destQuery} 
          setQuery={setDestQuery} 
          results={destResults} 
          searching={searchingDest}
          type="dest"
          selected={selectedDest}
          setSelected={setSelectedDest}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          onSelect={handleSelect}
        />
      </div>

      <button
        onClick={confirmSelection}
        disabled={!selectedSource || !selectedDest}
        className={`w-full py-4 rounded-[1.5rem] font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-2xl ${
          selectedSource && selectedDest 
          ? 'bg-primary-600 text-white shadow-primary-600/20 hover:scale-[1.02] active:scale-95' 
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
        }`}
      >
        <Navigation size={18} />
        Initiate Mission
      </button>
    </div>
  );
};
