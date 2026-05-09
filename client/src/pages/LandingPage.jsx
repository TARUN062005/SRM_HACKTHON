import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Shield, ArrowRight, Activity, Map, BellRing, Cpu,
  Layers, Fingerprint, Globe, Zap, ChevronRight, Play
} from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';

const LandingPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, -50]);

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
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#020617]">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-24 h-24 border-2 border-blue-500/20 rounded-full animate-ping" />
          <div className="absolute w-16 h-16 border-t-2 border-blue-500 rounded-full animate-spin" />
          <Shield className="text-blue-500 animate-pulse" size={32} />
        </div>
        <p className="mt-8 text-blue-500/50 font-mono text-xs tracking-[0.3em] uppercase">Establishing Secure Link...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#020617] min-h-screen font-sans text-slate-200 overflow-x-hidden selection:bg-blue-500/30">
      {/* Cinematic Background */}
      <div className="fixed inset-0 z-0 text-white">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-[100] border-b border-white/5 bg-[#020617]/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="bg-blue-600 p-2 rounded-lg group-hover:rotate-12 transition-transform duration-300">
              <Shield size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">RouteGuardian</span>
          </div>

          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-400">
            <button onClick={() => scrollToSection('features')} className="hover:text-blue-400 transition-colors">Features</button>
            <button onClick={() => scrollToSection('network')} className="hover:text-blue-400 transition-colors">Network</button>
            <Link to="/auth" className="text-white bg-white/5 border border-white/10 px-5 py-2 rounded-full hover:bg-white/10 transition-all">
              Sign In
            </Link>
            <Link to="/auth" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full shadow-lg shadow-blue-600/20 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-40 pb-20 px-6">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-8"
            >
              <Zap size={14} /> <span>v4.0 ENGINE DEPLOYED</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-6xl md:text-8xl font-black tracking-tight text-white mb-8 leading-[0.9]"
            >
              The Operating System <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400">
                For Global Trade.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-12"
            >
              Autonomous route optimization with sub-second latency. Predict disruption before it happens with our proprietary neural logistics mesh.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row justify-center gap-4"
            >
              <Link to="/auth" className="flex items-center justify-center gap-2 bg-white text-[#020617] px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-all active:scale-95">
                Launch Console <ArrowRight size={20} />
              </Link>
              <button 
                onClick={() => scrollToSection('features')}
                className="flex items-center justify-center gap-2 bg-slate-800/50 border border-white/10 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all"
              >
                <Play size={20} fill="currentColor" /> System Demo
              </button>
            </motion.div>
          </div>
        </section>

        {/* Floating Mockup with Parallax */}
        <motion.section style={{ y: y1 }} className="px-6 pb-32">
          <div className="max-w-6xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-[#0B0F19] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              {/* Fake UI Header */}
              <div className="h-12 border-b border-white/5 bg-white/5 flex items-center px-6 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20" />
                </div>
                <div className="mx-auto bg-white/5 px-4 py-1 rounded text-[10px] text-slate-500 font-mono">
                  api.routeguardian.io/v4/global-mesh
                </div>
              </div>

              <div className="aspect-video relative overflow-hidden bg-slate-900">
                <img
                  src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=2000"
                  className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
                  alt="Logistics Map"
                />

                {/* Floating UI Elements */}
                <div className="absolute top-10 left-10 p-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl w-64 shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Active Fleet</span>
                    <Activity size={14} className="text-blue-400" />
                  </div>
                  <div className="space-y-3">
                    {[78, 45, 92].map((v, i) => (
                      <div key={i} className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v}%` }}
                          transition={{ duration: 1.5, delay: i * 0.2 }}
                          className="h-full bg-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="absolute bottom-10 right-10 p-4 bg-indigo-600/90 backdrop-blur-xl rounded-xl text-white shadow-2xl">
                  <Fingerprint size={24} className="mb-2" />
                  <p className="text-xs font-mono uppercase opacity-70">Node Secure</p>
                  <p className="text-lg font-bold">Encrypted</p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Capabilities */}
        <section id="features" className="py-32 bg-white/[0.02] border-y border-white/5 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
              <div className="max-w-2xl">
                <h2 className="text-blue-500 font-mono text-sm tracking-widest uppercase mb-4">Core Infrastructure</h2>
                <h3 className="text-4xl md:text-6xl font-black text-white leading-tight">Built for the speed of modern commerce.</h3>
              </div>
              <p className="text-slate-400 md:max-w-xs text-sm leading-relaxed">
                We've combined Graph Theory with real-time weather and geopolitical data to create a living map.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-3xl overflow-hidden">
              {features.map((f, i) => (
                <div key={i} className="bg-[#020617] p-10 hover:bg-white/[0.02] transition-colors group">
                  <div className="mb-8 text-blue-500 group-hover:scale-110 group-hover:text-blue-400 transition-transform">
                    {f.icon}
                  </div>
                  <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    {f.title} <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </h4>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Network Stats Section */}
        <section id="network" className="py-32 px-6 scroll-mt-24">
           <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-4 gap-8">
                {[
                  { label: "Uptime SLA", val: "99.99%", desc: "Enterprise Reliability" },
                  { label: "Active Nodes", val: "1.2M+", desc: "Global Coverage" },
                  { label: "Avg Latency", val: "<45ms", desc: "Edge Computing" },
                  { label: "Secure Routes", val: "250K+", desc: "Daily Optimized" }
                ].map((s, i) => (
                  <div key={i} className="text-center p-8 bg-white/5 border border-white/10 rounded-3xl">
                    <div className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">{s.label}</div>
                    <div className="text-4xl font-black text-white mb-2">{s.val}</div>
                    <div className="text-xs text-slate-500 font-medium">{s.desc}</div>
                  </div>
                ))}
              </div>
           </div>
        </section>

        {/* Final CTA */}
        <section className="py-40 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/20 blur-[180px] rounded-full" />
          </div>
          <div className="relative z-10 max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-black text-white mb-10 tracking-tighter">Ready to optimize?</h2>
            <div className="flex flex-wrap justify-center gap-6">
              <Link to="/auth" className="px-12 py-5 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-500 hover:shadow-2xl hover:shadow-blue-600/40 transition-all">
                Access Platform
              </Link>
            </div>
            <p className="mt-8 text-slate-500 font-mono text-xs uppercase tracking-[0.2em]">Unlimited nodes • enterprise SLA • 24/7 Support</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-white/5 p-2 rounded-lg">
              <Shield size={18} className="text-blue-500" />
            </div>
            <span className="font-bold text-white uppercase tracking-tighter">RouteGuardian</span>
          </div>
          <div className="text-slate-600 text-xs font-mono">
            &copy; 2026 MERN LOGISTICS • ALL RIGHTS RESERVED
          </div>
          <div className="flex gap-6">
            <Globe size={18} className="text-slate-600 hover:text-white transition-colors cursor-pointer" />
            <Fingerprint size={18} className="text-slate-600 hover:text-white transition-colors cursor-pointer" />
          </div>
        </div>
      </footer>
    </div>
  );
};

const features = [
  { icon: <Map size={32} />, title: 'Multi-Node Pathing', desc: 'Dynamically evaluate thousands of route permutations using GraphHopper & OSRM integration.' },
  { icon: <Globe size={32} />, title: 'Live Threat Intel', desc: 'Syncs continuously with OpenWeather and Traffic data fabrics to predict delays before they occur.' },
  { icon: <Cpu size={32} />, title: 'Neural Optimization', desc: 'Machine learning weights adjust for heavy vehicles, scaling logic directly inside our backend API.' },
  { icon: <BellRing size={32} />, title: 'Automated Protocols', desc: 'When risks exceed thresholds, the system pushes instantaneous alerts and auto-calculates fallbacks.' },
  { icon: <Layers size={32} />, title: 'Seamless Rendering', desc: 'Built on React-Leaflet with 60FPS memoized rendering for flawless enterprise dashboard interactions.' },
  { icon: <Shield size={32} />, title: 'End-to-End Auth', desc: 'Enterprise-grade Fireabse JWT architecture securing APIs against unauthorized payload injection.' }
];

export default LandingPage;