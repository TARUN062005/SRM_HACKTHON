import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X, ArrowUpDown, Anchor, Plane, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const searchCache = new Map();
const BASE_URL    = import.meta.env.VITE_BACKEND_URL || '';

const LABELS = {
  ship:  { from: 'Port of origin',      to: 'Destination port'     },
  air:   { from: 'Departure airport',   to: 'Arrival airport'      },
  truck: { from: 'Pickup location',     to: 'Delivery location'    },
};

// ── helpers ───────────────────────────────────────────────────────────────────
const modeIcon = (mode) => {
  if (mode === 'ship') return <Anchor size={10} />;
  if (mode === 'air')  return <Plane  size={10} />;
  return <MapPin size={10} />;
};

const modeColor = (mode) => {
  const base = {
    accent: 'var(--accent)',
    glow: 'rgba(0,194,255,0.12)',
    warn: 'rgba(255,181,71,0.08)',
    warnBorder: 'rgba(255,181,71,0.25)',
    warnText: 'var(--warning)',
  };
  return base;
};

// ── Search dropdown ───────────────────────────────────────────────────────────
const LocationInput = ({ placeholder, dotColor, query, setQuery, results, searching, slot, selected, activeDropdown, setActiveDropdown, onSelect, onClear, freightMode }) => {
  const focused = activeDropdown === slot;
  const colors  = modeColor(freightMode);

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: focused ? 'var(--card)' : 'var(--bg)',
          border:     `1px solid ${focused ? colors.accent : 'var(--border)'}`,
          boxShadow:  'none',
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setActiveDropdown(slot)}
          className="rg-input flex-1 text-sm font-medium min-w-0"
        />
        {searching
          ? <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: colors.accent }} />
          : query.length > 0 && (
            <button onClick={onClear} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            ><X size={13} /></button>
          )
        }
      </div>

      <AnimatePresence>
        {focused && results.length > 0 && !selected && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }} transition={{ duration: 0.13 }}
            className="absolute top-[calc(100%+5px)] left-0 right-0 rounded-2xl overflow-hidden z-[2000]"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
          >
            {results.map((loc, i) => {
              const isPort    = loc._isPort;
              const isAirport = loc._isAirport;
              const firstName = loc.display_name.split(',')[0];
              const subtitle  = loc.display_name.split(',').slice(1, 3).join(',');
              return (
                <button key={i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onSelect(loc, slot)}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                  style={{ borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isPort || isAirport ? colors.glow : 'var(--accent-glow)' }}
                  >
                    {isPort    ? <Anchor size={12} style={{ color: colors.accent }} strokeWidth={2.5} />
                   : isAirport ? <Plane  size={12} style={{ color: colors.accent }} strokeWidth={2.5} />
                   : <MapPin   size={12} style={{ color: 'var(--accent)' }}        strokeWidth={2.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {firstName}
                      {(isPort || isAirport) && (
                        <span className="ml-1.5 text-[8px] font-black uppercase tracking-wide px-1 py-0.5 rounded"
                          style={{ background: colors.glow, color: colors.accent }}>
                          {isPort ? 'Port' : 'Airport'}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Option picker (ports or airports) ────────────────────────────────────────
const OptionPicker = ({ mode, locationName, options, resolving, onPick, onDismiss }) => {
  const colors   = modeColor(mode);
  const isAir    = mode === 'air';
  const label    = isAir ? 'Select nearest airport' : 'Select a seaport';
  const subtitle = locationName ? `near ${locationName}` : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.17 }}
      className="rounded-xl overflow-hidden"
      style={{ background: colors.warn, border: `1px solid ${colors.warnBorder}` }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${colors.warnBorder}` }}>
        <AlertTriangle size={10} style={{ color: colors.warnText, flexShrink: 0 }} />
        <p className="text-[10px] font-black uppercase tracking-wider flex-1" style={{ color: colors.warnText }}>
          {label} {subtitle}
        </p>
        {!resolving && (
          <button onClick={onDismiss} style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          ><X size={11} /></button>
        )}
      </div>

      {/* Options */}
      {resolving ? (
        <div className="flex items-center gap-2 px-3 py-3">
          <Loader2 size={12} className="animate-spin" style={{ color: colors.accent }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Finding nearest {isAir ? 'airports' : 'ports'}…
          </span>
        </div>
      ) : (
        <div className="p-1.5 flex flex-col gap-0.5">
          {options.map((opt, i) => (
            <button key={i} onClick={() => onPick(opt)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all group"
              style={{ background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = colors.warn}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: i === 0 ? colors.glow : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {isAir
                  ? <Plane   size={11} style={{ color: i === 0 ? colors.accent : 'var(--text-muted)' }} />
                  : <Anchor  size={11} style={{ color: i === 0 ? colors.accent : 'var(--text-muted)' }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                  {isAir ? `${opt.name} (${opt.iata})` : `${opt.name} Port`}
                  {i === 0 && (
                    <span className="ml-1.5 text-[8px] font-black uppercase tracking-wide px-1 py-0.5 rounded"
                      style={{ background: colors.glow, color: colors.accent }}>
                      Nearest
                    </span>
                  )}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {isAir ? opt.city : opt.country} · {opt.distKm} km away
                </p>
              </div>
              <ChevronRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                style={{ color: colors.accent }} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ── Confirmed chip ────────────────────────────────────────────────────────────
const ConfirmedChip = ({ mode, displayName, originalName, onClear }) => {
  const colors = modeColor(mode);
  const isAir  = mode === 'air';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
      style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.22)' }}
    >
      <CheckCircle2 size={11} style={{ color: '#22C55E', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black truncate" style={{ color: '#22C55E' }}>{displayName}</p>
        {originalName && (
          <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isAir ? 'Airport' : 'Port'} serving {originalName}
          </p>
        )}
      </div>
      <button onClick={onClear} style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      ><X size={11} /></button>
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export const ShipmentCreationFlow = ({
  freightMode     = 'ship',
  onLocationSelect,
  onClearRoute,
  initialSource   = null,
  initialDest     = null,
}) => {
  const labels   = LABELS[freightMode] || LABELS.truck;
  const needsRes = freightMode === 'ship' || freightMode === 'air';

  const abortControllers = useRef({ source: null, dest: null });

  // ── Per-slot state ────────────────────────────────────────────────────────
  // slotState[slot] = null | { status: 'resolving'|'picking'|'confirmed', options:[], originalName:'', chosen: locObj }
  const mkSlot = () => ({ query: '', results: [], searching: false, selected: null, slotState: null, error: null });

  const [src, setSrc] = useState(mkSlot());
  const [dst, setDst] = useState(mkSlot());
  const [activeDropdown, setActiveDropdown] = useState(null);

  const setSlot = (which, patch) => {
    if (which === 'source') setSrc(p => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
    else                    setDst(p => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
  };
  const getSlot = (which) => (which === 'source' ? src : dst);

  // ── Sync from parent ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initialSource) setSrc(p => ({ ...p, selected: initialSource, query: initialSource.display_name?.split(',')[0] || '', slotState: null }));
    else               setSrc(mkSlot());
  }, [initialSource]);

  useEffect(() => {
    if (initialDest) setDst(p => ({ ...p, selected: initialDest, query: initialDest.display_name?.split(',')[0] || '', slotState: null }));
    else             setDst(mkSlot());
  }, [initialDest]);

  useEffect(() => {
    const h = () => setActiveDropdown(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  useEffect(() => {
    searchCache.clear();
    setSrc(mkSlot());
    setDst(mkSlot());
    setActiveDropdown(null);
    onClearRoute?.();
  }, [freightMode, onClearRoute]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      if (abortControllers.current.source) abortControllers.current.source.abort();
      if (abortControllers.current.dest) abortControllers.current.dest.abort();
    };
  }, []);

  const ready = (slot) => {
    if (!needsRes) return slot.selected;
    return slot.slotState?.status === 'confirmed' && slot.slotState?.chosen;
  };

  const isSearchDisabled = !(ready(src) && ready(dst));

  const handleSearchRoute = () => {
    if (isSearchDisabled) return;
    const srcLoc = needsRes ? src.slotState.chosen : src.selected;
    const dstLoc = needsRes ? dst.slotState.chosen : dst.selected;
    onLocationSelect(srcLoc, dstLoc);
  };

  // ── Location search fetch ─────────────────────────────────────────────────
  const filterResultsByMode = (data) => {
    if (freightMode === 'ship') return data.filter(loc => loc._isPort);
    if (freightMode === 'air') return data.filter(loc => loc._isAirport);
    return data;
  };

  const fetchLocations = async (query, which) => {
    const modeKey = freightMode === 'ship' ? 'sea' : freightMode === 'truck' ? 'road' : freightMode;
    const trimmed = query.trim().toLowerCase();
    const key = `${modeKey}:${trimmed}`;
    
    // Minimum 3 characters
    if (trimmed.length < 3) { 
      setSlot(which, { results: [] }); 
      return; 
    }
    
    if (searchCache.has(key)) { 
      const data = searchCache.get(key);
      setSlot(which, { results: data }); 
      console.log(`[SEARCH]\nquery=${query}\nresults=${data.map(r => r.display_name).join(' | ')}`);
      return; 
    }

    // Cancel previous search for this input slot
    if (abortControllers.current[which]) {
      abortControllers.current[which].abort();
    }
    abortControllers.current[which] = new AbortController();

    setSlot(which, { searching: true });
    try {
      const res  = await axios.get(`${BASE_URL}/api/ai/search`, {
        params: { q: query, limit: 6, mode: modeKey },
        timeout: 6000,
        signal: abortControllers.current[which].signal,
      });
      const data = filterResultsByMode(res.data || []);
      if (data.length > 0) searchCache.set(key, data);
      
      console.log(`[SEARCH]\nquery=${query}\nresults=${data.map(r => r.display_name).join(' | ')}`);

      setSlot(which, { results: data, searching: false });
    } catch (err) {
      if (axios.isCancel(err)) {
        return; // ignore cancelled request
      }
      setSlot(which, { results: [], searching: false });
    }
  };

  useEffect(() => {
    const slot = src;
    if (activeDropdown !== 'source' || slot.selected || slot.slotState?.status === 'picking') return;
    // 250ms debounce
    const t = setTimeout(() => fetchLocations(slot.query, 'source'), 250);
    return () => clearTimeout(t);
  }, [src.query, activeDropdown, src.selected, src.slotState]);

  useEffect(() => {
    const slot = dst;
    if (activeDropdown !== 'dest' || slot.selected || slot.slotState?.status === 'picking') return;
    // 250ms debounce
    const t = setTimeout(() => fetchLocations(slot.query, 'dest'), 250);
    return () => clearTimeout(t);
  }, [dst.query, activeDropdown, dst.selected, dst.slotState]);

  // ── Resolution (port / airport) ───────────────────────────────────────────
  const resolveLocation = async (loc, which) => {
    const originalName = loc.display_name?.split(',')[0] || loc.display_name;

    // Direct port selection from injected search result → instant confirm
    if (loc._isPort && freightMode === 'ship') {
      setSlot(which, {
        slotState: { status: 'confirmed', options: [], originalName: null, chosen: { lat: loc.lat, lon: loc.lon, display_name: loc.display_name } },
      });
      return;
    }
    if (loc._isAirport && freightMode === 'air') {
      setSlot(which, {
        slotState: { status: 'confirmed', options: [], originalName: null, chosen: { lat: loc.lat, lon: loc.lon, display_name: loc.display_name } },
      });
      return;
    }

    // Otherwise resolve via backend
    setSlot(which, { slotState: { status: 'resolving', options: [], originalName, chosen: null } });
    try {
      const endpoint = freightMode === 'air' ? '/api/ai/resolve-airport' : '/api/ai/resolve-port';
      const res = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { lat: loc.lat, lon: loc.lon, name: originalName },
        timeout: 5000,
      });

      const options = freightMode === 'air' ? (res.data.nearestAirports || []) : (res.data.nearestPorts || []);
      setSlot(which, { slotState: { status: 'picking', options, originalName, chosen: null } });
    } catch {
      setSlot(which, { slotState: { status: 'picking', options: [], originalName, chosen: null } });
    }
  };

  // ── Select handlers ───────────────────────────────────────────────────────
  const handleSelect = (loc, which) => {
    if (freightMode === 'ship' && !loc._isPort) {
      setSlot(which, { error: 'Select a seaport for maritime routes.', results: [] });
      return;
    }
    if (freightMode === 'air' && !loc._isAirport) {
      setSlot(which, { error: 'Select an airport for air routes.', results: [] });
      return;
    }
    const short = loc.display_name?.split(',')[0] || loc.display_name;
    setActiveDropdown(null);
    setSlot(which, { selected: loc, query: short, results: [], slotState: null, error: null });
    
    // Log selected search result
    console.log(`[SEARCH]\nquery=${short}\nselected=${loc.display_name}`);

    if (needsRes) resolveLocation(loc, which);
  };

  const handlePick = (which, opt) => {
    const isAir = freightMode === 'air';
    const displayName = isAir ? `${opt.name} (${opt.iata})` : `${opt.name} Port`;
    const chosen = { lat: opt.lat, lon: opt.lon, display_name: `${displayName}, ${opt.country}` };
    const originalName = getSlot(which).slotState?.originalName;
    setSlot(which, {
      slotState: { status: 'confirmed', options: [], originalName, chosen },
    });
  };

  const clearSlot = (which) => {
    setSlot(which, { query: '', results: [], selected: null, slotState: null, searching: false, error: null });
    onClearRoute?.();
  };

  const handleSwap = () => {
    const [s, d] = [{ ...src }, { ...dst }];
    setSrc({ ...d });
    setDst({ ...s });
  };

  // ── Slot renderer ─────────────────────────────────────────────────────────
  const renderSlot = (which) => {
    const slot      = getSlot(which);
    const isSource  = which === 'source';
    const dotColor  = isSource ? '#22C55E' : '#EF4444';
    const label     = isSource ? labels.from : labels.to;
    const ss        = slot.slotState;
    const confirmed = ss?.status === 'confirmed';
    const picking   = ss?.status === 'picking';
    const resolving = ss?.status === 'resolving';
    const isAir     = freightMode === 'air';

    return (
      <div className="flex flex-col gap-1.5">
        {/* Text input — hidden when confirmed in resolution mode */}
        {(!confirmed || !needsRes) && (
          <LocationInput
            placeholder={label}
            dotColor={dotColor}
            query={slot.query}
            setQuery={text => {
              setSlot(which, { query: text, error: null });
              if (slot.selected) setSlot(which, { selected: null, slotState: null, results: [], error: null });
            }}
            results={slot.results}
            searching={slot.searching}
            slot={which}
            selected={slot.selected}
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            onSelect={handleSelect}
            onClear={() => clearSlot(which)}
            freightMode={freightMode}
          />
        )}

        {slot.error && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle size={11} style={{ color: '#EF4444' }} />
            <span className="text-[10px]" style={{ color: '#FCA5A5' }}>{slot.error}</span>
          </div>
        )}

        {/* Resolving spinner inline */}
        <AnimatePresence>
          {needsRes && resolving && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Finding nearest {isAir ? 'airports' : 'ports'} to {ss?.originalName}…
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Option picker */}
        <AnimatePresence>
          {needsRes && picking && (
            <OptionPicker
              mode={freightMode}
              locationName={ss?.originalName}
              options={ss?.options || []}
              resolving={false}
              onPick={opt => handlePick(which, opt)}
              onDismiss={() => clearSlot(which)}
            />
          )}
        </AnimatePresence>

        {/* Confirmed chip */}
        <AnimatePresence>
          {needsRes && confirmed && (
            <ConfirmedChip
              mode={freightMode}
              displayName={ss.chosen?.display_name?.replace(/,.*$/, '') || ''}
              originalName={ss.originalName}
              onClear={() => clearSlot(which)}
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
          disabled={!src.selected && !dst.selected}
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

      <button
        onClick={handleSearchRoute}
        disabled={isSearchDisabled}
        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all mt-2.5 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: isSearchDisabled ? 'rgba(255,255,255,0.04)' : 'var(--accent)',
          border: isSearchDisabled ? '1px solid var(--border)' : '1px solid transparent',
          color: isSearchDisabled ? 'var(--text-muted)' : '#FFFFFF',
          boxShadow: isSearchDisabled ? 'none' : '0 4px 12px rgba(0,194,255,0.25)',
        }}
      >
        SEARCH ROUTE
      </button>
    </div>
  );
};
