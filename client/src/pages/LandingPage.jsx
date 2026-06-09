import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, AlertTriangle, ShieldAlert, Activity, Globe, Anchor, Plane, Truck, MapPin } from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const PRESETS = [
  {
    id: 'mumbai-singapore',
    label: 'Mumbai → Singapore',
    origin: 'Mumbai',
    destination: 'Singapore',
    mode: 'Sea',
    distance: '4,200 km',
    duration: '11 days',
    safetyScore: '92%',
    riskLevel: 'Low',
    waypoints: ['Indian Ocean', 'Andaman Sea', 'Strait of Malacca'],
    weatherAlert: 'Moderate swell waves in the Andaman Sea. Wind speeds: 15-20 knots.',
    geoAlert: 'Increased maritime piracy patrols active around the Strait of Malacca.',
    color: '#00C2FF',
    svgPath: 'M 60,200 C 130,220 200,240 240,280 T 340,320',
    originX: 60, originY: 200,
    destX: 340, destY: 320,
    vesselX: 200, vesselY: 250,
  },
  {
    id: 'delhi-hyderabad',
    label: 'Delhi → Hyd',
    origin: 'Delhi',
    destination: 'Hyderabad',
    mode: 'Road',
    distance: '1,250 km',
    duration: '32 hours',
    safetyScore: '89%',
    riskLevel: 'Low-Medium',
    waypoints: ['Agra Expressway', 'Nagpur Bypass', 'Adilabad NH-44'],
    weatherAlert: 'Clear visibility reported along NH-44. Expect high daytime temperatures.',
    geoAlert: 'Local transport strikes reported near Nagpur bypass. Anticipate minor delays.',
    color: '#FF9F43',
    svgPath: 'M 200,60 Q 205,180 200,340',
    originX: 200, originY: 60,
    destX: 200, destY: 340,
    vesselX: 202, vesselY: 210,
  },
  {
    id: 'chennai-dubai',
    label: 'Chennai → Dubai',
    origin: 'Chennai',
    destination: 'Dubai',
    mode: 'Air',
    distance: '2,900 km',
    duration: '4.5 hours',
    safetyScore: '96%',
    riskLevel: 'Low',
    waypoints: ['Bay of Bengal', 'Arabian Sea Corridor', 'Oman Airspace'],
    weatherAlert: 'Strong jet streams detected over the Arabian Sea. Minimal turbulence.',
    geoAlert: 'Oman airspace traffic coordination advisory active. Flight path cleared.',
    color: '#FF5C7A',
    svgPath: 'M 340,300 Q 200,200 60,100',
    originX: 340, originY: 300,
    destX: 60, destY: 100,
    vesselX: 200, vesselY: 180,
  },
];

const LandingPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [fetchingIncidents, setFetchingIncidents] = useState(true);
  const [activePreset, setActivePreset] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/auth/intelligence-preview`);
        if (res.data?.success && Array.isArray(res.data.incidents)) {
          setIncidents(res.data.incidents);
        }
      } catch (err) {
        console.warn('Failed to load intelligence preview on landing page:', err.message);
      } finally {
        setFetchingIncidents(false);
      }
    };
    fetchIncidents();
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#060B18]">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 border-2 rounded-full opacity-30 animate-ping" style={{ borderColor: 'var(--accent, #00C2FF)' }} />
          <div className="absolute w-16 h-16 border-t-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent, #00C2FF)' }} />
          <Shield className="text-white" size={32} />
        </div>
        <p className="mt-8 text-xs tracking-[0.3em] uppercase text-slate-400">Establishing secure link...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060B18] text-[#F1F5F9] font-sans selection:bg-cyan-500/30 overflow-x-hidden relative">
      {/* Abstract Background Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-[60vh] right-10 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-[100] bg-[#070D1E]/75 backdrop-blur-md border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button className="flex items-center gap-3 group text-left" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="rounded-xl border border-cyan-500/30 p-2 bg-cyan-950/20 group-hover:border-cyan-400 transition-all duration-300">
              <Shield size={20} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">RouteGuardian</p>
              <p className="text-sm font-extrabold text-white">Logistics intelligence</p>
            </div>
          </button>

          <div className="flex items-center gap-6 text-sm font-semibold">
            <button onClick={() => scrollToSection('features')} className="text-slate-400 hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollToSection('intelligence')} className="text-slate-400 hover:text-white transition-colors">Risk Stream</button>
            <Link to="/auth" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 font-extrabold shadow-md shadow-cyan-500/10 hover:shadow-cyan-400/20 transition-all duration-300 transform active:scale-95">
              Access Platform
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center min-h-[90vh]">
        <div className="lg:col-span-7 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-wider">
            <Activity size={12} className="animate-pulse" /> Live Tactical Risk Feeds
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.15] tracking-tight">
            Logistics Route Intelligence <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">For Active Cargo Fleets</span>
          </h1>
          
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl">
            Synthesize route optimization matrices with real-time geopolitical & weather threats. Plan shipments dynamically through our geofenced risk model.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link to="/auth" className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 font-black text-sm transition-all shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20">
              Launch Agent Console <ArrowRight size={15} />
            </Link>
            <button onClick={() => scrollToSection('intelligence')} className="px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-white font-extrabold text-sm transition-all">
              Live Threat Board
            </button>
          </div>
        </div>

        {/* Interactive Route Intelligence Preview */}
        <div className="lg:col-span-5 flex flex-col gap-4 w-full relative z-10">
          {/* Preset Buttons Tabs */}
          <div className="flex bg-[#070D1E]/90 border border-slate-800 rounded-xl p-1 gap-1">
            {PRESETS.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setActivePreset(idx)}
                className={`flex-1 py-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activePreset === idx
                    ? 'bg-[#101826] text-[#00C2FF] border border-white/5 shadow-md'
                    : 'text-slate-400 hover:text-white bg-transparent border border-transparent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* SVG Map Container */}
          <div className="relative w-full h-[260px] rounded-2xl border border-slate-800 bg-[#070D1E]/90 overflow-hidden shadow-2xl flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b152d_1px,transparent_1px),linear-gradient(to_bottom,#0b152d_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
            
            <svg className="w-full h-full relative z-10" viewBox="0 0 400 400">
              {/* Draw Route Path */}
              <path
                d={PRESETS[activePreset].svgPath}
                fill="none"
                stroke={PRESETS[activePreset].color}
                strokeWidth="3"
                strokeLinecap="round"
                className="animate-[dash_10s_linear_infinite]"
                style={{ strokeDasharray: '8, 8' }}
              />

              {/* Waypoints circles */}
              <g transform={`translate(${PRESETS[activePreset].originX}, ${PRESETS[activePreset].originY})`}>
                <circle r="7" fill={`${PRESETS[activePreset].color}22`} className="animate-ping" />
                <circle r="4.5" fill={PRESETS[activePreset].color} />
              </g>

              <g transform={`translate(${PRESETS[activePreset].destX}, ${PRESETS[activePreset].destY})`}>
                <circle r="7" fill={`${PRESETS[activePreset].color}22`} className="animate-ping" />
                <circle r="4.5" fill={PRESETS[activePreset].color} />
              </g>

              {/* Animated vessel/truck/plane */}
              <g transform={`translate(${PRESETS[activePreset].vesselX}, ${PRESETS[activePreset].vesselY})`}>
                <circle r="8" fill="rgba(255,255,255,0.1)" className="animate-ping" />
                <circle r="5" fill="#FFF" />
              </g>
            </svg>

            {/* Float Info Badges */}
            <div className="absolute top-4 left-4 bg-[#0B1220]/95 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase text-slate-400">
              {PRESETS[activePreset].mode} Route
            </div>

            <div className="absolute top-4 right-4 bg-[#0B1220]/95 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400">
              Safety: {PRESETS[activePreset].safetyScore}
            </div>
          </div>

          {/* Route Stats & Intelligence Details */}
          <div className="bg-[#101826] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4 text-left">
            <div className="flex justify-between items-center gap-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Selected Path</p>
                <h4 className="text-sm font-black text-white">
                  {PRESETS[activePreset].origin} → {PRESETS[activePreset].destination}
                </h4>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Specs</p>
                <p className="text-xs font-bold text-[#00C2FF]">
                  {PRESETS[activePreset].distance} / {PRESETS[activePreset].duration}
                </p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-3 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <div className="w-5 h-5 rounded-lg bg-[#FF9F43]/10 border border-[#FF9F43]/20 flex items-center justify-center flex-shrink-0 text-[#FF9F43] mt-0.5">
                  <AlertTriangle size={11} />
                </div>
                <div>
                  <span className="font-extrabold text-[#FF9F43]">Weather: </span>
                  <span className="text-[#9AA7B5]">{PRESETS[activePreset].weatherAlert}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <div className="w-5 h-5 rounded-lg bg-[#FF5C7A]/10 border border-[#FF5C7A]/20 flex items-center justify-center flex-shrink-0 text-[#FF5C7A] mt-0.5">
                  <ShieldAlert size={11} />
                </div>
                <div>
                  <span className="font-extrabold text-[#FF5C7A]">Geopolitics: </span>
                  <span className="text-[#9AA7B5]">{PRESETS[activePreset].geoAlert}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid cards */}
      <section id="features" className="py-20 px-6 border-t border-slate-900 bg-[#040813] relative z-10">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-4 max-w-xl mx-auto">
            <h2 className="text-3xl font-black text-white">Full-Spectrum Vector Security</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Plan, simulate, and track shipping vectors globally. We overlay physical, geopolitical, and meteorological risk metrics instantly.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-[#070D1E]/60 border border-slate-800/80 rounded-2xl p-6 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 mb-5 group-hover:scale-110 transition-transform">
                <Globe size={18} className="text-cyan-400" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-2">Multi-Transit Vectoring</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Supports Sea, Air, Road and Rail routing models. Auto-geocode points and query optimal paths globally.
              </p>
            </div>

            <div className="bg-[#070D1E]/60 border border-slate-800/80 rounded-2xl p-6 hover:border-red-500/30 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-5 group-hover:scale-110 transition-transform">
                <ShieldAlert size={18} className="text-red-400" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-2">Tactical Risk Geofencing</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Runs real-time geospatial matches against global conflict zones, maritime threat corridors, and weather fronts.
              </p>
            </div>

            <div className="bg-[#070D1E]/60 border border-slate-800/80 rounded-2xl p-6 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-5 group-hover:scale-110 transition-transform">
                <Shield size={18} className="text-blue-400" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-2">Routy AI Copilot</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plan entire shipping vectors step-by-step or via natural language commands using our conversational interface.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Intelligence Preview */}
      <section id="intelligence" className="py-20 px-6 border-t border-slate-900 bg-[#060B18]">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-3 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider">
                GEO_RISK_ENGINE Alert Feed
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Live Intelligence Stream</h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-lg leading-relaxed">
                Active alerts currently logged in our georisk database. Operators monitor these zones constantly to redirect cargo flows.
              </p>
            </div>
            <Link to="/auth" className="flex items-center gap-1.5 text-xs text-cyan-400 font-extrabold hover:text-cyan-300 hover:underline flex-shrink-0 transition-colors">
              Access Full Threat Feed <ArrowRight size={12} />
            </Link>
          </div>

          {fetchingIncidents ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-[#070D1E]/40 border border-slate-900 rounded-2xl p-5 h-40 animate-pulse space-y-4">
                  <div className="w-20 h-4 bg-slate-800 rounded" />
                  <div className="w-full h-8 bg-slate-800 rounded" />
                  <div className="w-1/2 h-4 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : incidents.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {incidents.map((inc, i) => {
                const isCritical = inc.severity?.toUpperCase() === 'CRITICAL';
                const isHigh = inc.severity?.toUpperCase() === 'HIGH';
                const severityColor = isCritical ? 'text-red-400 bg-red-500/10 border-red-500/25' : isHigh ? 'text-orange-400 bg-orange-500/10 border-orange-500/25' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25';
                
                return (
                  <div key={i} className="bg-[#070D1E]/80 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between text-left space-y-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${severityColor}`}>
                          {inc.severity || 'Medium'} Risk
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{inc.category || 'general'}</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-white leading-relaxed line-clamp-3">
                        {inc.headline}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/50 pt-3 flex-shrink-0">
                      <div className="flex items-center gap-1 font-semibold truncate max-w-[130px]">
                        <MapPin size={10} className="text-slate-500 flex-shrink-0" />
                        <span className="truncate">{inc.location}</span>
                      </div>
                      <span className="font-semibold text-slate-600 flex-shrink-0">{inc.publisher || 'RG Intel'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#070D1E]/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 font-semibold">
              No active tactical incidents reported. Threat stream clear.
            </div>
          )}
        </div>
      </section>

      {/* Access Console CTA */}
      <section className="py-20 px-6 border-t border-slate-900 text-center bg-[#040813] relative z-10">
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-3xl font-black text-white">Secure Your Supply Vector</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Gain access to our full suite of route optimizers, risk-aware waypoints, alternative transits, and real-time monitoring channels.
          </p>
          <div className="pt-2">
            <Link to="/auth" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 font-black text-sm transition-all shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20">
              Access The Console <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900/60 bg-[#03060E] py-10 px-6 text-center text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-cyan-400" />
            <span className="font-black uppercase tracking-wider text-slate-400">RouteGuardian</span>
          </div>
          <p className="font-medium">© {new Date().getFullYear()} RouteGuardian. Enterprise Route Risk Auditing Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;