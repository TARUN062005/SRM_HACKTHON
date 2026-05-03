import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  X, Mic, MicOff, Send, Bot, Anchor, Plane, Train, Truck,
  MapPin, Calendar, Package, Zap, ChevronRight, RotateCcw,
  CheckCircle2, Circle,
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const MODE_MAP = { sea: 'ship', ship: 'sea', air: 'air', rail: 'rail', truck: 'truck', road: 'truck' };

const MODE_OPTS = [
  { value: 'sea',   label: 'Sea',  Icon: Anchor, color: '#0d47a1' },
  { value: 'air',   label: 'Air',  Icon: Plane,  color: '#0288d1' },
  { value: 'rail',  label: 'Rail', Icon: Train,  color: '#6d28d9' },
  { value: 'truck', label: 'Road', Icon: Truck,  color: '#c2410c' },
];

const FIELD_ICONS = {
  origin:      { Icon: MapPin,    label: 'Origin',      color: '#22C55E' },
  destination: { Icon: MapPin,    label: 'Destination', color: '#EF4444' },
  mode:        { Icon: Anchor,    label: 'Mode',        color: '#3B82F6' },
  date:        { Icon: Calendar,  label: 'Date',        color: '#A78BFA' },
  cargo:       { Icon: Package,   label: 'Cargo',       color: '#F59E0B' },
  priority:    { Icon: Zap,       label: 'Priority',    color: '#38BDF8' },
};

const WELCOME = {
  id: 0, role: 'ai',
  text: "Hi, I'm Routy! I'll help you plan your shipment step by step. Where would you like to ship from?",
};

const SUGGESTIONS = [
  'Shanghai to Rotterdam by sea',
  'Mumbai to Dubai',
  'JFK to Heathrow by air',
  'Delhi to London',
];

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

