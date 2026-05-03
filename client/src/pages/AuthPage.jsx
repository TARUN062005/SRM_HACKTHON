import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Mail, Lock, User, Github, Loader2, ArrowRight, Eye, EyeOff, Zap, Globe } from 'lucide-react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import authService from '../lib/auth/authService';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

const floatingOrbs = [
  { size: 420, left: '-8%', top: '-15%', color: 'rgba(37,99,235,0.18)', dur: 9 },
  { size: 320, left: '65%', top: '55%', color: 'rgba(99,102,241,0.13)', dur: 12 },
  { size: 260, left: '28%', top: '-8%', color: 'rgba(59,130,246,0.09)', dur: 15 },
  { size: 200, left: '-4%', top: '68%', color: 'rgba(139,92,246,0.07)', dur: 10 },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const itemUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
};

const FloatingOrb = ({ size, left, top, color, dur }) => (
  <motion.div
    style={{ position: 'absolute', width: size, height: size, left, top, borderRadius: '50%', background: color, filter: 'blur(90px)', pointerEvents: 'none' }}
    animate={{ x: [0, 28, -18, 10, 0], y: [0, -22, 14, -8, 0], scale: [1, 1.07, 0.96, 1.03, 1] }}
    transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut' }}
  />
);

const InputField = ({ icon: Icon, label, name, type = 'text', placeholder, value, onChange, required, right }) => {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword ? (showPass ? 'text' : 'password') : type;

  return (
    <motion.div variants={itemUp} className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] ml-0.5 block">{label}</label>
      <motion.div
        animate={{
          boxShadow: focused ? '0 0 0 3px rgba(37,99,235,0.16)' : '0 1px 3px rgba(0,0,0,0.04)',
          borderColor: focused ? '#93c5fd' : '#e2e8f0',
        }}
        transition={{ duration: 0.18 }}
        className="relative flex items-center rounded-2xl border bg-slate-50 overflow-hidden"
      >
        <motion.div
          animate={{ color: focused ? '#2563eb' : '#94a3b8' }}
          transition={{ duration: 0.18 }}
          className="absolute left-3.5 pointer-events-none"
        >
          <Icon size={17} />
        </motion.div>
        <input
          name={name}
          type={resolvedType}
          placeholder={placeholder}
          required={required}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-10 pr-10 py-3.5 bg-transparent outline-none text-slate-800 font-medium placeholder:text-slate-300 text-sm"
        />
        {isPassword ? (
          <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)} className="absolute right-3.5 text-slate-300 hover:text-slate-500 transition-colors">
            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        ) : right ? (
          <div className="absolute right-3.5">{right}</div>
        ) : null}
      </motion.div>
    </motion.div>
  );
};

