import React, { useState, useEffect } from 'react';
import { MapPin, Loader2, X, ArrowUpDown } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const searchCache = new Map();
const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const LABELS = {
  ship:  { from: 'Port of origin',     to: 'Destination port'     },
  air:   { from: 'Departure airport',  to: 'Arrival airport'      },
  rail:  { from: 'Origin terminal',    to: 'Destination terminal' },
  truck: { from: 'Pickup location',    to: 'Delivery location'    },
};

const LocationInput = ({
  placeholder, dotColor, query, setQuery,
  results, searching, type, selected, setSelected,
  activeDropdown, setActiveDropdown, onSelect, onClear,
}) => {
  const isFocused = activeDropdown === type;

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: isFocused ? 'var(--card)' : 'var(--bg)',
          border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: isFocused ? '0 0 0 2px var(--accent-glow)' : 'none',
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); if (selected) setSelected(null); }}
          onFocus={() => setActiveDropdown(type)}
          className="rg-input flex-1 text-sm font-medium min-w-0"
        />
        {searching
          ? <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
          : query.length > 0 && (
            <button
              onClick={onClear}
              className="flex-shrink-0 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={13} />
            </button>
          )
        }
      </div>

      <AnimatePresence>
        {isFocused && results.length > 0 && !selected && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            className="absolute top-[calc(100%+5px)] left-0 right-0 rounded-2xl overflow-hidden z-[2000]"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            }}
          >
            {results.map((loc, i) => (
              <button
                key={i}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onSelect(loc, type)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div
                  className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-glow)' }}
                >
                  <MapPin size={12} style={{ color: 'var(--accent)' }} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {loc.display_name.split(',')[0]}
                  </p>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
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
  freightMode = 'ship',
  onLocationSelect,
  onClearRoute,
  initialSource = null,
  initialDest   = null,
}) => {
  const labels = LABELS[freightMode] || LABELS.truck;

  const [sourceQuery,     setSourceQuery]     = useState('');
  const [destQuery,       setDestQuery]       = useState('');
  const [sourceResults,   setSourceResults]   = useState([]);
  const [destResults,     setDestResults]     = useState([]);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest,   setSearchingDest]   = useState(false);
  const [selectedSource,  setSelectedSource]  = useState(null);
  const [selectedDest,    setSelectedDest]    = useState(null);
  const [activeDropdown,  setActiveDropdown]  = useState(null);

  useEffect(() => {
    if (initialSource) { setSelectedSource(initialSource); setSourceQuery(initialSource.display_name?.split(',')[0] || ''); }
    else { setSelectedSource(null); setSourceQuery(''); }
  }, [initialSource]);

  useEffect(() => {
    if (initialDest) { setSelectedDest(initialDest); setDestQuery(initialDest.display_name?.split(',')[0] || ''); }
    else { setSelectedDest(null); setDestQuery(''); }
  }, [initialDest]);

  useEffect(() => {
    const h = () => setActiveDropdown(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  useEffect(() => {
    if (selectedSource && selectedDest) onLocationSelect(selectedSource, selectedDest);
  }, [selectedSource, selectedDest]);

  const fetchLocations = async (query, setResults, setSearching) => {
    const key = query.trim().toLowerCase();
    if (key.length < 2) { setResults([]); return; }
    if (searchCache.has(key)) { setResults(searchCache.get(key)); return; }
    setSearching(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/search`, { params: { q: query, limit: 6 }, timeout: 6000 });
      const data = res.data || [];
      if (data.length > 0) { searchCache.set(key, data); setResults(data); }
    } catch {
      setResults([]);
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
    const short = loc.display_name?.split(',')[0] || loc.display_name;
    if (type === 'source') { setSelectedSource(loc); setSourceQuery(short); setSourceResults([]); }
    else                   { setSelectedDest(loc);   setDestQuery(short);   setDestResults([]);   }
    setActiveDropdown(null);
  };

  const handleSwap = () => {
    const [ss, sd, sq, dq] = [selectedSource, selectedDest, sourceQuery, destQuery];
    setSelectedSource(sd); setSelectedDest(ss);
    setSourceQuery(dq);    setDestQuery(sq);
  };

  return (
    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
      <LocationInput
        placeholder={labels.from}
        dotColor="#22C55E"
        query={sourceQuery} setQuery={setSourceQuery}
        results={sourceResults} searching={searchingSource}
        type="source"
        selected={selectedSource} setSelected={setSelectedSource}
        activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown}
        onSelect={handleSelect}
        onClear={() => { setSelectedSource(null); setSourceQuery(''); setSourceResults([]); }}
      />

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <button
          onClick={handleSwap}
          disabled={!selectedSource && !selectedDest}
          className="w-6 h-6 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          title="Swap origin and destination"
        >
          <ArrowUpDown size={11} />
        </button>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>

      <LocationInput
        placeholder={labels.to}
        dotColor="#EF4444"
        query={destQuery} setQuery={setDestQuery}
        results={destResults} searching={searchingDest}
        type="dest"
        selected={selectedDest} setSelected={setSelectedDest}
        activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown}
        onSelect={handleSelect}
        onClear={() => { setSelectedDest(null); setDestQuery(''); setDestResults([]); }}
      />
    </div>
  );
};
