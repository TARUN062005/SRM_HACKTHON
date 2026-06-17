import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { loadRouteHistory, clearRouteHistory } from '../components/RoutyChatPanel';
import {
  Anchor, Plane, Truck, ChevronRight, Trash2,
  Package, MapPin, Clock, Shield, AlertTriangle, RefreshCw,
  ArrowRight, Activity, Loader2
} from 'lucide-react';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, itemName }) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />
        {/* Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md p-6 rounded-[24px] bg-slate-900 border border-slate-800 shadow-2xl text-white z-10 animate-fade-in"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Delete Shipment?</h3>
              <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            Are you sure you want to permanently delete the shipment from <span className="font-bold text-white">{itemName}</span>?
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:bg-white/5 border border-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-red-600 hover:bg-red-500 text-white"
            >
              Delete
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const MODE_ICONS  = { sea: Anchor, ship: Anchor, air: Plane, truck: Truck, road: Truck };
const MODE_COLORS = { sea: '#00C2FF', ship: '#00C2FF', air: '#00C2FF', truck: '#00C2FF', road: '#00C2FF' };
const MODE_LABELS = { sea: 'Maritime', ship: 'Maritime', air: 'Air Freight', truck: 'Road', road: 'Road' };

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

const formatDuration = (seconds, mode) => {
  if (!seconds) return '—';
  if (mode === 'sea' || mode === 'ship') {
    const days = seconds / 86400;
    return days >= 1 ? `${days.toFixed(1)} days` : `${(seconds / 3600).toFixed(0)} hrs`;
  }
  if (mode === 'air') {
    const hrs = seconds / 3600;
    return hrs >= 1 ? `${hrs.toFixed(1)} hrs` : `${(seconds / 60).toFixed(0)} min`;
  }
  return `${(seconds / 60).toFixed(0)} min`;
};

const formatDistance = (meters) => {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(0)} km`;
};

const ShipmentsPage = () => {
  const navigate = useNavigate();
  const [routes, setRoutes]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]   = useState('all');
  const [sortBy, setSortBy]   = useState('date');
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const [loadingRouteId, setLoadingRouteId] = useState(null);

  const handleDeleteShipment = useCallback(async () => {
    if (!shipmentToDelete) return;
    try {
      const res = await axios.delete(`/api/ai/shipment/${shipmentToDelete.id}`);
      if (res.data?.success) {
        setRoutes(prev => prev.filter(r => r.id !== shipmentToDelete.id));
        if (selected === shipmentToDelete.id) {
          setSelected(null);
        }
        setDeleteModalOpen(false);
        setShipmentToDelete(null);
        toast.success("Shipment deleted successfully");
      } else {
        toast.error(res.data?.message || "Failed to delete shipment");
      }
    } catch (err) {
      console.error('[ShipmentsPage] Error deleting shipment:', err.message);
      toast.error("Failed to delete shipment");
    }
  }, [shipmentToDelete, selected]);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ai/shipments');
      if (res.data?.success) {
        setRoutes(res.data.shipments.map(s => ({
          id: s.id,
          origin: s.origin,
          destination: s.destination,
          mode: s.mode === 'road' ? 'truck' : s.mode === 'sea' ? 'ship' : 'air',
          distance: s.distance,
          eta: s.eta,
          riskScore: s.riskScore,
          safetyScore: s.safetyScore,
          routeGeometry: s.routeGeometry,
          timestamp: new Date(s.createdAt).getTime(),
          severity: s.riskScore >= 68 ? 'CRITICAL' : s.riskScore >= 35 ? 'CAUTION' : 'STABLE',
          cargo: s.cargo,
          priority: s.priority,
          date: s.date,
          time: s.time,
          weatherSummary: s.weatherSummary,
          riskSummary: s.riskSummary,
          aiReport: s.aiReport
        })));
      }
    } catch (err) {
      console.error('[ShipmentsPage] Error fetching shipments:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const handleClear = useCallback(async () => {
    if (!window.confirm("Are you sure you want to clear all shipment logs?")) return;
    try {
      const res = await axios.delete('/api/ai/shipments');
      if (res.data?.success) {
        setRoutes([]);
        setSelected(null);
      }
    } catch (err) {
      console.error('[ShipmentsPage] Error clearing shipments:', err.message);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchShipments();
  }, [fetchShipments]);

  const handleOpenRoute = useCallback(async (r) => {
    if (loadingRouteId) return;
    const startTime = Date.now();
    setLoadingRouteId(r.id);
    try {
      const res = await axios.get(`/api/ai/shipment/${r.id}`);
      const duration = Date.now() - startTime;
      console.log(`[SHIPMENT LOAD TIME] Loaded shipment ${r.id} in ${duration}ms`);
      if (res.data?.success) {
        const fullShipment = res.data.shipment;
        sessionStorage.setItem('pendingRoute', JSON.stringify({
          origin: fullShipment.origin,
          destination: fullShipment.destination,
          mode: fullShipment.mode === 'truck' ? 'road' : fullShipment.mode === 'ship' ? 'sea' : 'air',
          distance: fullShipment.distance,
          eta: fullShipment.eta,
          riskScore: fullShipment.riskScore,
          safetyScore: fullShipment.safetyScore,
          routeGeometry: fullShipment.routeGeometry,
          cargo: fullShipment.cargo,
          priority: fullShipment.priority,
          date: fullShipment.date,
          time: fullShipment.time,
          weatherSummary: fullShipment.weatherSummary,
          riskSummary: fullShipment.riskSummary,
          aiReport: fullShipment.aiReport,
          newsAlerts: fullShipment.newsAlerts,
          waypointReports: fullShipment.waypointReports,
          loadTimeMs: duration
        }));
        navigate('/dashboard');
      } else {
        toast.error("Failed to load shipment details");
      }
    } catch (err) {
      console.error('[ShipmentsPage] Error fetching full shipment details:', err.message);
      toast.error("Failed to load shipment details");
    } finally {
      setLoadingRouteId(null);
    }
  }, [navigate, loadingRouteId]);

  const sortedAndFiltered = useMemo(() => {
    const list = filter === 'all'
      ? [...routes]
      : routes.filter(r => (r.mode === filter || (filter === 'sea' && r.mode === 'ship')));

    return list.sort((a, b) => {
      if (sortBy === 'date') {
        return b.timestamp - a.timestamp;
      }
      if (sortBy === 'distance') {
        return b.distance - a.distance;
      }
      if (sortBy === 'risk') {
        return (b.riskScore ?? 0) - (a.riskScore ?? 0);
      }
      if (sortBy === 'safety') {
        return (b.safetyScore ?? 0) - (a.safetyScore ?? 0);
      }
      return 0;
    });
  }, [routes, filter, sortBy]);

  const stats = {
    total:    routes.length,
    critical: routes.filter(r => r.severity === 'CRITICAL').length,
    stable:   routes.filter(r => !r.severity || r.severity === 'STABLE').length,
    modes:    [...new Set(routes.map(r => r.mode))].length,
  };

  return (
    <div className="dashboard-shell h-full flex flex-col text-white">

      {/* Page header */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300 mb-1">Shipment archive</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Shipments</h1>
            <p className="text-sm mt-0.5 text-slate-400">
              Your route history — click any shipment to reload it on the map
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="rg-btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
            {routes.length > 0 && (
              <button
                onClick={handleClear}
                className="rg-btn-danger flex items-center gap-1.5 px-3 py-2 text-xs"
              >
                <Trash2 size={12} />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        {routes.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Routes', value: stats.total,    Icon: Package,       color: '#3B82F6' },
              { label: 'Critical Risk', value: stats.critical, Icon: AlertTriangle, color: '#EF4444' },
              { label: 'Stable Routes', value: stats.stable,   Icon: Shield,        color: '#22C55E' },
              { label: 'Modes Used',   value: stats.modes,    Icon: Activity,      color: '#A78BFA' },
            ].map(({ label, value, Icon, color }) => (
              <div
                key={label}
                className="dashboard-surface rounded-[1.5rem] px-4 py-3"
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

        {/* Filter & Sort tabs */}
        {routes.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap border-b border-slate-800/60 pb-4">
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'all',   label: 'All' },
                { value: 'sea',   label: 'Maritime' },
                { value: 'air',   label: 'Air' },
                { value: 'truck', label: 'Road' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all dashboard-chip"
                  style={{
                    background: filter === value ? 'rgba(0,194,255,0.14)' : 'rgba(15,23,42,0.72)',
                    color: filter === value ? '#E0F2FE' : '#94A3B8',
                    border: `1px solid ${filter === value ? 'rgba(0,194,255,0.28)' : 'rgba(148,163,184,0.12)'}`,
                  }}
                >
                  {label}
                  {value === 'all' && <span className="ml-1.5 opacity-70">{routes.length}</span>}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Sort by:</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-xs font-bold rounded-xl pl-3 pr-8 py-1.5 text-slate-300 focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '14px',
                  }}
                >
                  <option value="date">Date Added</option>
                  <option value="distance">Distance</option>
                  <option value="risk">Risk Score</option>
                  <option value="safety">Safety Score</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        {sortedAndFiltered.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div
              className="w-16 h-16 rounded-[1.25rem] flex items-center justify-center mb-4 dashboard-surface"
            >
              <Package size={28} style={{ color: '#64748B' }} />
            </div>
            <p className="text-base font-bold mb-1 text-slate-300">
              {routes.length === 0 ? 'No shipments yet' : 'No shipments match this filter'}
            </p>
            <p className="text-sm text-center max-w-xs text-slate-500">
              {routes.length === 0
                ? 'Plan a route from the Dashboard or Routes Map and it will appear here automatically.'
                : 'Try a different filter to see more routes.'}
            </p>
            {routes.length === 0 && (
              <button
                onClick={() => navigate('/dashboard')}
                className="rg-btn-primary mt-5 flex items-center gap-2 px-5 py-2.5 text-sm"
              >
                Plan a Route <ArrowRight size={14} />
              </button>
            )}
          </motion.div>
        ) : (
          /* Shipment table */
          <div className="overflow-x-auto rounded-[24px] border border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
            <table className="w-full border-collapse text-left text-sm text-slate-350">
              <thead className="bg-slate-950/90 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th scope="col" className="px-6 py-4">Origin & Destination</th>
                  <th scope="col" className="px-6 py-4">Mode</th>
                  <th scope="col" className="px-6 py-4">Search Date</th>
                  <th scope="col" className="px-6 py-4 text-center">Risk Score</th>
                  <th scope="col" className="px-6 py-4 text-center">Safety Score</th>
                  <th scope="col" className="px-6 py-4 text-right">Distance</th>
                  <th scope="col" className="px-6 py-4 text-right">Duration</th>
                  <th scope="col" className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedAndFiltered.map((r, idx) => {
                  const ModeIcon   = MODE_ICONS[r.mode]   || Anchor;
                  const modeColor  = MODE_COLORS[r.mode]  || '#3B82F6';
                  const modeLabel  = MODE_LABELS[r.mode]  || r.mode;
                  const sev        = r.severity || 'STABLE';
                  const sevStyle   = SEV_STYLES[sev] || SEV_STYLES.STABLE;

                  return (
                    <tr
                      key={`shipment-row-${r.id || idx}`}
                      onClick={() => handleOpenRoute(r)}
                      className="hover:bg-slate-800/30 transition-all cursor-pointer group"
                    >
                      {/* Origin & Destination */}
                      <td className="px-6 py-4.5">
                        <div className="flex flex-col gap-1 max-w-[280px]">
                          <div className="flex items-center gap-1.5 text-white font-extrabold text-xs sm:text-sm">
                            <span className="truncate" title={r.origin}>{r.origin?.split(',')[0] || 'Unknown'}</span>
                            <ArrowRight size={12} className="text-slate-500 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                            <span className="truncate" title={r.destination}>{r.destination?.split(',')[0] || 'Unknown'}</span>
                          </div>
                          {r.cargo && (
                            <span className="text-[10px] text-slate-500 font-bold truncate">{r.cargo}</span>
                          )}
                        </div>
                      </td>

                      {/* Mode */}
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${modeColor}14` }}
                          >
                            <ModeIcon size={13} style={{ color: modeColor }} />
                          </div>
                          <span className="text-xs font-bold text-slate-300">{modeLabel}</span>
                        </div>
                      </td>

                      {/* Search Date */}
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-300">{formatDate(r.timestamp)}</span>
                          <span className="text-[10px] text-slate-500 font-semibold mt-0.5">{timeAgo(r.timestamp)}</span>
                        </div>
                      </td>

                      {/* Risk Score */}
                      <td className="px-6 py-4.5 text-center whitespace-nowrap">
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-black"
                          style={{ background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}` }}
                        >
                          {r.riskScore != null ? r.riskScore : '—'}
                        </span>
                      </td>

                      {/* Safety Score */}
                      <td className="px-6 py-4.5 text-center whitespace-nowrap">
                        <span
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                        >
                          {r.safetyScore != null ? r.safetyScore : '—'}
                        </span>
                      </td>

                      {/* Distance */}
                      <td className="px-6 py-4.5 text-right whitespace-nowrap font-bold text-slate-300 text-xs">
                        {formatDistance(r.distance)}
                      </td>

                      {/* Duration */}
                      <td className="px-6 py-4.5 text-right whitespace-nowrap font-bold text-slate-300 text-xs">
                        {formatDuration(r.eta, r.mode)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenRoute(r)}
                            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800/80 text-cyan-400 hover:text-cyan-300 transition-all hover:scale-105 flex items-center justify-center min-w-[28px] min-h-[28px]"
                            title="Load on Map"
                            disabled={loadingRouteId !== null}
                          >
                            {loadingRouteId === r.id ? (
                              <Loader2 size={14} className="animate-spin text-cyan-400" />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setShipmentToDelete(r);
                              setDeleteModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-red-500/10 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 transition-all hover:scale-105"
                            title="Delete Shipment"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setShipmentToDelete(null); }}
        onConfirm={handleDeleteShipment}
        itemName={`${shipmentToDelete?.origin?.split(',')[0] || 'Unknown'} to ${shipmentToDelete?.destination?.split(',')[0] || 'Unknown'}`}
      />
    </div>
  );
};

export default ShipmentsPage;
