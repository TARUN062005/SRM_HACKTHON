import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Github, Zap, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authService from '../lib/auth/authService';
import { useAuth } from '../lib/auth/hooks/useAuth';

const floatingOrbs = [
  { size: 420, left: '-8%', top: '-15%', color: 'rgba(37,99,235,0.18)', dur: 9 },
  { size: 320, left: '65%', top: '55%', color: 'rgba(99,102,241,0.13)', dur: 12 },
  { size: 260, left: '28%', top: '-8%', color: 'rgba(59,130,246,0.09)', dur: 15 },
];

const FloatingOrb = ({ size, left, top, color, dur }) => (
  <motion.div
    style={{ position: 'absolute', width: size, height: size, left, top, borderRadius: '50%', background: color, filter: 'blur(90px)', pointerEvents: 'none' }}
    animate={{ x: [0, 28, -18, 10, 0], y: [0, -22, 14, -8, 0], scale: [1, 1.07, 0.96, 1.03, 1] }}
    transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut' }}
  />
);

const AuthPage = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) toast.error(decodeURIComponent(err));
  }, [searchParams]);

  const handleSocial = (provider) => {
    authService.startOAuth(provider);
  };

  return (
    <div className="page-shell flex overflow-hidden text-white">
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex w-[52%] relative flex-col justify-between p-14 overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #050816 0%, #0b1224 52%, #050816 100%)' }}
      >
        {floatingOrbs.map((o, i) => <FloatingOrb key={i} {...o} />)}
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2.5 bg-white/8 backdrop-blur-md rounded-xl ring-1 ring-white/10 neon-ring">
            <Shield size={20} className="text-blue-300" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">RouteGuardian</span>
        </div>

        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-400/20 rounded-full">
            <Zap size={11} className="text-blue-300" />
            <span className="text-blue-200 text-[10px] font-bold tracking-widest uppercase">Enterprise Logistics Platform</span>
          </div>
          <h1 className="text-[3.8rem] font-black leading-[1.04] tracking-tight text-white">Route Guardian</h1>
          <p className="text-slate-300/75 text-base leading-relaxed max-w-xs">
            Sign in securely using your existing Google or GitHub account.
          </p>
          <div className="flex items-center gap-3 text-slate-300/65 text-sm">
            <Globe size={12} className="text-blue-300" /> OAuth-only authentication
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }} className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12">
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="p-2 bg-primary-600 rounded-xl"><Shield size={16} className="text-white" /></div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">RouteGuardian</span>
        </div>

        <div className="max-w-[370px] w-full mx-auto">
          <div className="surface-glass rounded-[28px] p-6 sm:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300 mb-3">Secure Access</p>
            <h2 className="text-[1.9rem] font-black tracking-tight leading-tight">OAuth sign-in</h2>
            <p className="text-slate-400 text-xs mt-1 font-medium">Use your existing Google or GitHub identity to continue.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
              <button
                type="button"
                onClick={() => handleSocial('google')}
                className="rg-btn-primary flex items-center justify-center gap-3 py-3.5 px-4 transition-transform hover:translate-y-[-1px]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#041019" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#041019" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.9" />
                  <path fill="#041019" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.9" />
                  <path fill="#041019" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.9" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleSocial('github')}
                className="rg-btn-secondary flex items-center justify-center gap-3 py-3.5 px-4 transition-transform hover:translate-y-[-1px]"
              >
                <Github size={16} className="text-white" />
                <span>Continue with GitHub</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;