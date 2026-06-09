import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  X, Mic, MicOff, Send, Bot, Anchor, Plane, Truck,
  MapPin, Calendar, Package, Zap, ChevronRight, RotateCcw,
  CheckCircle2, Circle, Clock,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const MODE_MAP = { sea: 'ship', ship: 'sea', air: 'air', truck: 'truck', road: 'truck' };

const MODE_OPTS = [
  { value: 'sea',   label: 'Sea',  Icon: Anchor, color: '#0d47a1' },
  { value: 'air',   label: 'Air',  Icon: Plane,  color: '#0288d1' },
  { value: 'truck', label: 'Road', Icon: Truck,  color: '#c2410c' },
];

const FIELD_ICONS = {
  origin:      { Icon: MapPin,    label: 'Origin',      color: '#22C55E' },
  destination: { Icon: MapPin,    label: 'Destination', color: '#EF4444' },
  mode:        { Icon: Anchor,    label: 'Mode',        color: '#3B82F6' },
  date:        { Icon: Calendar,  label: 'Date',        color: '#A78BFA' },
  time:        { Icon: Clock,     label: 'Time',        color: '#F59E0B' },
  cargo:       { Icon: Package,   label: 'Cargo',       color: '#F59E0B' },
  priority:    { Icon: Zap,       label: 'Priority',    color: '#38BDF8' },
};

const WELCOME = {
  id: 0, role: 'mode-select',
  text: "Hi, I'm Routy! I'll help you plan your shipment step by step. Which mode of transport do you want to use? (Road, Sea, or Air)",
};

const SUGGESTIONS = [
  'Shanghai to Rotterdam by sea',
  'Mumbai to Dubai',
  'JFK to Heathrow by air',
  'Delhi to London',
];

const isValidLocationLocal = (q) => {
  if (!q) return false;
  const clean = q.toLowerCase().trim();
  const INVALID = new Set([
    'sea', 'ship', 'road', 'air', 'flight', 'airplane', 'maritime',
    'transport', 'cargo', 'rail', 'train', 'ground', 'land', 'truck',
    'express', 'standard', 'economy', 'port', 'airport', 'way', 'route'
  ]);
  const words = clean.replace(/[\(\)\[\]\+\*,-\.\/]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length === 1 && INVALID.has(words[0])) return false;
  return !words.every(word => INVALID.has(word));
};

const localExtractFromTranscript = (text) => {
  if (!text) return null;
  const msg = text.trim();
  
  let mode = null;
  if (/\b(sea|maritime|ship|ocean|seafreight)\b/i.test(msg)) {
      mode = 'sea';
  } else if (/\b(air|flight|plane|airport|airfreight)\b/i.test(msg)) {
      mode = 'air';
  } else if (/\b(road|truck|ground|land|roadfreight)\b/i.test(msg)) {
      mode = 'road';
  } else if (/\b(rail|train)\b/i.test(msg)) {
      mode = 'rail';
  }

  let origin = null;
  let destination = null;
  const routeMatch = msg.match(/(?:from\s+)?(.+?)\s+(?:to|till|→|->|destination|dest)\s+(.+)/i);
  if (routeMatch) {
      let orig = routeMatch[1].trim();
      let dest = routeMatch[2].trim();
      orig = orig.replace(/^(ship|route|cargo|freight|from)\s+/i, '').trim();
      
      const byMatch = dest.match(/^(.+?)\s+(?:by|via|using|through)?\s*(sea|ship|maritime|air|flight|plane|rail|train|truck|road|ground|land)$/i);
      if (byMatch) {
          dest = byMatch[1].trim();
          if (!mode) {
              const rawM = byMatch[2].toLowerCase();
              mode = (rawM === 'ship' || rawM === 'maritime') ? 'sea' : (rawM === 'truck' || rawM === 'ground' || rawM === 'land') ? 'road' : rawM;
          }
      }
      if (isValidLocationLocal(orig)) origin = orig;
      if (isValidLocationLocal(dest)) destination = dest;
  } else {
      const words = msg.split(/[\s,]+/).map(w => w.trim()).filter(Boolean);
      if (words.length === 2) {
          if (isValidLocationLocal(words[0]) && isValidLocationLocal(words[1])) {
              origin = words[0];
              destination = words[1];
          }
      }
  }

  return { origin: origin || 'Not detected', destination: destination || 'Not detected', mode: mode || 'Not detected' };
};

