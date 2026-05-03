import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { loadRouteHistory, clearRouteHistory } from '../components/RoutyChatPanel';
import {
  Anchor, Plane, Train, Truck, ChevronRight, Trash2,
  Package, MapPin, Clock, Shield, AlertTriangle, RefreshCw,
  ArrowRight, Activity,
} from 'lucide-react';

const MODE_ICONS  = { sea: Anchor, ship: Anchor, air: Plane, rail: Train, truck: Truck, road: Truck };
const MODE_COLORS = { sea: '#0d47a1', ship: '#0d47a1', air: '#0288d1', rail: '#6d28d9', truck: '#c2410c', road: '#c2410c' };
const MODE_LABELS = { sea: 'Maritime', ship: 'Maritime', air: 'Air Freight', rail: 'Rail', truck: 'Road', road: 'Road' };

const SEV_STYLES = {
  CRITICAL: { bg: 'rgba(239,68,68,0.1)',  color: '#EF4444', border: 'rgba(239,68,68,0.25)' },
  CAUTION:  { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
  STABLE:   { bg: 'rgba(34,197,94,0.1)',  color: '#22C55E', border: 'rgba(34,197,94,0.25)' },
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ShipmentsPage = () => {
  const navigate = useNavigate();
  const [routes, setRoutes]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]   = useState('all');

  useEffect(() => {
    setRoutes(loadRouteHistory());
  }, []);

  const handleClear = useCallback(() => {
    clearRouteHistory();
    setRoutes([]);
    setSelected(null);
  }, []);

  const handleRefresh = useCallback(() => {
    setRoutes(loadRouteHistory());
  }, []);

  const handleOpenRoute = useCallback((r) => {
    // Store selected route in sessionStorage so Dashboard can pick it up
    sessionStorage.setItem('pendingRoute', JSON.stringify(r));
    navigate('/dashboard');
  }, [navigate]);

  const filtered = filter === 'all'
    ? routes
    : routes.filter(r => (r.mode === filter || (filter === 'sea' && r.mode === 'ship')));

  const stats = {
    total:    routes.length,
    critical: routes.filter(r => r.severity === 'CRITICAL').length,
    stable:   routes.filter(r => !r.severity || r.severity === 'STABLE').length,
    modes:    [...new Set(routes.map(r => r.mode))].length,
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#0B1220' }}>

      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-black" style={{ color: '#F9FAFB' }}>Shipments</h1>
            <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
              Your route history — click any shipment to reload it on the map
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: '#1F2937', color: '#9CA3AF', border: '1px solid #374151' }}
              onMouseEnter={e => e.currentTarget.style.color = '#F9FAFB'}
              onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
            {routes.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
              >
                <Trash2 size={12} />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        {routes.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Routes', value: stats.total,    Icon: Package,       color: '#3B82F6' },
              { label: 'Critical Risk', value: stats.critical, Icon: AlertTriangle, color: '#EF4444' },
              { label: 'Stable Routes', value: stats.stable,   Icon: Shield,        color: '#22C55E' },
              { label: 'Modes Used',   value: stats.modes,    Icon: Activity,      color: '#A78BFA' },
            ].map(({ label, value, Icon, color }) => (
              <div
                key={label}
                className="px-4 py-3 rounded-2xl"
                style={{ background: '#1F2937', border: '1px solid #374151' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon size={14} style={{ color }} />
                </div>
                <p className="text-2xl font-black" style={{ color }}>{value}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#6B7280' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        {routes.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all',   label: 'All' },
              { value: 'sea',   label: 'Maritime' },
              { value: 'air',   label: 'Air' },
              { value: 'rail',  label: 'Rail' },
              { value: 'truck', label: 'Road' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: filter === value ? 'rgba(59,130,246,0.15)' : '#1F2937',
                  color: filter === value ? '#3B82F6' : '#6B7280',
                  border: `1px solid ${filter === value ? 'rgba(59,130,246,0.3)' : '#374151'}`,
                }}
              >
                {label}
                {value === 'all' && <span className="ml-1.5 opacity-70">{routes.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}
            >
              <Package size={28} style={{ color: '#374151' }} />
            </div>
            <p className="text-base font-bold mb-1" style={{ color: '#6B7280' }}>
              {routes.length === 0 ? 'No shipments yet' : 'No shipments match this filter'}
            </p>
            <p className="text-sm text-center max-w-xs" style={{ color: '#374151' }}>
              {routes.length === 0
                ? 'Plan a route from the Dashboard or Routes Map and it will appear here automatically.'
                : 'Try a different filter to see more routes.'}
            </p>
            {routes.length === 0 && (
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ background: '#3B82F6', color: '#fff' }}
                onMouseEnter={e => e.currentTarget.style.background = '#2563EB'}
                onMouseLeave={e => e.currentTarget.style.background = '#3B82F6'}
              >
                Plan a Route <ArrowRight size={14} />
              </button>
            )}
          </motion.div>
        ) : (
          /* Shipment list */
          <div className="space-y-2.5">
            <AnimatePresence>
              {filtered.map((r, idx) => {
                const ModeIcon   = MODE_ICONS[r.mode]   || Anchor;
                const modeColor  = MODE_COLORS[r.mode]  || '#3B82F6';
                const modeLabel  = MODE_LABELS[r.mode]  || r.mode;
                const sev        = r.severity || 'STABLE';
                const sevStyle   = SEV_STYLES[sev] || SEV_STYLES.STABLE;
                const isSelected = selected === r.id;

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    {/* Main row */}
                    <div
                      className="flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all"
                      style={{
                        background: isSelected ? '#1F2937' : '#111827',
                        border: isSelected ? '1px solid #374151' : '1px solid rgba(55,65,81,0.5)',
                      }}
                      onClick={() => setSelected(isSelected ? null : r.id)}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#1F2937'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#111827'; }}
                    >
                      {/* Mode icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${modeColor}18` }}
                      >
                        <ModeIcon size={18} style={{ color: modeColor }} />
                      </div>

                      {/* Route info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-bold truncate" style={{ color: '#F9FAFB' }}>
                            {r.origin?.split(',')[0] || 'Unknown'}
                          </span>
                          <ArrowRight size={13} style={{ color: '#4B5563', flexShrink: 0 }} />
                          <span className="text-sm font-bold truncate" style={{ color: '#F9FAFB' }}>
                            {r.destination?.split(',')[0] || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${modeColor}18`, color: modeColor }}
                          >
                            {modeLabel}
                          </span>
                          {r.cargo && (
                            <span className="text-[10px]" style={{ color: '#6B7280' }}>
                              {r.cargo}
                            </span>
                          )}
                          <span className="text-[10px]" style={{ color: '#4B5563' }}>
                            {timeAgo(r.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Risk badge */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {r.severity && (
                          <span
                            className="text-[10px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}` }}
                          >
                            {sev}
                          </span>
                        )}
                        {r.riskScore != null && (
                          <div className="text-center">
                            <p className="text-lg font-black leading-none" style={{ color: sevStyle.color }}>
                              {r.riskScore}
                            </p>
                            <p className="text-[8px] font-bold uppercase" style={{ color: '#6B7280' }}>Risk</p>
                          </div>
                        )}
                        <ChevronRight
                          size={16}
                          style={{ color: '#374151', transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                        />
                      </div>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div
                            className="mx-2 mb-1 px-5 py-4 rounded-b-2xl flex items-center justify-between gap-4 flex-wrap"
                            style={{ background: '#1F2937', borderTop: '1px solid #374151' }}
                          >
                            <div className="flex gap-6 flex-wrap">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Origin</p>
                                <div className="flex items-center gap-1.5">
                                  <MapPin size={11} style={{ color: '#22C55E' }} />
                                  <p className="text-xs font-semibold" style={{ color: '#F9FAFB' }}>{r.origin || '—'}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Destination</p>
                                <div className="flex items-center gap-1.5">
                                  <MapPin size={11} style={{ color: '#EF4444' }} />
                                  <p className="text-xs font-semibold" style={{ color: '#F9FAFB' }}>{r.destination || '—'}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Date Added</p>
                                <div className="flex items-center gap-1.5">
                                  <Clock size={11} style={{ color: '#6B7280' }} />
                                  <p className="text-xs font-semibold" style={{ color: '#9CA3AF' }}>{formatDate(r.timestamp)}</p>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleOpenRoute(r)}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0"
                              style={{ background: '#3B82F6', color: '#fff' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#2563EB'}
                              onMouseLeave={e => e.currentTarget.style.background = '#3B82F6'}
                            >
                              Open on Map <ArrowRight size={12} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShipmentsPage;
