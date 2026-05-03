import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X, ArrowUpDown, Anchor, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const searchCache  = new Map();
const BASE_URL     = import.meta.env.VITE_BACKEND_URL || '';

const LABELS = {
  ship:  { from: 'Port of origin',      to: 'Destination port'     },
  air:   { from: 'Departure airport',   to: 'Arrival airport'      },
  rail:  { from: 'Origin terminal',     to: 'Destination terminal' },
  truck: { from: 'Pickup location',     to: 'Delivery location'    },
};

// ── Geocode search dropdown ────────────────────────────────────────────────────
const LocationInput = ({
  placeholder, dotColor, query, setQuery,
  results, searching, type, selected,
  activeDropdown, setActiveDropdown, onSelect, onClear,
  disabled = false,
}) => {
  const isFocused = activeDropdown === type;

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background:  isFocused ? 'var(--card)' : disabled ? 'rgba(17,24,39,0.5)' : 'var(--bg)',
          border:      `1px solid ${isFocused ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow:   isFocused ? '0 0 0 2px var(--accent-glow)' : 'none',
          opacity:     disabled ? 0.6 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); }}
          onFocus={() => !disabled && setActiveDropdown(type)}
          className="rg-input flex-1 text-sm font-medium min-w-0"
          disabled={disabled}
        />
        {searching
          ? <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
          : query.length > 0 && !disabled && (
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
            style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
          >
            {results.map((loc, i) => (
              <button
                key={i}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onSelect(loc, type)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                style={{ borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
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

// ── Port picker card (shown when inland city selected in sea mode) ─────────────
const PortPickerCard = ({ locationName, ports, onPick, onDismiss, resolving }) => (
  <motion.div
    initial={{ opacity: 0, y: -4, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -4, scale: 0.98 }}
    transition={{ duration: 0.18 }}
    className="rounded-xl overflow-hidden"
    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)' }}
  >
    {/* Header */}
    <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
      <AlertTriangle size={11} style={{ color: '#F59E0B', flexShrink: 0 }} />
      <p className="text-[10px] font-black uppercase tracking-wider flex-1" style={{ color: '#F59E0B' }}>
        Select a seaport near {locationName}
      </p>
      {!resolving && (
        <button onClick={onDismiss} style={{ color: 'var(--text-muted)' }}>
          <X size={11} />
        </button>
      )}
    </div>

    {/* Port list */}
    {resolving ? (
      <div className="flex items-center gap-2 px-3 py-3">
        <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Finding nearest ports…</span>
      </div>
    ) : (
      <div className="p-1.5 flex flex-col gap-1">
        {ports.map((p, i) => (
          <button
            key={i}
            onClick={() => onPick(p)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all group"
            style={{ background: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: i === 0 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Anchor size={11} style={{ color: i === 0 ? '#3B82F6' : 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                {p.name} Port
                {i === 0 && (
                  <span className="ml-1.5 text-[8px] font-black uppercase tracking-wide px-1 py-0.5 rounded"
                    style={{ background: 'rgba(59,130,246,0.2)', color: '#3B82F6' }}>
                    Nearest
                  </span>
                )}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {p.country} · {p.distKm} km away
              </p>
            </div>
            <ChevronRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              style={{ color: 'var(--accent)' }} />
          </button>
        ))}
      </div>
    )}
  </motion.div>
);

// ── Confirmed port chip ────────────────────────────────────────────────────────
const PortConfirmedChip = ({ portName, originalName, onClear }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
    style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}
  >
    <CheckCircle2 size={10} style={{ color: '#22C55E', flexShrink: 0 }} />
    <div className="flex-1 min-w-0">
      <span className="text-[10px] font-black" style={{ color: '#22C55E' }}>
        {portName}
      </span>
      {originalName && originalName !== portName && (
        <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>
          (nearest to {originalName})
        </span>
      )}
    </div>
    <button onClick={onClear} style={{ color: 'var(--text-muted)' }}
      onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
    >
      <X size={10} />
    </button>
  </motion.div>
);

// ── Main component ─────────────────────────────────────────────────────────────
export const ShipmentCreationFlow = ({
  freightMode = 'ship',
  onLocationSelect,
  onClearRoute,
  initialSource = null,
  initialDest   = null,
}) => {
  const labels = LABELS[freightMode] || LABELS.truck;
  const isSeaMode = freightMode === 'ship';

  const [sourceQuery,     setSourceQuery]     = useState('');
  const [destQuery,       setDestQuery]       = useState('');
  const [sourceResults,   setSourceResults]   = useState([]);
  const [destResults,     setDestResults]     = useState([]);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest,   setSearchingDest]   = useState(false);
  const [selectedSource,  setSelectedSource]  = useState(null);
  const [selectedDest,    setSelectedDest]    = useState(null);
  const [activeDropdown,  setActiveDropdown]  = useState(null);

  // Port picker state — per input slot
  const [srcPortState, setSrcPortState] = useState(null);  // null | { status:'picking'|'confirmed', ports:[], originalName, chosenPort }
  const [dstPortState, setDstPortState] = useState(null);

  // ── Sync from parent ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initialSource) { setSelectedSource(initialSource); setSourceQuery(initialSource.display_name?.split(',')[0] || ''); }
    else { setSelectedSource(null); setSourceQuery(''); setSrcPortState(null); }
  }, [initialSource]);

  useEffect(() => {
    if (initialDest) { setSelectedDest(initialDest); setDestQuery(initialDest.display_name?.split(',')[0] || ''); }
    else { setSelectedDest(null); setDestQuery(''); setDstPortState(null); }
  }, [initialDest]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = () => setActiveDropdown(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  // Fire route when both sides are confirmed
  useEffect(() => {
    const srcReady = isSeaMode
      ? (srcPortState?.status === 'confirmed' && srcPortState.chosenPort)
      : selectedSource;
    const dstReady = isSeaMode
      ? (dstPortState?.status === 'confirmed' && dstPortState.chosenPort)
      : selectedDest;

    if (srcReady && dstReady) {
      const src = isSeaMode ? srcPortState.chosenPort : selectedSource;
      const dst = isSeaMode ? dstPortState.chosenPort : selectedDest;
      onLocationSelect(src, dst);
    }
  }, [selectedSource, selectedDest, srcPortState, dstPortState, isSeaMode]);

  // ── Location fetch ────────────────────────────────────────────────────────
  const fetchLocations = async (query, setResults, setSearching) => {
    const key = query.trim().toLowerCase();
    if (key.length < 2) { setResults([]); return; }
    if (searchCache.has(key)) { setResults(searchCache.get(key)); return; }
    setSearching(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/ai/search`, { params: { q: query, limit: 6 }, timeout: 6000 });
      const data = res.data || [];
      if (data.length > 0) { searchCache.set(key, data); setResults(data); }
    } catch { setResults([]); } finally { setSearching(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeDropdown === 'source' && !selectedSource && !(srcPortState?.status === 'picking'))
        fetchLocations(sourceQuery, setSourceResults, setSearchingSource);
    }, 220);
    return () => clearTimeout(t);
  }, [sourceQuery, activeDropdown, selectedSource, srcPortState]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (activeDropdown === 'dest' && !selectedDest && !(dstPortState?.status === 'picking'))
        fetchLocations(destQuery, setDestResults, setSearchingDest);
    }, 220);
    return () => clearTimeout(t);
  }, [destQuery, activeDropdown, selectedDest, dstPortState]);

  // ── Port resolution ───────────────────────────────────────────────────────
  const resolvePort = async (loc, slot) => {
    const setPortState = slot === 'source' ? setSrcPortState : setDstPortState;
    const originalName = loc.display_name?.split(',')[0] || loc.display_name;

    // Start resolving — show spinner in picker
    setPortState({ status: 'picking', ports: [], originalName, resolving: true });

    try {
      const res = await axios.get(`${BASE_URL}/api/ai/resolve-port`, {
        params: { lat: loc.lat, lon: loc.lon },
        timeout: 5000,
      });
      const { isPort, nearestPorts } = res.data;

      if (isPort && nearestPorts?.length > 0) {
        // Location is already near a major port — auto-confirm nearest
        const port = nearestPorts[0];
        const portLoc = {
          lat: port.lat, lon: port.lon,
          display_name: `${port.name} Port, ${port.country}`,
        };
        setPortState({ status: 'confirmed', ports: nearestPorts, originalName, chosenPort: portLoc, isAutoConfirmed: true });
      } else {
        // Inland — show picker
        setPortState({ status: 'picking', ports: nearestPorts || [], originalName, resolving: false });
      }
    } catch {
      // On error fall back to showing picker with empty list
      setPortState({ status: 'picking', ports: [], originalName, resolving: false });
    }
  };

  // ── Select handler ────────────────────────────────────────────────────────
  const handleSelect = (loc, type) => {
    const short = loc.display_name?.split(',')[0] || loc.display_name;
    setActiveDropdown(null);

    if (type === 'source') {
      setSourceResults([]);
      setSourceQuery(short);
      if (isSeaMode) {
        setSelectedSource(loc);
        resolvePort(loc, 'source');
      } else {
        setSelectedSource(loc);
        setSrcPortState(null);
      }
    } else {
      setDestResults([]);
      setDestQuery(short);
      if (isSeaMode) {
        setSelectedDest(loc);
        resolvePort(loc, 'dest');
      } else {
        setSelectedDest(loc);
        setDstPortState(null);
      }
    }
  };

  const pickPort = (slot, port) => {
    const setPortState = slot === 'source' ? setSrcPortState : setDstPortState;
    const portLoc = {
      lat: port.lat, lon: port.lon,
      display_name: `${port.name} Port, ${port.country}`,
    };
    setPortState(prev => ({ ...prev, status: 'confirmed', chosenPort: portLoc }));
  };

  const clearSlot = (slot) => {
    if (slot === 'source') {
      setSelectedSource(null); setSourceQuery(''); setSourceResults([]); setSrcPortState(null);
    } else {
      setSelectedDest(null); setDestQuery(''); setDestResults([]); setDstPortState(null);
    }
    onClearRoute?.();
  };

  const handleSwap = () => {
    const [ss, sd, sq, dq, sp, dp] = [selectedSource, selectedDest, sourceQuery, destQuery, srcPortState, dstPortState];
    setSelectedSource(sd); setSelectedDest(ss);
    setSourceQuery(dq);    setDestQuery(sq);
    setSrcPortState(dp);   setDstPortState(sp);
  };

  // ── Rendering helpers ─────────────────────────────────────────────────────
  const renderSlot = (slot) => {
    const isSource    = slot === 'source';
    const query       = isSource ? sourceQuery       : destQuery;
    const setQuery    = isSource ? setSourceQuery    : setDestQuery;
    const results     = isSource ? sourceResults     : destResults;
    const searching   = isSource ? searchingSource   : searchingDest;
    const selected    = isSource ? selectedSource    : selectedDest;
    const portState   = isSource ? srcPortState      : dstPortState;
    const dotColor    = isSource ? '#22C55E'         : '#EF4444';
    const label       = isSource ? labels.from       : labels.to;

    const isPicking    = isSeaMode && portState?.status === 'picking';
    const isConfirmed  = isSeaMode && portState?.status === 'confirmed';

    return (
      <div className="flex flex-col gap-1.5">
        {/* Text input (hidden when confirmed in sea mode) */}
        {!isConfirmed && (
          <LocationInput
            placeholder={label}
            dotColor={dotColor}
            query={query}
            setQuery={text => {
              setQuery(text);
              // If user edits after selecting, clear selection
              if (selected) {
                if (isSource) { setSelectedSource(null); setSrcPortState(null); }
                else          { setSelectedDest(null);   setDstPortState(null); }
              }
            }}
            results={results}
            searching={searching}
            type={slot}
            selected={selected}
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            onSelect={handleSelect}
            onClear={() => clearSlot(slot)}
            disabled={isPicking && portState?.resolving}
          />
        )}

        {/* Port picker card */}
        <AnimatePresence>
          {isSeaMode && isPicking && (
            <PortPickerCard
              locationName={portState.originalName}
              ports={portState.ports}
              resolving={portState.resolving}
              onPick={p => pickPort(slot, p)}
              onDismiss={() => clearSlot(slot)}
            />
          )}
        </AnimatePresence>

        {/* Confirmed port chip */}
        <AnimatePresence>
          {isSeaMode && isConfirmed && (
            <PortConfirmedChip
              portName={portState.chosenPort?.display_name?.replace(/, .*$/, '') || ''}
              originalName={portState.isAutoConfirmed ? null : portState.originalName}
              onClear={() => clearSlot(slot)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
      {renderSlot('source')}

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

      {renderSlot('dest')}
    </div>
  );
};
