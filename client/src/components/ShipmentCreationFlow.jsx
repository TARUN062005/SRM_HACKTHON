import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, Check, X, ArrowUpDown } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const searchCache = new Map();
const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const LocationInput = ({
  label, dot, dotColor, query, setQuery, results, searching,
  type, selected, setSelected, activeDropdown, setActiveDropdown, onSelect, onClear
}) => {
  const inputRef = useRef(null);
  const isFocused = activeDropdown === type;

  return (
    <div className="relative">
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
        isFocused ? 'border-blue-400 bg-white shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
      }`}>
        {/* Dot indicator */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />

        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={label}
          onChange={e => {
            setQuery(e.target.value);
            if (selected) setSelected(null);
          }}
          onFocus={() => setActiveDropdown(type)}
          className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400 min-w-0"
        />

        {/* Right icon */}
        {searching ? (
          <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />
        ) : selected ? (
          <button onClick={onClear} className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        ) : query.length > 0 ? (
          <button onClick={onClear} className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {isFocused && results.length > 0 && !selected && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl overflow-hidden z-[2000]"
          >
            {results.map((loc, i) => (
              <button
                key={i}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onSelect(loc, type)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 transition-colors border-b border-slate-50 last:border-0"
              >
                <div className="mt-0.5 w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <MapPin size={13} className="text-blue-500" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {loc.display_name.split(',')[0]}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {loc.display_name.split(',').slice(1, 3).join(',')}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ShipmentCreationFlow = ({
  onLocationSelect,
  onClearRoute,
  initialSource = null,
  initialDest = null,
}) => {
  const [sourceQuery, setSourceQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [sourceResults, setSourceResults] = useState([]);
  const [destResults, setDestResults] = useState([]);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedDest, setSelectedDest] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Sync external state
  useEffect(() => {
    if (initialSource) { setSelectedSource(initialSource); setSourceQuery(initialSource.display_name?.split(',')[0] || ''); }
    else { setSelectedSource(null); setSourceQuery(''); }
  }, [initialSource]);

  useEffect(() => {
    if (initialDest) { setSelectedDest(initialDest); setDestQuery(initialDest.display_name?.split(',')[0] || ''); }
    else { setSelectedDest(null); setDestQuery(''); }
  }, [initialDest]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = () => setActiveDropdown(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Auto-trigger when both selected
  useEffect(() => {
    if (selectedSource && selectedDest) {
      onLocationSelect(selectedSource, selectedDest);
    }
  }, [selectedSource, selectedDest]);

  const fetchLocations = async (query, setResults, setSearching) => {
    const key = query.trim().toLowerCase();
    if (key.length < 2) { setResults([]); return; }
    if (searchCache.has(key)) { setResults(searchCache.get(key)); return; }
    setSearching(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/search`, { params: { q: query, limit: 6 }, timeout: 5000 });
      const data = res.data || [];
      if (data.length > 0) { searchCache.set(key, data); setResults(data); }
    } catch (e) {
      if (e.response?.status !== 429) setResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeDropdown === 'source' && !selectedSource) fetchLocations(sourceQuery, setSourceResults, setSearchingSource);
    }, 220);
    return () => clearTimeout(t);
  }, [sourceQuery, activeDropdown, selectedSource]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeDropdown === 'dest' && !selectedDest) fetchLocations(destQuery, setDestResults, setSearchingDest);
    }, 220);
    return () => clearTimeout(t);
  }, [destQuery, activeDropdown, selectedDest]);

  const handleSelect = (loc, type) => {
    if (type === 'source') {
      setSelectedSource(loc);
      setSourceQuery(loc.display_name?.split(',')[0] || loc.display_name);
      setSourceResults([]);
    } else {
      setSelectedDest(loc);
      setDestQuery(loc.display_name?.split(',')[0] || loc.display_name);
      setDestResults([]);
    }
    setActiveDropdown(null);
  };

  const handleSwap = () => {
    const tmpSrc = selectedSource;
    const tmpDest = selectedDest;
    const tmpSQ = sourceQuery;
    const tmpDQ = destQuery;
    setSelectedSource(tmpDest);
    setSelectedDest(tmpSrc);
    setSourceQuery(tmpDQ);
    setDestQuery(tmpSQ);
  };

  const clearSource = () => { setSelectedSource(null); setSourceQuery(''); setSourceResults([]); };
  const clearDest = () => { setSelectedDest(null); setDestQuery(''); setDestResults([]); };

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      {/* Origin */}
      <LocationInput
        label="Choose starting point"
        dotColor="bg-green-500"
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
        onClear={clearSource}
      />

      {/* Swap button between inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <button
          onClick={handleSwap}
          disabled={!selectedSource && !selectedDest}
          className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all disabled:opacity-30"
        >
          <ArrowUpDown size={12} />
        </button>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Destination */}
      <LocationInput
        label="Choose destination"
        dotColor="bg-red-500"
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
        onClear={clearDest}
      />
    </div>
  );
};