// ── Thinking dots ─────────────────────────────────────────────────────────────
const ThinkingDots = () => (
  <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-none" style={{ background: '#1F2937', border: '1px solid #374151' }}>
    {[0, 1, 2].map(i => (
      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#3B82F6', animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
);

// ── State progress bar ────────────────────────────────────────────────────────
const StateProgress = ({ state }) => {
  const fields = ['origin', 'destination', 'mode'];
  const collected = fields.filter(f => state[f]);
  const pct = (collected.length / fields.length) * 100;

  return (
    <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>
          Collection Progress
        </span>
        <span className="text-[9px] font-bold" style={{ color: '#3B82F6' }}>
          {collected.length}/{fields.length} fields
        </span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#374151' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #3B82F6, #22C55E)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {Object.entries(FIELD_ICONS).slice(0, 6).map(([key, { Icon, label, color }]) => {
          const val = state[key];
          const isRequired = ['origin', 'destination', 'mode'].includes(key);
          return (
            <div key={key} className="flex items-center gap-1">
              {val
                ? <CheckCircle2 size={9} style={{ color: '#22C55E' }} />
                : <Circle size={9} style={{ color: isRequired ? '#374151' : '#2D3748' }} />}
              <span className="text-[9px] font-medium" style={{ color: val ? '#9CA3AF' : '#4B5563' }}>
                {val ? val.split(',')[0].substring(0, 14) : label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Message bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ msg, onPortSelect, onModeSelect }) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-none text-xs font-semibold leading-relaxed"
          style={{ background: '#3B82F6', color: '#fff' }}>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }}>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === 'mode-select') {
    return (
      <div className="flex justify-start flex-col gap-2">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: '#1F2937', color: '#D1D5DB', border: '1px solid #374151' }}>
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

  if (msg.role === 'clarify') {
    return (
      <div className="flex justify-start flex-col gap-2">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: '#1F2937', color: '#D1D5DB', border: '1px solid #374151' }}>
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
        <div className="max-w-[92%] px-3.5 py-3 rounded-2xl rounded-tl-none text-xs leading-relaxed"
          style={{ background: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={12} style={{ color: '#22C55E' }} />
            <span className="font-black text-[10px] uppercase tracking-wider" style={{ color: '#22C55E' }}>Route Ready</span>
          </div>
          {msg.text}
        </div>
      </div>
    );
  }

  // Standard AI message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs leading-relaxed"
        style={{ background: '#1F2937', color: '#D1D5DB', border: '1px solid #374151' }}>
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
    date: null, cargo: null, priority: null,
  });
  const [convHistory, setConvHistory] = useState([]);
  const [msgId, setMsgId] = useState(1);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const srRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isThinking]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      const initialMode = MODE_MAP[freightMode] || 'sea';
      const initState = { origin: null, destination: null, mode: initialMode, date: null, cargo: null, priority: null };
      setConvState(initState);
      setMessages([WELCOME]);
      setConvHistory([]);
      setMsgId(1);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, freightMode]);

  const addMsg = useCallback((role, text, extra = {}) => {
    setMsgId(prev => {
      const id = prev + 1;
      setMessages(msgs => [...msgs, { id, role, text, ...extra }]);
      return id;
    });
  }, []);

  const handleSend = useCallback(async (text, override = {}) => {
    const cmd = (text || input).trim();
    if (!cmd || isThinking) return;

    setInput('');
    addMsg('user', cmd);
    setIsThinking(true);

    const newHistory = [...convHistory, { role: 'user', text: cmd }];
    const stateToSend = { ...convState, ...override };

    try {
      const res = await axios.post(`${BASE_URL}/api/ai/agent/chat`, {
        message: cmd,
        state: stateToSend,
        history: newHistory,
      }, { timeout: 30000 });

      const data = res.data;
      const updatedState = { ...stateToSend, ...(data.state || {}) };
      setConvState(updatedState);

      const aiHistory = [...newHistory, { role: 'ai', text: data.message }];
      setConvHistory(aiHistory);

      if (data.type === 'COMPLETE' && data.source && data.destination) {
        addMsg('complete', data.message);
        const saved = saveRouteToHistory({ state: updatedState, source: data.source, destination: data.destination });
        onRouteSaved?.(saved);
        setTimeout(() => {
          onRouteGenerated?.({
            source: data.source,
            destination: data.destination,
            mode: updatedState.mode,
          });
          onClose?.();
        }, 1200);
      } else if (data.type === 'CLARIFY') {
        // Check if it's a mode question disguised as clarify
        const msgLower = data.message?.toLowerCase() || '';
        const isModeQ = msgLower.includes('mode') || msgLower.includes('sea') || msgLower.includes('ship') || msgLower.includes('transport');
        if (!updatedState.mode && isModeQ && (!data.options || data.options.length === 0)) {
          addMsg('mode-select', data.message);
        } else {
          addMsg('clarify', data.message, { clarifyField: data.clarifyField || 'origin', options: data.options || [] });
        }
      } else if (data.type === 'ASK') {
        // If asking for mode and none set yet, show mode chips
        const msgLower = data.message?.toLowerCase() || '';
        const isModeQ = !updatedState.mode && (msgLower.includes('mode') || msgLower.includes('transport') || msgLower.includes('sea') || msgLower.includes('air'));
        if (isModeQ) {
          addMsg('mode-select', data.message);
        } else {
          addMsg('ai', data.message);
        }
      } else {
        addMsg('ai', data.message || "Got it, let's keep going.");
      }
    } catch (err) {
      addMsg('error', 'Connection issue — please try again.');
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, convState, convHistory, addMsg, onRouteGenerated, onClose, onRouteSaved]);

  const handlePortSelect = useCallback((portName, field) => {
    addMsg('user', portName);
    const stateOverride = field === 'origin' ? { origin: portName } : { destination: portName };
    const updatedState = { ...convState, ...stateOverride };
    setConvState(updatedState);
    setIsThinking(true);

    // Check if we have enough to generate
    if (updatedState.origin && updatedState.destination && updatedState.mode) {
      axios.post(`${BASE_URL}/api/ai/agent/chat`, {
        message: `I've selected ${portName} as my ${field}`,
        state: updatedState,
        history: convHistory,
      }, { timeout: 30000 }).then(res => {
        const data = res.data;
        const finalState = { ...updatedState, ...(data.state || {}) };
        setConvState(finalState);
        if (data.type === 'COMPLETE' && data.source && data.destination) {
          addMsg('complete', data.message);
          const saved = saveRouteToHistory({ state: finalState, source: data.source, destination: data.destination });
          onRouteSaved?.(saved);
          setTimeout(() => { onRouteGenerated?.({ source: data.source, destination: data.destination, mode: finalState.mode }); onClose?.(); }, 1200);
        } else {
          addMsg('ai', data.message);
        }
      }).catch(() => {
        addMsg('ai', `Got it — ${portName} set as ${field}. ${field === 'origin' ? 'Now, where are you shipping to?' : 'Great! What transport mode would you like?'}`);
      }).finally(() => setIsThinking(false));
    } else {
      const nextQ = !updatedState.destination
        ? "Great choice! Now, where are you shipping to?"
        : !updatedState.mode
        ? "Almost there! Which transport mode — Sea, Air, Rail, or Road?"
        : "Let me calculate your route now...";
      setTimeout(() => { addMsg('ai', nextQ); setIsThinking(false); }, 400);
    }
  }, [convState, convHistory, addMsg, onRouteGenerated, onClose, onRouteSaved]);

  const handleModeSelect = useCallback((mode) => {
    const modeLabels = { sea: 'Sea (maritime)', air: 'Air freight', rail: 'Rail', truck: 'Road' };
    addMsg('user', modeLabels[mode] || mode);
    const updatedState = { ...convState, mode };
    setConvState(updatedState);
    // Feed back to agent
    handleSend(modeLabels[mode] || mode, { mode });
  }, [convState, addMsg, handleSend]);

  const startVoice = useCallback(() => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { addMsg('error', 'Speech recognition not supported in this browser.'); return; }
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
          handleSend(t);
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setLiveTranscript(interim);
    };
    sr.start();
  }, [isListening, handleSend, addMsg]);

  const handleReset = useCallback(() => {
    const initMode = MODE_MAP[freightMode] || 'sea';
    setConvState({ origin: null, destination: null, mode: initMode, date: null, cargo: null, priority: null });
    setConvHistory([]);
    setMessages([WELCOME]);
    setMsgId(1);
  }, [freightMode]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[1100]"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 z-[1200] flex flex-col"
            style={{ width: 360, background: '#111827', borderLeft: '1px solid #374151' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                  <Bot size={15} style={{ color: '#3B82F6' }} />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: '#F9FAFB' }}>Routy AI</p>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'animate-pulse' : 'animate-pulse'}`}
                      style={{ background: isThinking ? '#F59E0B' : isListening ? '#EF4444' : '#22C55E' }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#6B7280' }}>
                      {isThinking ? 'Thinking…' : isListening ? 'Listening…' : 'Online'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleReset} title="Reset conversation"
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ color: '#6B7280' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
                  <RotateCcw size={13} />
                </button>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ color: '#6B7280' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
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
              <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ borderTop: '1px solid #374151' }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => handleSend(s)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all flex-shrink-0"
                    style={{ background: '#1F2937', color: '#6B7280', border: '1px solid #374151' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#3B82F6'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.borderColor = '#374151'; }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Voice listening bar */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-2 flex items-center gap-3 flex-shrink-0"
                  style={{ borderTop: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
                  <div className="flex gap-0.5 items-center">
                    {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
                      <div key={i} className="w-0.5 rounded-full animate-pulse"
                        style={{ height: `${h * 20}px`, background: '#EF4444', animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: '#FCA5A5' }}>Listening — speak now</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid #374151' }}>
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl transition-all ${isListening ? 'border-red-500' : 'border-transparent focus-within:border-blue-500'}`}
                style={{ background: '#1F2937', border: `2px solid ${isListening ? '#EF4444' : '#374151'}` }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isThinking) { e.preventDefault(); handleSend(); } }}
                  placeholder={isListening ? 'Listening…' : isThinking ? 'Routy is thinking…' : 'Type your message…'}
                  disabled={isListening || isThinking}
                  className="flex-1 bg-transparent outline-none text-xs font-medium"
                  style={{ color: '#F9FAFB', caretColor: '#3B82F6' }}
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
                    background: input.trim() && !isThinking ? '#3B82F6' : '#1F2937',
                    color: input.trim() && !isThinking ? '#fff' : '#374151',
                    cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed',
                  }}>
                  {isThinking
                    ? <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    : <Send size={12} />}
                </button>
              </div>
              <p className="text-center text-[9px] mt-1.5 font-medium" style={{ color: '#374151' }}>
                Powered by Gemini · RouteGuardian AI
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default RoutyChatPanel;
