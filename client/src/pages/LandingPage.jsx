import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';

const LandingPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading || user) {
    return (
      <div className="page-shell h-screen w-full flex flex-col items-center justify-center">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 border-2 rounded-full opacity-30" style={{ borderColor: 'var(--accent)' }} />
          <div className="absolute w-16 h-16 border-t-2 rounded-full" style={{ borderColor: 'var(--accent)' }} />
          <Shield className="text-white" size={32} />
        </div>
        <p className="mt-8 text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--text-secondary)' }}>Establishing secure link...</p>
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen font-sans text-slate-200 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-[100] rg-nav-glass px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button className="flex items-center gap-3 group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="rounded-xl border p-2" style={{ borderColor: 'var(--border)' }}>
              <Shield size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="text-left">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">RouteGuardian</p>
              <p className="text-sm font-semibold text-white">Logistics intelligence</p>
            </div>
          </button>

          <div className="hidden md:flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            <button onClick={() => scrollToSection('overview')} className="dashboard-chip px-4 py-2 hover:text-white transition-colors">Overview</button>
            <button onClick={() => scrollToSection('data')} className="dashboard-chip px-4 py-2 hover:text-white transition-colors">Data</button>
            <button onClick={() => scrollToSection('risk')} className="dashboard-chip px-4 py-2 hover:text-white transition-colors">Risk</button>
            <Link to="/auth" className="rg-btn-secondary px-4 py-2">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-28 sm:pt-32 pb-12 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto text-left">
            <p className="text-xs uppercase tracking-[0.3em]" style={{ color: 'var(--text-secondary)' }}>RouteGuardian</p>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold text-white leading-tight">
              Logistics route intelligence for operators who need clarity, not hype.
            </h1>
            <p className="mt-5 text-base sm:text-lg leading-7" style={{ color: 'var(--text-secondary)' }}>
              RouteGuardian combines route planning with risk context. You see the route options, the risk score for each one,
              and the specific events that drove the score.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="rg-btn-primary px-6 py-3 text-sm">
                Sign in to the console
              </Link>
              <button onClick={() => scrollToSection('overview')} className="rg-btn-secondary px-6 py-3 text-sm">
                See how it works
              </button>
            </div>
          </div>
        </section>

        <section id="overview" className="py-12 sm:py-16 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white">What RouteGuardian does</h2>
              <p className="mt-4 text-sm sm:text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                It takes a route request, generates primary and alternate paths, and attaches a risk score to each option.
                The risk score is based on live weather and recent geopolitical or safety events along the corridor.
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                {[
                  ['Route options', 'Compare route distance, time, and risk in one place.'],
                  ['Risk detail', 'See which waypoints triggered warnings and why.'],
                  ['Operator controls', 'Choose a route, simulate travel, and export the result.'],
                  ['Alerts', 'Get notified when the risk profile changes after dispatch.'],
                ].map(([title, desc]) => (
                  <div key={title} className="rg-panel p-4">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-2 text-xs leading-6" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rg-panel p-5">
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>Example output</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Route</span>
                  <span className="text-white">Singapore → Rotterdam</span>
                </div>
                <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Mode</span>
                  <span className="text-white">Sea</span>
                </div>
                <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Duration</span>
                  <span className="text-white">18.4 days</span>
                </div>
                <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Risk score</span>
                  <span className="text-white">0.62 (Moderate)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Primary drivers</span>
                  <span className="text-white">Weather + geopolitical</span>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                You see the route line on the map and a list of flagged waypoints with dates, severity, and links to the source.
              </p>
            </div>
          </div>
        </section>

        <section id="data" className="py-12 sm:py-16 px-4 sm:px-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">Data sources and inputs</h2>
            <p className="mt-4 text-sm sm:text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              The system uses live routing, weather, and event feeds to build a risk picture that updates as conditions change.
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              {[
                ['Routing engines', 'OSRM and GraphHopper paths, including distance and ETA.'],
                ['Weather', 'OpenWeather alerts and forecasts matched to route waypoints.'],
                ['Event signals', 'Curated news and safety feeds mapped to regions.'],
                ['User context', 'Mode, timing, and operator preferences from the shipment form.'],
              ].map(([title, desc]) => (
                <div key={title} className="rg-panel p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-xs leading-6" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="risk" className="py-12 sm:py-16 px-4 sm:px-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">How route risk works</h2>
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {[
                ['1. Build the corridor', 'Route segments and waypoints are generated for each option.'],
                ['2. Attach signals', 'Weather and event data are aligned to the corridor by region and time.'],
                ['3. Score and explain', 'Each route receives a risk score with the exact drivers listed.'],
              ].map(([title, desc]) => (
                <div key={title} className="rg-panel p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-xs leading-6" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 sm:px-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white">Ready to review routes?</h2>
              <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                Sign in to view the live dashboard and test a route plan.
              </p>
            </div>
            <Link to="/auth" className="rg-btn-primary px-6 py-3 text-sm">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-10 px-6" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="border p-2 rounded-lg" style={{ borderColor: 'var(--border)' }}>
              <Shield size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-semibold text-white uppercase tracking-tighter">RouteGuardian</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            &copy; 2026 MERN LOGISTICS • ALL RIGHTS RESERVED
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;