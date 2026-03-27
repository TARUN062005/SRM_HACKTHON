import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, MapPin, Loader2, Navigation } from 'lucide-react';

export const ShipmentCreationFlow = ({ onLocationSelect }) => {
  const [sourceQuery, setSourceQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [sourceResults, setSourceResults] = useState([]);
  const [destResults, setDestResults] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [activeInput, setActiveInput] = useState(null);

  const searchLocation = async (query, setResults, setSearching) => {
    if (!query || query.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      setResults(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeInput === 'source') searchLocation(sourceQuery, setSourceResults, setSearchingSource);
    }, 500);
    return () => clearTimeout(timer);
  }, [sourceQuery, activeInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeInput === 'dest') searchLocation(destQuery, setDestResults, setSearchingDest);
    }, 500);
    return () => clearTimeout(timer);
  }, [destQuery, activeInput]);
  
  const confirmSelection = () => {
    if (selectedSource && selectedDest && onLocationSelect) {
      onLocationSelect(selectedSource, selectedDest);
    }
  };

  const ResultDropdown = ({ results, onSelect, visible }) => {
    if (!visible || results.length === 0) return null;
    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg z-50 max-h-48 overflow-y-auto">
        {results.map((loc, idx) => (
          <div 
            key={idx} 
            className="p-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 cursor-pointer flex items-start gap-2 text-sm"
            onMouseDown={() => onSelect(loc)}
          >
            <MapPin size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <span className="text-slate-700 leading-tight truncate block">{loc.display_name}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      
      {/* Search Start Point */}
      <div className="relative">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
          Origin Point
        </label>
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
             {searchingSource ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </div>
          <input 
            type="text" 
            placeholder="Choose starting point..." 
            value={sourceQuery}
            onChange={(e) => {
              setSourceQuery(e.target.value);
              setSelectedSource(null);
            }}
            onFocus={() => setActiveInput('source')}
            onBlur={() => setTimeout(() => setActiveInput(null), 200)}
            className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium transition-all"
          />
        </div>
        <ResultDropdown 
          results={sourceResults} 
          visible={activeInput === 'source' && !selectedSource}
          onSelect={(loc) => {
             setSelectedSource(loc);
             setSourceQuery(loc.display_name.split(',')[0]);
             setActiveInput(null);
          }} 
        />
      </div>

      {/* Search Destination Point */}
      <div className="relative">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
          Destination Point
        </label>
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
             {searchingDest ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </div>
          <input 
            type="text" 
            placeholder="Choose destination..." 
            value={destQuery}
            onChange={(e) => {
              setDestQuery(e.target.value);
              setSelectedDest(null);
            }}
            onFocus={() => setActiveInput('dest')}
            onBlur={() => setTimeout(() => setActiveInput(null), 200)}
            className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium transition-all"
          />
        </div>
        <ResultDropdown 
          results={destResults} 
          visible={activeInput === 'dest' && !selectedDest}
          onSelect={(loc) => {
             setSelectedDest(loc);
             setDestQuery(loc.display_name.split(',')[0]); 
             setActiveInput(null);
          }} 
        />
      </div>

      {/* Action Button */}
      <button 
        onClick={confirmSelection}
        disabled={!selectedSource || !selectedDest}
        className="mt-2 w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 flex justify-center items-center gap-2 transition-all"
      >
        <Navigation size={16} />
        Calculate Route
      </button>
    </div>
  );
};