// ── Route History (localStorage) ──────────────────────────────────────────────
export const saveRouteToHistory = (route) => {
  try {
    const existing = JSON.parse(localStorage.getItem('routeguardian_routes') || '[]');
    const entry = {
      id: Date.now(),
      origin: route.state?.origin || route.source?.display_name?.split(',')[0] || 'Unknown',
      destination: route.state?.destination || route.destination?.display_name?.split(',')[0] || 'Unknown',
      mode: route.state?.mode || 'sea',
      date: route.state?.date || null,
      cargo: route.state?.cargo || null,
      riskScore: route.riskScore || null,
      severity: route.severity || null,
      timestamp: Date.now(),
      source: route.source,
      dest: route.destination,
    };
    const updated = [entry, ...existing].slice(0, 20);
    localStorage.setItem('routeguardian_routes', JSON.stringify(updated));
    return entry;
  } catch { return null; }
};

export const loadRouteHistory = () => {
  try { return JSON.parse(localStorage.getItem('routeguardian_routes') || '[]'); } catch { return []; }
};

export const clearRouteHistory = () => {
  try { localStorage.removeItem('routeguardian_routes'); } catch {}
};

// ── Port / Airport dual-picker shown after Routy RESOLVE response ─────────────
const ResolveCard = ({ mode, originName, destName, originOptions, destOptions, onConfirm }) => {
  const [pickedOrigin, setPickedOrigin] = useState(null);
  const [pickedDest,   setPickedDest]   = useState(null);
  const isAir    = mode === 'air';
  const accent   = '#00C2FF';
  const bgAccent = isAir ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)';
  const ready    = pickedOrigin && pickedDest;

  const OptionList = ({ options, picked, onPick, label }) => (
    <div className="mb-3">
      <p className="text-[9px] font-black uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>
        {label}
      </p>
      <div className="flex flex-col gap-1">
        {options.map((opt, i) => {
          const selected    = picked?.name === opt.name;
          const displayName = isAir ? `${opt.name} (${opt.iata})` : `${opt.name} Port`;
          return (
            <button key={i} onClick={() => onPick(opt)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
              style={{
                background: selected ? bgAccent : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {isAir
                ? <Plane   size={10} style={{ color: selected ? accent : '#6B7280', flexShrink: 0 }} />
                : <Anchor  size={10} style={{ color: selected ? accent : '#6B7280', flexShrink: 0 }} />}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold truncate" style={{ color: selected ? accent : '#D1D5DB' }}>
                  {displayName}
                  {i === 0 && (
                    <span className="ml-1.5 text-[8px] font-black uppercase px-1 py-0.5 rounded"
                      style={{ background: bgAccent, color: accent }}>Nearest</span>
                  )}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: '#6B7280' }}>
                  {isAir ? opt.city : opt.country} · {opt.distKm} km away
                </p>
              </div>
              {selected && <CheckCircle2 size={10} style={{ color: accent, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-3.5 rounded-2xl rounded-tl-none animate-fade-in" style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.12)', maxWidth: '95%' }}>
      <div className="flex items-center gap-1.5 mb-3">
        {isAir ? <Plane size={11} style={{ color: accent }} /> : <Anchor size={11} style={{ color: accent }} />}
        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: accent }}>
          Confirm {isAir ? 'Airports' : 'Seaports'}
        </p>
      </div>
      <OptionList options={originOptions} picked={pickedOrigin} onPick={setPickedOrigin} label={`From: ${originName}`} />
      <OptionList options={destOptions}   picked={pickedDest}   onPick={setPickedDest}   label={`To: ${destName}`}     />
      <button
        disabled={!ready}
        onClick={() => ready && onConfirm(pickedOrigin, pickedDest)}
        className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
        style={{
          background: ready ? 'linear-gradient(135deg, #00C2FF 0%, #0088FF 100%)' : 'rgba(255,255,255,0.05)',
          color:      ready ? '#041019' : '#6B7280',
          cursor:     ready ? 'pointer' : 'not-allowed',
        }}
      >
        {ready ? 'Confirm & Calculate Route' : 'Select both locations above'}
      </button>
    </div>
  );
};

// ── Interactive Date Picker ──────────────────────────────────────────────────
const DateSelectBubble = ({ msg, onDateSelect }) => {
  const [dateVal, setDateVal] = useState('');
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    if (!dateVal) return;
    setDone(true);
    onDateSelect?.(dateVal);
  };

  return (
    <div className="flex justify-start flex-col gap-2 animate-fade-in">
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
        {msg.text}
      </div>
      {!done ? (
        <div className="flex items-center gap-2 p-2 rounded-xl max-w-[95%] animate-fade-in"
          style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <input
            type="date"
            value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            className="bg-[#0B1220] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-xs text-[#F9FAFB] outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 min-w-[130px] flex-1"
            style={{ colorScheme: 'dark' }}
          />
          <button
            onClick={handleConfirm}
            disabled={!dateVal}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
            style={{
              background: dateVal ? 'linear-gradient(135deg, #00C2FF 0%, #0088FF 100%)' : 'rgba(255,255,255,0.05)',
              color: dateVal ? '#041019' : '#6B7280',
              cursor: dateVal ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm
          </button>
        </div>
      ) : (
        <div className="text-[10px] italic font-semibold px-1" style={{ color: '#00C2FF' }}>
          Date confirmed: {dateVal}
        </div>
      )}
    </div>
  );
};

// ── Interactive Time Picker ──────────────────────────────────────────────────
const TimeSelectBubble = ({ msg, onTimeSelect }) => {
  const [timeVal, setTimeVal] = useState('');
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    if (!timeVal) return;
    setDone(true);
    onTimeSelect?.(timeVal);
  };

  return (
    <div className="flex justify-start flex-col gap-2 animate-fade-in">
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
        {msg.text}
      </div>
      {!done ? (
        <div className="flex items-center gap-2 p-2 rounded-xl max-w-[95%] animate-fade-in"
          style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <input
            type="time"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
            className="bg-[#0B1220] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-xs text-[#F9FAFB] outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 min-w-[130px] flex-1"
            style={{ colorScheme: 'dark' }}
          />
          <button
            onClick={handleConfirm}
            disabled={!timeVal}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
            style={{
              background: timeVal ? 'linear-gradient(135deg, #00C2FF 0%, #0088FF 100%)' : 'rgba(255,255,255,0.05)',
              color: timeVal ? '#041019' : '#6B7280',
              cursor: timeVal ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm
          </button>
        </div>
      ) : (
        <div className="text-[10px] italic font-semibold px-1" style={{ color: '#00C2FF' }}>
          Time confirmed: {timeVal}
        </div>
      )}
    </div>
  );
};

// ── Thinking dots ─────────────────────────────────────────────────────────────
const ThinkingDots = () => (
  <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.12)' }}>
    {[0, 1, 2].map(i => (
      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--accent, #00C2FF)', animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
);

// ── State progress bar ────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['origin', 'destination', 'mode'];

const StateProgress = ({ state }) => {
  const required  = REQUIRED_FIELDS;
  const collected = required.filter(f => state[f]);
  const pct = (collected.length / required.length) * 100;

  return (
    <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          Collection Progress
        </span>
        <span className="text-[9px] font-bold text-cyan-400">
          {collected.length}/{required.length} required
        </span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full bg-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {Object.entries(FIELD_ICONS).map(([key, { Icon, label, color }]) => {
          const val = state[key];
          const isRequired = REQUIRED_FIELDS.includes(key);
          return (
            <div key={key} className="flex items-center gap-1">
              {val
                ? <CheckCircle2 size={9} className="text-green-500" />
                : <Circle size={9} style={{ color: isRequired ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)' }} />}
              <span className="text-[9px] font-medium" style={{ color: val ? '#D1D5DB' : isRequired ? '#94A3B8' : 'rgba(255,255,255,0.2)' }}>
                {val ? val.split(',')[0].substring(0, 12) : label}
                {isRequired && !val && <span className="text-red-500">*</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Message bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ msg, onPortSelect, onModeSelect, onResolveConfirm, onDateSelect, onTimeSelect }) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-none text-xs font-semibold leading-relaxed"
          style={{ background: 'linear-gradient(135deg, #00C2FF 0%, #0088FF 100%)', color: '#041019' }}>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed animate-fade-in"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }}>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'mode-select') {
    return (
      <div className="flex justify-start flex-col gap-2 animate-fade-in">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
          {msg.text}
        </div>
        <div className="flex flex-wrap gap-2">
          {MODE_OPTS.map(({ value, label, Icon, color }) => (
            <button key={value} onClick={() => onModeSelect?.(value)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
              style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (msg.role === 'date-select') {
    return <DateSelectBubble msg={msg} onDateSelect={onDateSelect} />;
  }

  if (msg.role === 'time-select') {
    return <TimeSelectBubble msg={msg} onTimeSelect={onTimeSelect} />;
  }

  if (msg.role === 'clarify') {
    return (
      <div className="flex justify-start flex-col gap-2 animate-fade-in">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
          {msg.text}
        </div>
        {msg.options?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.options.map((opt, i) => (
              <button key={i}
                onClick={() => onPortSelect?.(opt, msg.clarifyField)}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:scale-105"
                style={{
                  background: msg.clarifyField === 'origin' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: msg.clarifyField === 'origin' ? '#22C55E' : '#EF4444',
                  border: `1px solid ${msg.clarifyField === 'origin' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                {opt.split(',')[0]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (msg.role === 'complete') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] px-3.5 py-3 rounded-2xl rounded-tl-none text-xs leading-relaxed animate-fade-in"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={12} className="text-green-500" />
            <span className="font-black text-[10px] uppercase tracking-wider text-green-400">Route Ready</span>
          </div>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'resolve') {
    return (
      <div className="flex justify-start flex-col gap-2 animate-fade-in">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
          {msg.text}
        </div>
        <ResolveCard
          mode={msg.mode}
          originName={msg.originName}
          destName={msg.destName}
          originOptions={msg.originOptions || []}
          destOptions={msg.destOptions || []}
          onConfirm={(origin, dest) => onResolveConfirm?.(origin, dest, msg.pendingState)}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed animate-fade-in"
        style={{ background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(148,163,184,0.12)' }}>
        {msg.text}
      </div>
    </div>
  );
};

// ── MAIN PANEL ────────────────────────────────────────────────────────────────
const RoutyChatPanel = ({ isOpen, onClose, onRouteGenerated, freightMode = 'ship', onRouteSaved }) => {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [convState, setConvState] = useState({
    origin: null, destination: null, mode: null,
    date: null, time: null, cargo: null, priority: null,
    confirmedSource: null, confirmedDest: null,
  });
  const [convHistory, setConvHistory] = useState([]);
  
  // Search Autocomplete Picker states
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Voice transcript confirmation step
  const [voiceConfirmation, setVoiceConfirmation] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const srRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isThinking]);

  // Load state from DB on mount / open
  useEffect(() => {
    if (isOpen) {
      const loadState = async () => {
        setIsThinking(true);
        try {
          const res = await axios.get(`${BASE_URL}/api/ai/agent/state`, { withCredentials: true });
          if (res.data?.success && res.data.state) {
            const serverState = res.data.state;
            setConvState({
              origin: serverState.origin || null,
              destination: serverState.destination || null,
              mode: serverState.mode || null,
              date: serverState.date || null,
              time: serverState.time || null,
              cargo: serverState.cargo || null,
              priority: serverState.priority || null,
              confirmedSource: serverState.confirmedSource || null,
              confirmedDest: serverState.confirmedDest || null,
              currentStep: serverState.currentStep || 'mode',
            });
            if (serverState.messages && serverState.messages.length > 0) {
              setMessages(serverState.messages);
            } else {
              setMessages([WELCOME]);
            }
            setConvHistory(serverState.history || []);
          } else {
            setConvState({ origin: null, destination: null, mode: null, date: null, time: null, cargo: null, priority: null, confirmedSource: null, confirmedDest: null, currentStep: 'mode' });
            setMessages([WELCOME]);
            setConvHistory([]);
          }
        } catch (err) {
          console.warn('[RoutyChatPanel] Failed to load server state:', err.message);
          setConvState({ origin: null, destination: null, mode: null, date: null, time: null, cargo: null, priority: null, confirmedSource: null, confirmedDest: null, currentStep: 'mode' });
          setMessages([WELCOME]);
          setConvHistory([]);
        } finally {
          setIsThinking(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      };
      loadState();
    }
  }, [isOpen]);

  // Search autocomplete watcher
  useEffect(() => {
    if (input.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const modeParam = convState.mode || 'sea';
        const res = await axios.get(`${BASE_URL}/api/ai/search`, {
          params: { q: input, mode: modeParam, limit: 5 },
          withCredentials: true
        });
        const results = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (err) {
        console.warn('Autocomplete fetch failed:', err.message);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [input, convState.mode]);

  const saveStateToServer = useCallback(async (state, msgs, history) => {
    try {
      await axios.post(`${BASE_URL}/api/ai/agent/state`, {
        state: {
          ...state,
          messages: msgs,
          history: history
        }
      }, { withCredentials: true });
    } catch (err) {
      console.warn('[RoutyChatPanel] Failed to save state to server:', err.message);
    }
  }, []);

  const handleSend = useCallback(async (text, override = {}) => {
    const cmd = (text || input).trim();
    if (!cmd || isThinking) return;

    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setIsThinking(true);

    const newId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) + 1 : 1;
    const userMsg = { id: newId, role: 'user', text: cmd };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    const newHistory = [...convHistory, { role: 'user', text: cmd }];
    const stateToSend = { ...convState, ...override };

    try {
      const res = await axios.post(`${BASE_URL}/api/ai/agent/chat`, {
        message: cmd,
        state: stateToSend,
        history: newHistory,
      }, { withCredentials: true, timeout: 30000 });

      const data = res.data;
      const updatedState = { ...stateToSend, ...(data.state || {}) };
      setConvState(updatedState);

      const aiHistory = [...newHistory, { role: 'ai', text: data.message }];
      setConvHistory(aiHistory);

      let role = 'ai';
      let extra = {};

      if (data.type === 'COMPLETE' && data.source && data.destination) {
        role = 'complete';
        const saved = saveRouteToHistory({ state: updatedState, source: data.source, destination: data.destination });
        onRouteSaved?.(saved);
        setTimeout(() => {
          onRouteGenerated?.({
            source: data.source,
            destination: data.destination,
            mode: updatedState.mode,
            shipment: data.shipment
          });
          onClose?.();
        }, 1200);
      } else if (data.type === 'CLARIFY') {
        const msgLower = data.message?.toLowerCase() || '';
        const isModeQ = msgLower.includes('mode') || msgLower.includes('sea') || msgLower.includes('ship') || msgLower.includes('transport');
        if (!updatedState.mode && isModeQ && (!data.options || data.options.length === 0)) {
          role = 'mode-select';
        } else {
          role = 'clarify';
          extra = { clarifyField: data.clarifyField || 'origin', options: data.options || [] };
        }
      } else if (data.type === 'RESOLVE') {
        role = 'resolve';
        extra = {
          mode:          data.mode,
          originName:    data.originName,
          destName:      data.destName,
          originOptions: data.options || data.originOptions || [],
          destOptions:   data.destOptions   || [],
          pendingState:  updatedState,
        };
      } else if (data.type === 'ASK') {
        const msgLower = data.message?.toLowerCase() || '';
        const isModeQ = !updatedState.mode && (msgLower.includes('mode') || msgLower.includes('transport') || msgLower.includes('sea') || msgLower.includes('air'));
        const isDateQ = !updatedState.date && (msgLower.includes('date') || msgLower.includes('when'));
        const isTimeQ = !updatedState.time && (msgLower.includes('time') || msgLower.includes('departure') || msgLower.includes('clock') || msgLower.includes('hour'));
        
        if (isModeQ) {
          role = 'mode-select';
        } else if (isDateQ) {
          role = 'date-select';
        } else if (isTimeQ) {
          role = 'time-select';
        }
      }

      const aiId = newId + 1;
      const aiMsg = { id: aiId, role, text: data.message || "Got it, let's keep going.", ...extra };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      await saveStateToServer(updatedState, finalMessages, aiHistory);
    } catch (err) {
      console.error('[RoutyChatPanel] Chat error:', err.message);
      
      const nextQ = !stateToSend.mode
        ? 'Which transport mode — Sea, Air, or Road?'
        : !stateToSend.origin
        ? 'Where would you like to ship from?'
        : !stateToSend.destination
        ? 'Great choice! Now, where are you shipping to?'
        : !stateToSend.date
        ? 'What date would you like to ship? (e.g. June 15, next Monday, or ASAP)'
        : !stateToSend.time
        ? "What's the preferred departure time? (e.g. 09:00, morning, any time)"
        : 'Almost there — let me calculate your route.';

      const msgLower = nextQ.toLowerCase();
      let role = 'ai';
      if (!stateToSend.mode) {
        role = 'mode-select';
      } else if (!stateToSend.date && (msgLower.includes('date') || msgLower.includes('when'))) {
        role = 'date-select';
      } else if (!stateToSend.time && (msgLower.includes('time') || msgLower.includes('departure'))) {
        role = 'time-select';
      }

      const aiId = newId + 1;
      const aiMsg = { id: aiId, role, text: nextQ };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      await saveStateToServer(stateToSend, finalMessages, newHistory);
    } finally {
      setIsThinking(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [input, isThinking, convState, convHistory, messages, onRouteGenerated, onClose, onRouteSaved, saveStateToServer]);

  const handlePortSelect = useCallback((portName, field) => {
    const stateOverride = field === 'origin' ? { origin: portName } : { destination: portName };
    handleSend(portName, stateOverride);
  }, [handleSend]);

  const handleDateSelect = useCallback((date) => {
    handleSend(date, { date });
  }, [handleSend]);

  const handleTimeSelect = useCallback((time) => {
    handleSend(time, { time });
  }, [handleSend]);

  const handleConfirmResolve = useCallback(async (pickedOrigin, pickedDest, pendingState) => {
    const isAir = pendingState?.mode === 'air';
    const origDisplay = isAir ? `${pickedOrigin.name} (${pickedOrigin.iata})` : `${pickedOrigin.name} Port`;
    const destDisplay  = isAir ? `${pickedDest.name} (${pickedDest.iata})`   : `${pickedDest.name} Port`;
    
    setIsThinking(true);

    const newId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) + 1 : 1;
    const userMsg = { id: newId, role: 'user', text: `${origDisplay} → ${destDisplay}` };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    const confirmedSource = { lat: pickedOrigin.lat, lon: pickedOrigin.lon, display_name: `${origDisplay}, ${pickedOrigin.country}` };
    const confirmedDest   = { lat: pickedDest.lat,   lon: pickedDest.lon,   display_name: `${destDisplay}, ${pickedDest.country}` };

    try {
      const res = await axios.post(`${BASE_URL}/api/ai/agent/chat`, {
        message: 'confirmed',
        state: pendingState,
        confirmedSource,
        confirmedDest,
        history: convHistory,
      }, { withCredentials: true, timeout: 30000 });

      const data = res.data;
      const finalState = { ...pendingState, ...(data.state || {}) };
      setConvState(finalState);

      const aiHistory = [...convHistory, { role: 'ai', text: data.message }];
      setConvHistory(aiHistory);

      const aiId = newId + 1;
      let role = 'ai';
      if (data.type === 'COMPLETE' && data.source && data.destination) {
        role = 'complete';
        const saved = saveRouteToHistory({ state: finalState, source: data.source, destination: data.destination });
        onRouteSaved?.(saved);
        setTimeout(() => {
          onRouteGenerated?.({
            source: data.source,
            destination: data.destination,
            mode: finalState.mode,
            shipment: data.shipment
          });
          onClose?.();
        }, 1200);
      }

      const aiMsg = { id: aiId, role, text: data.message || 'Route confirmed! Calculating...' };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      await saveStateToServer(finalState, finalMessages, aiHistory);
    } catch (err) {
      console.error('[RoutyChatPanel] Confirm resolve error:', err.message);
      const errId = newId + 1;
      const errMsg = { id: errId, role: 'error', text: 'Could not confirm selection — please try again.' };
      setMessages([...updatedMessages, errMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [convHistory, messages, onRouteGenerated, onClose, onRouteSaved, saveStateToServer]);

  const handleModeSelect = useCallback((mode) => {
    const modeLabels = { sea: 'Sea (maritime)', air: 'Air freight', truck: 'Road' };
    const updatedState = { ...convState, mode };
    setConvState(updatedState);
    handleSend(modeLabels[mode] || mode, { mode });
  }, [convState, handleSend]);

  const startVoice = useCallback(() => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) {
      const newId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) + 1 : 1;
      setMessages(msgs => [...msgs, { id: newId, role: 'error', text: 'Speech recognition not supported in this browser.' }]);
      return;
    }
    if (isListening) { srRef.current?.stop(); return; }
    
    const sr = new SR();
    srRef.current = sr;
    sr.continuous = false;
    sr.interimResults = true;
    sr.lang = 'en-US';
    sr.onstart = () => { setIsListening(true); setLiveTranscript(''); };
    sr.onend = () => { setIsListening(false); setLiveTranscript(''); };
    sr.onerror = () => { setIsListening(false); setLiveTranscript(''); };
    sr.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript;
          setLiveTranscript('');
          setInput('');
          
          // Voice Mode Confirmation dialog intercept step
          const extracted = localExtractFromTranscript(t);
          setVoiceConfirmation({
            transcript: t,
            origin: extracted?.origin || 'Not detected',
            destination: extracted?.destination || 'Not detected',
            mode: extracted?.mode || 'Not detected',
          });
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setLiveTranscript(interim);
      setInput(interim);
    };
    sr.start();
  }, [isListening, messages]);

  const handleReset = useCallback(async () => {
    const cleared = { origin: null, destination: null, mode: null, date: null, time: null, cargo: null, priority: null, confirmedSource: null, confirmedDest: null, currentStep: 'mode' };
    setConvState(cleared);
    setConvHistory([]);
    setMessages([WELCOME]);
    setSuggestions([]);
    setShowSuggestions(false);
    setVoiceConfirmation(null);

    try {
      await axios.post(`${BASE_URL}/api/ai/agent/chat`, {
        message: 'reset',
        state: cleared,
        history: [],
      }, { withCredentials: true });
    } catch (err) {
      console.warn('Failed to reset agent state in DB:', err.message);
    }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[4000] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 z-[4010] flex flex-col"
            style={{ width: 360, background: '#0B1220', borderLeft: '1px solid rgba(148,163,184,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Voice Confirmation Dialog Overlay */}
            {voiceConfirmation && (
              <div className="absolute inset-0 bg-[#0B1220]/95 backdrop-blur-md z-[4050] p-4 flex flex-col justify-center animate-fade-in">
                <div className="bg-[#111A2E] border border-cyan-500/30 rounded-2xl p-5 max-w-[90%] mx-auto space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Mic size={18} className="animate-pulse" />
                    <h4 className="text-xs font-black uppercase tracking-wider">Confirm Voice Transcript</h4>
                  </div>
                  
                  <div className="bg-[#0B1220] p-3 rounded-lg border border-slate-800">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">What I heard:</p>
                    <p className="text-xs text-slate-200 italic font-medium leading-relaxed">"{voiceConfirmation.transcript}"</p>
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Extracted Details:</p>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-300">
                      <div className="bg-[#0B1220] px-3 py-2 rounded border border-slate-850">
                        <span className="text-slate-500 text-[9px] block">Origin</span>
                        {voiceConfirmation.origin}
                      </div>
                      <div className="bg-[#0B1220] px-3 py-2 rounded border border-slate-850">
                        <span className="text-slate-500 text-[9px] block">Destination</span>
                        {voiceConfirmation.destination}
                      </div>
                      <div className="bg-[#0B1220] px-3 py-2 rounded border border-slate-855 col-span-2">
                        <span className="text-slate-500 text-[9px] block">Transport Mode</span>
                        <span className="capitalize">{voiceConfirmation.mode}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => {
                        const textToSend = voiceConfirmation.transcript;
                        const stateOverride = {};
                        if (voiceConfirmation.mode !== 'Not detected') stateOverride.mode = voiceConfirmation.mode;
                        if (voiceConfirmation.origin !== 'Not detected') stateOverride.origin = voiceConfirmation.origin;
                        if (voiceConfirmation.destination !== 'Not detected') stateOverride.destination = voiceConfirmation.destination;
                        setVoiceConfirmation(null);
                        handleSend(textToSend, stateOverride);
                      }}
                      className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-900 shadow-md active:scale-95 transition-all text-center"
                    >
                      Confirm & Plan
                    </button>
                    <button
                      onClick={() => setVoiceConfirmation(null)}
                      className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-300 border border-slate-700 active:scale-95 transition-all text-center"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20">
                  <Bot size={15} className="text-cyan-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">Routy AI</p>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isThinking || isListening ? 'animate-pulse' : ''}`}
                      style={{ background: isThinking ? '#F59E0B' : isListening ? '#EF4444' : '#22C55E' }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {isThinking ? 'Thinking…' : isListening ? 'Listening…' : 'Online'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleReset} title="Reset conversation"
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-800 hover:text-white transition-all text-slate-400">
                  <RotateCcw size={13} />
                </button>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-800 hover:text-white transition-all text-slate-400">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* State progress */}
            <StateProgress state={convState} />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onPortSelect={handlePortSelect}
                  onModeSelect={handleModeSelect}
                  onResolveConfirm={handleConfirmResolve}
                  onDateSelect={handleDateSelect}
                  onTimeSelect={handleTimeSelect}
                />
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <ThinkingDots />
                </div>
              )}

              {isListening && liveTranscript && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-none text-xs italic"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' }}>
                    {liveTranscript}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick suggestions (only show when no conversation yet) */}
            {messages.length <= 1 && (
              <div className="px-4 py-2.5 flex gap-2 overflow-x-auto flex-shrink-0" style={{ borderTop: '1px solid rgba(148,163,184,0.12)' }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => handleSend(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wide border bg-[#1E293B]/60 border-slate-800/80 hover:border-cyan-500/40 hover:text-cyan-400 transition-all text-slate-400 flex-shrink-0">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Voice listening status bar */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-2 flex items-center gap-3 flex-shrink-0 border-t border-red-500/20 bg-red-950/10">
                  <div className="flex gap-0.5 items-center">
                    {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
                      <div key={i} className="w-0.5 rounded-full bg-red-500"
                        style={{ height: `${h * 16}px`, animation: 'pulse 1s infinite', animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-red-300">Listening — speak route description</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Autocomplete Suggestions Picker */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="mx-3 mb-2 bg-[#111A2E] border border-slate-800 rounded-xl max-h-[160px] overflow-y-auto overflow-x-hidden shadow-2xl relative z-[4020] divide-y divide-slate-800/40 animate-fade-in">
                {suggestions.map((place, idx) => {
                  const displayName = place.display_name || place.name || 'Unknown Location';
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(displayName);
                        setSuggestions([]);
                        setShowSuggestions(false);
                        inputRef.current?.focus();
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800/50 text-[11px] text-slate-300 transition-colors flex items-start gap-2"
                    >
                      <MapPin size={11} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Input row */}
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(148,163,184,0.12)' }}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl transition-all ${isListening ? 'border-red-500' : 'border-transparent focus-within:border-cyan-500'}`}
                style={{ background: '#0B1220', border: `2px solid ${isListening ? '#EF4444' : 'rgba(148,163,184,0.12)'}` }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isThinking) { e.preventDefault(); handleSend(); } }}
                  placeholder={isListening ? 'Listening…' : isThinking ? 'Routy is sifting…' : 'Type or search coordinates…'}
                  disabled={isListening || isThinking}
                  className="flex-1 bg-transparent outline-none text-xs font-semibold"
                  style={{ color: '#F9FAFB', caretColor: '#00C2FF' }}
                />

                {/* Mic */}
                <button
                  onClick={startVoice}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  style={{
                    background: isListening ? '#EF4444' : 'transparent',
                    color: isListening ? '#fff' : '#6B7280',
                  }}
                  onMouseEnter={e => { if (!isListening) e.currentTarget.style.color = '#F9FAFB'; }}
                  onMouseLeave={e => { if (!isListening) e.currentTarget.style.color = '#6B7280'; }}>
                  {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                </button>

                {/* Send */}
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isThinking}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  style={{
                    background: input.trim() && !isThinking ? '#00C2FF' : '#0B1220',
                    color: input.trim() && !isThinking ? '#041019' : '#374151',
                    cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed',
                  }}>
                  {isThinking
                    ? <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    : <Send size={12} />}
                </button>
              </div>
              <p className="text-center text-[9px] mt-1.5 font-medium text-slate-500">
                RouteGuardian Conversational Engine
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default RoutyChatPanel;
