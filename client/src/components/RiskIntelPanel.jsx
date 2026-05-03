import React, { useState } from 'react';
import { X, Shield, Newspaper, CloudRain, ArrowRight, ExternalLink, TrendingUp, ChevronDown, ChevronUp, Radio, Zap, AlertTriangle, Anchor, Info, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SEV = {
  CRITICAL: { label: 'CRITICAL', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', dotCls: 'bg-red-500'     },
  HIGH:     { label: 'HIGH',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', dotCls: 'bg-orange-500'  },
  MODERATE: { label: 'MODERATE', color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  dotCls: 'bg-yellow-500'  },
  CAUTION:  { label: 'CAUTION',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', dotCls: 'bg-amber-500'   },
  STABLE:   { label: 'STABLE',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  dotCls: 'bg-emerald-500' },
};

const TYPE_ICON = { conflict: '⚔️', piracy: '🏴‍☠️', dispute: '🚩', weather: '🌩️' };

const RiskGauge = ({ score, severity }) => {
  const cfg = SEV[severity] || SEV.STABLE;
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: 92, height: 92 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={r} stroke="rgba(55,65,81,0.8)" strokeWidth="7" fill="none" />
        <circle cx="46" cy="46" r={r}
          stroke={cfg.color} strokeWidth="7" fill="none"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${cfg.color}55)`, transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-black leading-none" style={{ color: 'var(--text-primary)' }}>{score}</span>
        <span className="text-[7px] font-black uppercase tracking-widest mt-0.5" style={{ color: cfg.color }}>/ 100</span>
      </div>
    </div>
  );
};

const ThreatZoneRow = ({ zone }) => {
  const [open, setOpen] = useState(false);
  const cfg = SEV[zone.severity] || SEV.MODERATE;
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <button className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => setOpen(v => !v)}>
        <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[zone.type] || '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ background: cfg.color + '22', color: cfg.color }}>
              {cfg.label}
            </span>
            <span className="text-[8px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{zone.type}</span>
            {zone.newsConfirmed && (
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: '#EF4444', color: '#fff' }}>Live Confirmed</span>
            )}
          </div>
          <p className="text-[11px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{zone.name}</p>
        </div>
        {open
          ? <ChevronUp size={12} className="flex-shrink-0 mt-1.5" style={{ color: 'var(--text-muted)' }} />
          : <ChevronDown size={12} className="flex-shrink-0 mt-1.5" style={{ color: 'var(--text-muted)' }} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <p className="px-3 pb-3 pt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)', borderTop: `1px solid ${cfg.color}30` }}>
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
  selectedRoutes = [],
  freightMode = 'ship',
  aiRecommendation = null,
}) => {
  const [tab, setTab] = useState('zones');

  const intel      = intelligence || {};
  const riskScore  = intel.riskScore   ?? 0;
  const severity   = intel.severity    ?? 'STABLE';
  const riskZones  = intel.riskZones   ?? [];
  const newsFeed   = intel.newsFeed    ?? [];
  const waypoints  = intel.waypointReports ?? [];
  const weatherBad = waypoints.filter(w => w.code >= 61);
  const cfg        = SEV[severity] || SEV.STABLE;
  const routeAlerts = riskZones.length > 0 ? riskZones : allRoutes.flatMap(r => r.intelligence?.riskZones || []);
  const visibleRoutes = selectedRoutes.length > 0 ? selectedRoutes : allRoutes.slice(0, 3);

  const saferRouteIndex = allRoutes.findIndex((r, i) =>
    i !== activeRouteIndex && (r.intelligence?.riskScore ?? 999) < riskScore
  );
  const saferRoute = saferRouteIndex !== -1 ? allRoutes[saferRouteIndex] : null;

  const tabs = [
    { id: 'zones',   label: `Threats${routeAlerts.length > 0 ? ` (${routeAlerts.length})` : ''}` },
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
          className="absolute right-0 top-0 bottom-0 z-[1500] flex flex-col overflow-hidden"
          style={{
            width: 340,
            background: 'var(--surface)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.35)',
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ background: '#0B1220', borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: cfg.color }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
                Route Intelligence
              </span>
            </div>
            <button onClick={onClose} className="p-1 transition-colors" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <X size={14} />
            </button>
          </div>

          {/* AI Recommendation banner */}
          {aiRecommendation && (
            <div
              className="px-4 py-3 flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.2)' }}
            >
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(59,130,246,0.2)' }}>
                  <Bot size={10} style={{ color: '#3B82F6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#3B82F6' }}>AI Recommendation</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {aiRecommendation.reasoning}
                  </p>
                  {aiRecommendation.tradeoff && (
                    <p className="text-[9px] mt-0.5 italic" style={{ color: 'var(--text-muted)' }}>
                      {aiRecommendation.tradeoff}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Risk gauge + summary */}
          <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-4">
              <RiskGauge score={riskScore} severity={severity} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Threat Assessment
                </p>
                <p className="text-[12px] font-bold leading-snug line-clamp-4" style={{ color: 'var(--text-primary)' }}>
                  {intel.summary || 'Route corridor assessed. No significant threats detected.'}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Radio size={9} className="animate-pulse flex-shrink-0" style={{ color: cfg.color }} />
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: cfg.color }}>
                    {routeAlerts.length > 0
                      ? `${routeAlerts.length} threat zone${routeAlerts.length !== 1 ? 's' : ''} on corridor`
                      : 'No active threat zones detected'}
                  </span>
                </div>
                <p className="mt-2 text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  For clear risk analysis, open the Risk Alert page.
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2"
                style={tab === t.id
                  ? { borderColor: cfg.color, color: cfg.color }
                  : { borderColor: 'transparent', color: 'var(--text-muted)' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ZONES */}
            {tab === 'zones' && (
              <div className="p-3 space-y-2">
                {routeAlerts.length > 0 ? (
                  routeAlerts.map((zone, i) => <ThreatZoneRow key={i} zone={zone} />)
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'rgba(34,197,94,0.1)' }}>
                      <Shield size={26} style={{ color: '#22C55E' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Corridor Clear</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      No known active threat zones were detected along this route corridor.
                    </p>
                  </div>
                )}
                {visibleRoutes.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderTopColor: 'var(--border)' }}>
                    <p className="text-[9px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                      Selected Routes
                    </p>
                    <div className="space-y-2">
                      {visibleRoutes.map((route, idx) => (
                        <div key={route.id ?? idx} className="p-2.5 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                          <p className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>
                            {route.summary || `Route ${idx + 1}`}
                          </p>
                          <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {route.origin || 'Origin'} → {route.destination || 'Destination'}
                          </p>
                          <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            {route.intelligence?.riskZones?.length || 0} risk zone{(route.intelligence?.riskZones?.length || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
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
                      <div key={i} className="p-3 rounded-xl transition-all"
                        style={{ background: 'var(--card)', border: `1px solid ${aCfg.border}` }}>
                        <div className="flex items-start gap-2 mb-2">
                          <Newspaper size={11} className="flex-shrink-0 mt-0.5" style={{ color: aCfg.color }} />
                          <p className="text-[11px] font-semibold flex-1 leading-snug" style={{ color: 'var(--text-primary)' }}>
                            {article.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                              style={{ background: aCfg.bg, color: aCfg.color }}>
                              {article.type || 'alert'}
                            </span>
                            {article.date && (
                              <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
                                {new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {article.link && (
                            <a href={article.link} target="_blank" rel="noreferrer"
                              className="flex items-center gap-0.5 text-[10px] hover:underline flex-shrink-0"
                              style={{ color: 'var(--accent)' }}>
                              View <ExternalLink size={8} />
                            </a>
                          )}
                        </div>
                        {article.impact && (
                          <p className="mt-2 text-[10px] leading-relaxed pt-2" style={{ color: 'var(--text-muted)', borderTop: `1px solid var(--border)` }}>
                            {article.impact}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'var(--card)' }}>
                      <Newspaper size={24} style={{ color: 'var(--border)' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>No News Alerts</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      No threat-related news detected for this route corridor.
                    </p>
                  </div>
                )}
                <div className="mt-3 px-1">
                  <p className="text-[9px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Risk Alert Page
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Use the risk alert page for clear risk analysis and route-by-route breakdowns.
                  </p>
                </div>
              </div>
            )}

            {/* WEATHER */}
            {tab === 'weather' && (
              <div className="p-3 space-y-2">
                {weatherBad.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-1 mb-1">
                      <AlertTriangle size={10} style={{ color: '#F59E0B' }} />
                      <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#F59E0B' }}>
                        {weatherBad.length} active weather hazard{weatherBad.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {weatherBad.map((wp, i) => (
                      <div key={i} className="p-3 rounded-xl"
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <Zap size={12} className="flex-shrink-0" style={{ color: '#F59E0B' }} />
                          <p className="text-[11px] font-bold flex-1" style={{ color: 'var(--text-primary)' }}>{wp.place}</p>
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                            style={{
                              background: wp.severity === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                              color: wp.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B',
                            }}>
                            {wp.severity}
                          </span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{wp.weather}</p>
                        <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          Wind: {wp.wind} km/h · {wp.coords?.[0]?.toFixed(1)}°N, {wp.coords?.[1]?.toFixed(1)}°E
                        </p>
                      </div>
                    ))}
                  </>
                )}

                {waypoints.length > 0 ? (
                  <div className={`space-y-1.5 ${weatherBad.length > 0 ? 'mt-3' : ''}`}>
                    {weatherBad.length > 0 && (
                      <p className="text-[9px] font-black uppercase tracking-wider px-1 pt-1" style={{ color: 'var(--text-muted)' }}>
                        All Checkpoints
                      </p>
                    )}
                    {waypoints.map((wp, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: wp.severity === 'CRITICAL' ? 'rgba(239,68,68,0.15)'
                              : wp.severity === 'CAUTION' ? 'rgba(245,158,11,0.15)'
                              : 'rgba(34,197,94,0.15)',
                          }}>
                          {wp.code >= 95
                            ? <Zap size={12} style={{ color: '#EF4444' }} />
                            : wp.code >= 61
                            ? <CloudRain size={12} style={{ color: '#F59E0B' }} />
                            : <Shield size={12} style={{ color: '#22C55E' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{wp.place}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{wp.weather}</p>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: wp.severity === 'CRITICAL' ? '#EF4444'
                              : wp.severity === 'CAUTION' ? '#F59E0B'
                              : '#22C55E',
                          }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'rgba(34,197,94,0.1)' }}>
                      <Shield size={26} style={{ color: '#22C55E' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Weather Clear</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      No significant weather hazards detected along this corridor.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Safer route recommendation */}
          {saferRoute && riskScore > 35 && (
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div className="p-3 rounded-xl" style={{ background: 'var(--card)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp size={11} style={{ color: '#22C55E' }} />
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#22C55E' }}>
                    Safer Route Available
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {saferRoute.summary || `Route ${saferRouteIndex + 1}`}
                  </span>{' '}
                  — risk score{' '}
                  <span className="font-black" style={{ color: '#22C55E' }}>
                    {saferRoute.intelligence?.riskScore ?? '?'}/100
                  </span>
                  {' '}({riskScore - (saferRoute.intelligence?.riskScore ?? 0)} pts lower).
                </p>
                <button
                  onClick={() => { onSwitchRoute?.(saferRouteIndex); onClose?.(); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                  style={{ background: '#16a34a', color: '#fff' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                  onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
                >
                  Switch to Safer Route <ArrowRight size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div className="flex items-center gap-1.5">
              <Info size={9} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                Scanned:{' '}
                {intel.lastScanned
                  ? new Date(intel.lastScanned).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : '—'}
                {' '}· Open-Meteo + NewsData.io
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
