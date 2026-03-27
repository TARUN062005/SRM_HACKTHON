import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Activity, Map, BellRing, Cpu, TrendingDown, DollarSign, Target, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';

const LandingPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
        <p className="text-slate-500 font-medium animate-pulse">
          Starting up the engine...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-10 py-6 border-b border-slate-200 sticky top-0 bg-slate-50/90 backdrop-blur-md z-50">
        <div className="flex items-center space-x-3 font-bold text-2xl text-slate-900 font-poppins">
          <Shield className="text-blue-600" size={32} /> 
          <span>RouteGuardian</span>
        </div>
        <div className="space-x-6 flex items-center">
          <Link
            to="/auth?mode=register"
            className="text-slate-600 font-semibold hover:text-blue-600 transition-colors"
          >
            Sign Up
          </Link>
          <Link
            to="/auth"
            className="bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700 transition-all shadow-md font-semibold"
          >
            Login
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="px-6 py-24 text-center space-y-8 max-w-5xl mx-auto">
        <div className="inline-block bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide uppercase mb-4">
          Predict. Protect. Deliver.
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight text-slate-900 font-poppins">
          AI-Powered Predictive <br/>
          <span className="text-blue-600">Supply Chain Routing</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
          Monitor risks, optimize routes, and automate logistics decisions in real time using advanced artificial intelligence and predictive modeling.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-6">
          <Link
            to="/auth"
            className="w-full sm:w-auto bg-blue-600 text-white px-10 py-4 rounded font-bold flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all font-inter"
          >
            Get Started <ArrowRight className="ml-2" size={20} />
          </Link>
          <button className="w-full sm:w-auto border-2 border-slate-300 px-10 py-4 rounded font-bold text-slate-700 hover:bg-slate-100 transition-colors font-inter flex items-center justify-center">
            View Demo
          </button>
        </div>
        
        {/* Mock Graphic Concept Map */}
        <div className="mt-16 w-full max-w-4xl mx-auto h-[400px] bg-slate-800 rounded-2xl shadow-2xl relative overflow-hidden border border-slate-700">
          <div className="absolute inset-0 bg-[url('https://maps.wikimedia.org/osm-intl/6/32/23.png')] opacity-30 bg-cover bg-center mix-blend-overlay"></div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
             <div className="text-center bg-slate-900/80 p-6 rounded-lg border border-slate-700 backdrop-blur">
                <Shield size={48} className="text-blue-500 mx-auto mb-4" />
                <h3 className="text-white text-xl font-bold font-poppins">Global Risk Heatmap Active</h3>
                <p className="text-slate-400 mt-2">Connecting to live weather and traffic nodes...</p>
             </div>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section className="px-6 py-24 bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 font-poppins">Core Capabilities</h2>
        </div>
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              icon: <Activity size={28} />,
              title: 'Predictive Risk Analysis',
              text: 'Advanced monitoring of weather, traffic, and geopolitical signals.',
            },
            {
              icon: <Map size={28} />,
              title: 'Smart Route Optimization',
              text: 'Dynamic pathfinding and rerouting powered by AI algorithms.',
            },
            {
              icon: <BellRing size={28} />,
              title: 'Real-Time Alerts',
              text: 'Instant disruption detection tailored to your active routes.',
            },
            {
              icon: <Cpu size={28} />,
              title: 'Autonomous Decisions',
              text: 'Minimal human intervention required for route course-correction.',
            },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-slate-50 p-8 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <div className="bg-blue-100 text-blue-600 w-14 h-14 flex items-center justify-center rounded-lg mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-900 font-poppins">{f.title}</h3>
              <p className="text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-16 font-poppins">How It Works</h2>
          <div className="flex flex-col md:flex-row items-center justify-between space-y-8 md:space-y-0 text-center font-bold font-poppins">
            <div className="flex-1"><span className="block text-2xl text-blue-400 mb-2">1</span>Input Data</div>
            <ArrowRight className="hidden md:block text-slate-600" />
            <div className="flex-1"><span className="block text-2xl text-blue-400 mb-2">2</span>AI Agents</div>
            <ArrowRight className="hidden md:block text-slate-600" />
            <div className="flex-1"><span className="block text-2xl text-blue-400 mb-2">3</span>Risk Score</div>
            <ArrowRight className="hidden md:block text-slate-600" />
            <div className="flex-1"><span className="block text-2xl text-blue-400 mb-2">4</span>Optimized Route</div>
            <ArrowRight className="hidden md:block text-slate-600" />
            <div className="flex-1"><span className="block text-2xl text-blue-400 mb-2">5</span>Live Monitoring</div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-6 py-20 bg-blue-600 text-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-blue-400">
          <div className="p-4">
            <TrendingDown size={40} className="mx-auto mb-4 text-blue-200" />
            <h4 className="text-5xl font-black mb-2">34%</h4>
            <p className="text-blue-100 font-semibold uppercase tracking-wider">Delay Reduction</p>
          </div>
          <div className="p-4">
            <DollarSign size={40} className="mx-auto mb-4 text-blue-200" />
            <h4 className="text-5xl font-black mb-2">$2.4M</h4>
            <p className="text-blue-100 font-semibold uppercase tracking-wider">Avg Cost Saved Annually</p>
          </div>
          <div className="p-4">
            <Target size={40} className="mx-auto mb-4 text-blue-200" />
            <h4 className="text-5xl font-black mb-2">99.2%</h4>
            <p className="text-blue-100 font-semibold uppercase tracking-wider">Prediction Accuracy</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-12 px-10 text-center md:text-left">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 font-bold text-xl text-white font-poppins mb-6 md:mb-0">
            <Shield className="text-blue-500" /> <span>RouteGuardian</span>
          </div>
          <div className="flex space-x-8 text-sm">
            <a href="#" className="hover:text-white transition">About</a>
            <a href="#" className="hover:text-white transition">Contact</a>
            <a href="#" className="hover:text-white transition">GitHub</a>
            <a href="#" className="hover:text-white transition">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