const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'register' || m === 'login') setMode(m);
    const err = searchParams.get('error');
    if (err) toast.error(decodeURIComponent(err));
  }, [searchParams]);

  const switchMode = (next) => {
    setDir(next === 'register' ? 1 : -1);
    setMode(next);
    setForm(f => ({ email: f.email, password: '', name: '' }));
  };

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSocial = (provider) => {
    const base = BACKEND_URL || window.location.origin;
    window.location.assign(`${base}/api/auth/${provider}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let data;
      if (mode === 'login') {
        data = await authService.login(form.email, form.password);
      } else {
        data = await authService.register(form.name, form.email, form.password);
      }

      if (mode === 'register' && data?.requiresVerification) {
        toast.success('Check your email to verify your account!');
        switchMode('login');
        return;
      }
      if (data?.code === 'EMAIL_NOT_VERIFIED') { toast.error(data.message || 'Please verify your email.'); return; }
      if (!data?.success) { toast.error(data?.message || 'Authentication failed'); return; }

      if (data?.token) localStorage.setItem('token', data.token);
      localStorage.setItem('login_timestamp', Date.now().toString());
      setUser(data.user);
      toast.success(mode === 'register' ? 'Welcome to RouteGuardian!' : 'Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      if (err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') { toast.error(err.response.data.message || 'Please verify your email.'); return; }
      toast.error(err?.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div className="min-h-screen flex overflow-hidden bg-slate-50">

      {/* ─── LEFT PANEL ─────────────────────────────────── */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex w-[52%] relative flex-col justify-between p-14 overflow-hidden"
        style={{ background: 'linear-gradient(140deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)' }}
      >
        {floatingOrbs.map((o, i) => <FloatingOrb key={i} {...o} />)}

        {/* grid overlay */}
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.55 }} className="relative z-10 flex items-center gap-3">
          <motion.div whileHover={{ rotate: 12 }} transition={{ type: 'spring', stiffness: 280 }} className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl ring-1 ring-white/20">
            <Shield size={20} className="text-blue-300" />
          </motion.div>
          <span className="text-white font-bold text-lg tracking-tight">RouteGuardian</span>
        </motion.div>

        {/* Center text */}
        <div className="relative z-10 space-y-9">
          <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 border border-blue-400/30 rounded-full">
              <Zap size={11} className="text-blue-300" />
              <span className="text-blue-200 text-[10px] font-bold tracking-widest uppercase">Enterprise Logistics Platform</span>
            </div>
            <h1 className="text-[3.8rem] font-black leading-[1.04] tracking-tight text-white">
              Route<br />
              <motion.span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #60a5fa, #a78bfa 60%)' }}
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              >
                Guardian
              </motion.span>
            </h1>
            <p className="text-slate-300/75 text-base leading-relaxed max-w-xs">
              Secure your logistics chain with real-time route intelligence and enterprise-grade auth.
            </p>
          </motion.div>

          <div className="flex flex-col gap-2.5">
            {[
              { icon: Shield, text: 'JWT + OAuth2 Authentication' },
              { icon: Globe, text: 'Real-Time Route Intelligence' },
              { icon: Zap, text: 'Instant Threat Alerts' },
            ].map(({ icon: Icon, text }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.1, duration: 0.5 }}
                className="flex items-center gap-3 text-slate-300/65 text-sm"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/14 border border-blue-400/20 flex items-center justify-center shrink-0">
                  <Icon size={12} className="text-blue-300" />
                </div>
                {text}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom avatars */}
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.55 }} className="relative z-10 flex items-center gap-4 pt-7 border-t border-white/10">
          <div className="flex -space-x-2.5">
            {['#3b82f6', '#8b5cf6', '#10b981'].map((bg, i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 + i * 0.08, type: 'spring', stiffness: 320 }}
                className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white" style={{ background: bg }}>
                {String.fromCharCode(65 + i)}
              </motion.div>
            ))}
          </div>
          <div>
            <p className="text-white text-sm font-semibold">10,000+ operators</p>
            <p className="text-slate-400 text-xs">trust RouteGuardian daily</p>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── RIGHT PANEL ────────────────────────────────── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}
        className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 bg-white"
      >
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="p-2 bg-primary-600 rounded-xl"><Shield size={16} className="text-white" /></div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">RouteGuardian</span>
        </div>

        <div className="max-w-[370px] w-full mx-auto">

          {/* Header */}
          <div className="mb-7 h-14 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={mode} initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -22, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                <h2 className="text-[1.9rem] font-black text-slate-900 tracking-tight leading-tight">
                  {isLogin ? 'Welcome back' : 'Get started'}
                </h2>
                <p className="text-slate-400 text-xs mt-1 font-medium">
                  {isLogin ? 'Sign in to access your dashboard.' : 'Create your account in seconds.'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Social buttons */}
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2.5 mb-5">
            {[
              {
                label: 'Google', provider: 'google',
                icon: <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              },
              { label: 'GitHub', provider: 'github', icon: <Github size={16} className="text-slate-700" /> },
            ].map(({ label, provider, icon }) => (
              <motion.button
                key={provider}
                type="button"
                variants={itemUp}
                onClick={() => handleSocial(provider)}
                whileHover={{ y: -2, boxShadow: '0 6px 20px rgba(0,0,0,0.09)' }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2.5 py-3 px-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50 font-semibold text-slate-700 text-sm shadow-sm transition-colors"
              >
                {icon}
                <span>{label}</span>
              </motion.button>
            ))}
          </motion.div>

          {/* Divider */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }} className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest">or continue with email</span>
            <div className="flex-1 h-px bg-slate-100" />
          </motion.div>

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ x: dir > 0 ? 50 : -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir > 0 ? -50 : 50, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              onSubmit={handleSubmit}
            >
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3.5">
                {!isLogin && (
                  <InputField icon={User} label="Full Name" name="name" placeholder="John Doe" value={form.name} onChange={handleChange} required />
                )}
                <InputField icon={Mail} label="Email Address" name="email" type="email" placeholder="you@company.com" value={form.email} onChange={handleChange} required />
                <InputField
                  icon={Lock} label="Password" name="password" type="password" placeholder="••••••••"
                  value={form.password} onChange={handleChange} required
                  right={isLogin && (
                    <button type="button" className="text-[10px] font-black text-primary-600 hover:text-primary-700 transition-colors whitespace-nowrap uppercase tracking-wide">
                      Forgot?
                    </button>
                  )}
                />

                <motion.div variants={itemUp} className="pt-0.5">
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={!loading ? { scale: 1.012, boxShadow: '0 14px 38px rgba(37,99,235,0.38)' } : {}}
                    whileTap={!loading ? { scale: 0.988 } : {}}
                    className="w-full relative flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-sm overflow-hidden"
                    style={{
                      background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      boxShadow: loading ? 'none' : '0 6px 22px rgba(37,99,235,0.32)',
                    }}
                  >
                    {/* shimmer */}
                    {!loading && (
                      <motion.span
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.14) 50%, transparent 65%)', backgroundSize: '250% 100%' }}
                        animate={{ backgroundPosition: ['250% 0', '-250% 0'] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                      />
                    )}

                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div key="spin" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center gap-2">
                          <Loader2 className="animate-spin" size={16} />
                          <span>Authenticating…</span>
                        </motion.div>
                      ) : (
                        <motion.div key="idle" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="flex items-center gap-2">
                          <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                          <motion.div animate={{ x: [0, 3, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>
                            <ArrowRight size={15} />
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.form>
          </AnimatePresence>

          {/* Switch mode */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="text-center mt-7">
            <p className="text-slate-400 text-sm">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <motion.button
                type="button"
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="text-primary-600 font-bold hover:text-primary-700 transition-colors"
              >
                {isLogin ? 'Create account' : 'Sign in'}
              </motion.button>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
