import React, { useState } from 'react';
import { X, Shield, Newspaper, CloudRain, ArrowRight, ExternalLink, TrendingUp, ChevronDown, ChevronUp, Radio, Zap, AlertTriangle, Anchor, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SEV = {
  CRITICAL: { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', textCls: 'text-red-600',   bgCls: 'bg-red-50',   borderCls: 'border-red-200',   badgeCls: 'bg-red-100 text-red-600',   dotCls: 'bg-red-500'   },
  HIGH:     { label: 'HIGH',     color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', textCls: 'text-orange-600', bgCls: 'bg-orange-50', borderCls: 'border-orange-200', badgeCls: 'bg-orange-100 text-orange-600', dotCls: 'bg-orange-500' },
  MODERATE: { label: 'MODERATE', color: '#d97706', bg: '#fffbeb', border: '#fde68a', textCls: 'text-amber-600',  bgCls: 'bg-amber-50',  borderCls: 'border-amber-200',  badgeCls: 'bg-amber-100 text-amber-600',  dotCls: 'bg-amber-500'  },
  CAUTION:  { label: 'CAUTION',  color: '#d97706', bg: '#fffbeb', border: '#fde68a', textCls: 'text-amber-600',  bgCls: 'bg-amber-50',  borderCls: 'border-amber-200',  badgeCls: 'bg-amber-100 text-amber-600',  dotCls: 'bg-amber-500'  },
  STABLE:   { label: 'STABLE',   color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', textCls: 'text-emerald-600',bgCls: 'bg-emerald-50',borderCls: 'border-emerald-200',badgeCls: 'bg-emerald-100 text-emerald-600',dotCls: 'bg-emerald-500' },
};

const TYPE_ICON = { conflict: '⚔️', piracy: '🏴‍☠️', dispute: '🚩', weather: '🌩️' };

const RiskGauge = ({ score, severity }) => {
  const cfg = SEV[severity] || SEV.STABLE;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: 92, height: 92 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={r} stroke="#f1f5f9" strokeWidth="7" fill="none" />
        <circle cx="46" cy="46" r={r}
          stroke={cfg.color} strokeWidth="7" fill="none"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${cfg.color}55)`, transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-black text-slate-900 leading-none">{score}</span>
        <span className="text-[7px] font-black uppercase tracking-widest mt-0.5" style={{ color: cfg.color }}>/ 100</span>
      </div>
    </div>
  );
};

const ThreatZoneRow = ({ zone }) => {
  const [open, setOpen] = useState(false);
  const cfg = SEV[zone.severity] || SEV.MODERATE;
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${cfg.borderCls} ${cfg.bgCls}`}>
      <button className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => setOpen(v => !v)}>
        <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[zone.type] || '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: cfg.color + '22', color: cfg.color }}>
              {cfg.label}
            </span>
            <span className="text-[8px] font-bold text-slate-400 uppercase">{zone.type}</span>
            {zone.newsConfirmed && (
              <span className="text-[7px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Live Confirmed</span>
            )}
          </div>
          <p className="text-[11px] font-bold text-slate-800 leading-tight">{zone.name}</p>
        </div>
        {open
          ? <ChevronUp size={12} className="text-slate-400 flex-shrink-0 mt-1.5" />
          : <ChevronDown size={12} className="text-slate-400 flex-shrink-0 mt-1.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <p className="px-3 pb-3 pt-1 text-[11px] text-slate-600 leading-relaxed border-t" style={{ borderColor: cfg.color + '30' }}>
              {zone.reason}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const RiskIntelPanel = ({
  intelligence,
  isOpen,
  onClose,
  allRoutes = [],
  activeRouteIndex = 0,
  onSwitchRoute,
  freightMode = 'ship',
}) => {
  const [tab, setTab] = useState('zones');

  const intel       = intelligence || {};
  const riskScore   = intel.riskScore   ?? 0;
  const severity    = intel.severity    ?? 'STABLE';
  const riskZones   = intel.riskZones   ?? [];
  const newsFeed    = intel.newsFeed    ?? [];
  const waypoints   = intel.waypointReports ?? [];
  const weatherBad  = waypoints.filter(w => w.code >= 61);
  const cfg         = SEV[severity] || SEV.STABLE;

  const saferRouteIndex = allRoutes.findIndex((r, i) =>
    i !== activeRouteIndex && (r.intelligence?.riskScore ?? 999) < riskScore
  );
  const saferRoute = saferRouteIndex !== -1 ? allRoutes[saferRouteIndex] : null;

  const tabs = [
    { id: 'zones',   label: `Threats${riskZones.length > 0 ? ` (${riskZones.length})` : ''}` },
    { id: 'news',    label: `Intel${newsFeed.length > 0 ? ` (${newsFeed.length})` : ''}` },
    { id: 'weather', label: `Weather${weatherBad.length > 0 ? ' ⚠' : ''}` },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 290, damping: 30 }}
          className="absolute right-0 top-0 bottom-0 z-[1500] w-[340px] bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden border-l border-slate-100"
        >
          {/* ── Header ────────────────────────────────────── */}
          <div className="px-4 py-3 bg-slate-950 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: cfg.color }} />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Route Intelligence</span>
            </div>
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-200 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* ── Risk gauge + summary ───────────────────────── */}
          <div className="px-4 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-4">
              <RiskGauge score={riskScore} severity={severity} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Threat Assessment</p>
                <p className="text-[12px] font-bold text-slate-800 leading-snug line-clamp-4">
                  {intel.summary || 'Route corridor assessed. No significant threats detected.'}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Radio size={9} className="animate-pulse flex-shrink-0" style={{ color: cfg.color }} />
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: cfg.color }}>
                    {riskZones.length > 0
                      ? `${riskZones.length} threat zone${riskZones.length !== 1 ? 's' : ''} on corridor`
                      : 'No active threat zones detected'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────── */}
          <div className="flex border-b border-slate-100 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2"
                style={tab === t.id
                  ? { borderColor: cfg.color, color: cfg.color }
                  : { borderColor: 'transparent', color: '#94a3b8' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ───────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">

            {/* ZONES */}
            {tab === 'zones' && (
              <div className="p-3 space-y-2">
                {riskZones.length > 0 ? (
                  riskZones.map((zone, i) => <ThreatZoneRow key={i} zone={zone} />)
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                      <Shield size={26} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">Corridor Clear</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">No known active threat zones were detected along this route corridor.</p>
                  </div>
                )}
              </div>
            )}

            {/* NEWS / INTEL */}
            {tab === 'news' && (
              <div className="p-3 space-y-2">
                {newsFeed.length > 0 ? (
                  newsFeed.map((article, i) => {
                    const aCfg = SEV[article.severity === 'high' ? 'CRITICAL' : article.severity === 'medium' ? 'CAUTION' : 'STABLE'] || SEV.STABLE;
                    return (
                      <div key={i} className={`p-3 rounded-xl border ${aCfg.borderCls} bg-white hover:shadow-sm transition-all`}>
                        <div className="flex items-start gap-2 mb-2">
                          <Newspaper size={11} className="flex-shrink-0 mt-0.5" style={{ color: aCfg.color }} />
                          <p className="text-[11px] font-semibold text-slate-800 leading-snug flex-1">{article.title}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${aCfg.badgeCls}`}>
                              {article.type || 'alert'}
                            </span>
                            {article.date && (
                              <span className="text-[8px] text-slate-400">
                                {new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {article.link && (
                            <a href={article.link} target="_blank" rel="noreferrer"
                              className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline flex-shrink-0">
                              View <ExternalLink size={8} />
                            </a>
                          )}
                        </div>
                        {article.impact && (
                          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-slate-50">
                            {article.impact}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                      <Newspaper size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No News Alerts</p>
                    <p className="text-xs text-slate-400 mt-1">No threat-related news detected for this route corridor.</p>
                  </div>
                )}
              </div>
            )}

            {/* WEATHER */}
            {tab === 'weather' && (
              <div className="p-3 space-y-2">
                {weatherBad.length > 0 ? (
                  <>
                    <div className="flex items-center gap-1.5 px-1 mb-1">
                      <AlertTriangle size={10} className="text-amber-500" />
                      <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
                        {weatherBad.length} active weather hazard{weatherBad.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {weatherBad.map((wp, i) => (
                      <div key={i} className="p-3 rounded-xl border border-amber-200 bg-amber-50">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap size={12} className="text-amber-500 flex-shrink-0" />
                          <p className="text-[11px] font-bold text-slate-800 flex-1">{wp.place}</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                            wp.severity === 'CRITICAL' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                          }`}>{wp.severity}</span>
                        </div>
                        <p className="text-[11px] text-slate-600">{wp.weather}</p>
                        <p className="text-[9px] text-slate-400 mt-1">
                          Wind: {wp.wind} km/h · {wp.coords?.[0]?.toFixed(1)}°N, {wp.coords?.[1]?.toFixed(1)}°E
                        </p>
                      </div>
                    ))}
                  </>
                ) : null}

                {/* All waypoints */}
                {waypoints.length > 0 ? (
                  <div className={`space-y-1.5 ${weatherBad.length > 0 ? 'mt-3' : ''}`}>
                    {weatherBad.length > 0 && (
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1 pt-1">All Checkpoints</p>
                    )}
                    {waypoints.map((wp, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          wp.severity === 'CRITICAL' ? 'bg-red-100' : wp.severity === 'CAUTION' ? 'bg-amber-100' : 'bg-emerald-100'
                        }`}>
                          {wp.code >= 95 ? <Zap size={12} className="text-red-500" />
                            : wp.code >= 61 ? <CloudRain size={12} className="text-amber-500" />
                            : <Shield size={12} className="text-emerald-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-800 truncate">{wp.place}</p>
                          <p className="text-[10px] text-slate-400">{wp.weather}</p>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          wp.severity === 'CRITICAL' ? 'bg-red-500' : wp.severity === 'CAUTION' ? 'bg-amber-400' : 'bg-emerald-400'
                        }`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                      <Shield size={26} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">Weather Clear</p>
                    <p className="text-xs text-slate-400 mt-1">No significant weather hazards detected along this corridor.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Safer route recommendation ─────────────────── */}
          {saferRoute && riskScore > 35 && (
            <div className="p-3 border-t border-slate-100 flex-shrink-0 bg-slate-50">
              <div className="p-3 rounded-xl bg-white border border-emerald-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp size={11} className="text-emerald-600" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Safer Route Available</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed mb-2.5">
                  <span className="font-bold">{saferRoute.summary || `Route ${saferRouteIndex + 1}`}</span> — risk score{' '}
                  <span className="font-black text-emerald-700">{saferRoute.intelligence?.riskScore ?? '?'}/100</span>
                  {' '}({riskScore - (saferRoute.intelligence?.riskScore ?? 0)} pts lower than active route).
                </p>
                <button
                  onClick={() => { onSwitchRoute?.(saferRouteIndex); onClose?.(); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-colors">
                  Switch to Safer Route <ArrowRight size={10} />
                </button>
              </div>
            </div>
          )}

          {/* ── Footer ────────────────────────────────────── */}
          <div className="px-4 py-2.5 border-t border-slate-50 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-1.5">
              <Info size={9} className="text-slate-400" />
              <span className="text-[9px] text-slate-400">
                Scanned: {intel.lastScanned
                  ? new Date(intel.lastScanned).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : '—'}
                {' '}· NewsData.io + Open-Meteo
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
