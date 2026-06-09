import React, { useEffect, useState } from 'react';
import { Shield, Github, ArrowRight, ArrowLeft, Mail, Lock, User as UserIcon, ShieldCheck, HelpCircle, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authService from '../lib/auth/authService';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

const AuthPage = () => {
  const { user, loading, setUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Navigation states: 'login' | 'register' | 'forgot' | 'verify'
  const [view, setView] = useState('login');

  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSentEmail, setResetSentEmail] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState('');

  // Local state helper for verification code display
  const [receivedCode, setReceivedCode] = useState('');

  // Loading indicator for API calls
  const [submitting, setSubmitting] = useState(false);

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

  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: 'None', color: 'bg-slate-800' };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500/80' };
    if (score <= 4) return { score, label: 'Medium', color: 'bg-yellow-500/80' };
    if (score === 5) return { score, label: 'Strong', color: 'bg-green-500/80' };
    return { score, label: 'Excellent', color: 'bg-cyan-500/80' };
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Please fill in all fields');

    setSubmitting(true);
    try {
      const res = await authService.login(email, password, rememberMe);
      if (res.data?.success) {
        toast.success('Login successful!');
        setUser(res.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to sign in. Please verify your credentials.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !password || !name) return toast.error('Please fill in all fields');
    if (password !== confirmPassword) return toast.error('Passwords do not match');

    const strength = getPasswordStrength(password);
    if (strength.label === 'Weak') return toast.error('Password is too weak. Must be at least 8 characters with numbers & symbols.');

    setSubmitting(true);
    try {
      const res = await authService.register(email, password, name);
      if (res.data?.success) {
        toast.success(res.data.message || 'Registration successful!');
        setVerifyingEmail(email);
        setReceivedCode(res.data.code || ''); // Safe storage for verification demo ease
        setView('verify');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code) return toast.error('Verification code is required');

    setSubmitting(true);
    try {
      const res = await authService.verifyEmail(verifyingEmail, code);
      if (res.data?.success) {
        toast.success('Email verified successfully! You can now log in.');
        setView('login');
        setPassword('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Email is required');

    setSubmitting(true);
    try {
      const res = await authService.forgotPassword(email);
      if (res.data?.success) {
        toast.success('Password reset code generated!');
        setResetSentEmail(email);
        setReceivedCode(res.data.code || ''); // Safe storage for reset demo ease
        setCode('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!code || !newPassword) return toast.error('Verification code and new password are required');

    setSubmitting(true);
    try {
      const res = await authService.resetPassword(resetSentEmail, code, newPassword);
      if (res.data?.success) {
        toast.success('Password reset successfully! Please log in.');
        setView('login');
        setEmail(resetSentEmail);
        setPassword('');
        setNewPassword('');
        setResetSentEmail('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-[#060B18] text-[#F1F5F9] overflow-hidden">
      {/* 60% Left Panel - Enterprise Graphics */}
      <div className="hidden lg:flex lg:col-span-7 bg-[#040813] relative overflow-hidden flex-col justify-between p-12 border-r border-slate-900/60 select-none">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-600/5 rounded-full blur-[120px]" />

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-500/30 p-2 bg-cyan-950/20">
            <Shield size={20} className="text-cyan-400" />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">RouteGuardian</span>
        </div>

        <div className="space-y-6 max-w-lg z-10">
          <h2 className="text-3xl lg:text-4xl font-black text-white leading-tight">
            Logistics Route Risk Sifting & Fleet Assurance
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
            Overlay direct coordinates, OSRM vectors, global geopolitical threat layers, and meteorological warnings instantly. Secure transit corridors deterministically.
          </p>
          <div className="flex gap-4 pt-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <ShieldCheck size={12} className="text-cyan-400" /> Vector Verification
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <Globe size={12} className="text-cyan-400" /> Threat Mapping
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-600 font-extrabold uppercase tracking-widest">
          RouteGuardian Console Terminal v3.1
        </p>
      </div>

      {/* 40% Right Panel - Auth Forms */}
      <div className="col-span-12 lg:col-span-5 flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-y-auto">
        <div className="w-full max-w-[360px] space-y-6">
          
          {/* Header Mobile Logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center mb-6">
            <div className="rounded-xl border border-cyan-500/30 p-2 bg-cyan-950/20">
              <Shield size={18} className="text-cyan-400" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">RouteGuardian</span>
          </div>

          <AnimatePresence mode="wait">
            
            {/* 1. LOGIN VIEW */}
            {view === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className="space-y-1.5 text-center lg:text-left">
                  <h1 className="text-xl font-black tracking-tight text-white uppercase">Console Identity sign-in</h1>
                  <p className="text-xs text-slate-400">Provide credentials to retrieve active fleet sessions.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Mail size={11} className="text-slate-500" /> Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="operator@routeguardian.com"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Lock size={11} className="text-slate-500" /> Security Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setView('forgot')}
                        className="text-[9px] font-black uppercase text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        Reset Password?
                      </button>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400 text-xs">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="rounded bg-[#070D1E] border-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-[10px] font-bold tracking-wide">Remember terminal session</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 text-xs font-black uppercase tracking-wider transition-all transform active:scale-[0.98] shadow-md shadow-cyan-500/5 flex items-center justify-center"
                  >
                    {submitting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : 'Decrypt Console Link'}
                  </button>
                </form>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-800/80"></div>
                  <span className="flex-shrink mx-3 text-[9px] text-slate-500 font-extrabold uppercase tracking-widest">or integrate via</span>
                  <div className="flex-grow border-t border-slate-800/80"></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleSocial('google')}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:bg-slate-800/60 transition-all text-xs font-bold"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.9" />
                      <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.9" />
                      <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.9" />
                    </svg>
                    Google
                  </button>
                  <button
                    onClick={() => handleSocial('github')}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:bg-slate-800/60 transition-all text-xs font-bold"
                  >
                    <Github size={13} className="text-white" />
                    GitHub
                  </button>
                </div>

                <div className="text-center pt-3">
                  <p className="text-xs text-slate-500 font-semibold">
                    New operator?{' '}
                    <button
                      onClick={() => setView('register')}
                      className="text-cyan-400 hover:text-cyan-300 font-extrabold hover:underline"
                    >
                      Provision Console Access
                    </button>
                  </p>
                </div>
              </motion.div>
            )}

            {/* 2. REGISTER VIEW */}
            {view === 'register' && (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="space-y-1.5 text-center lg:text-left">
                  <h1 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-1.5">
                    <ArrowLeft size={16} className="cursor-pointer text-slate-400 hover:text-white" onClick={() => setView('login')} /> Propose Operator Node
                  </h1>
                  <p className="text-xs text-slate-400">Generate a local RouteGuardian operator identity.</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <UserIcon size={11} className="text-slate-500" /> Operator Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Captain Archer"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Mail size={11} className="text-slate-500" /> Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="operator@routeguardian.com"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Lock size={11} className="text-slate-500" /> Terminal Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                    
                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="space-y-1 pt-1.5 animate-fade-in">
                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                          <span>Security Level</span>
                          <span className="uppercase" style={{ color: strength.color.includes('cyan') ? '#00C2FF' : strength.color.includes('green') ? '#22C55E' : '#94A3B8' }}>{strength.label}</span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${strength.color} transition-all duration-300`}
                            style={{ width: `${(strength.score / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Lock size={11} className="text-slate-500" /> Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 text-xs font-black uppercase tracking-wider transition-all transform active:scale-[0.98] shadow-md shadow-cyan-500/5 flex items-center justify-center pt-2.5"
                  >
                    {submitting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : 'Provision Secure Vector Link'}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <p className="text-xs text-slate-500 font-semibold">
                    Existing terminal profile?{' '}
                    <button
                      onClick={() => setView('login')}
                      className="text-cyan-400 hover:text-cyan-300 font-extrabold hover:underline"
                    >
                      Verify Identity
                    </button>
                  </p>
                </div>
              </motion.div>
            )}

            {/* 3. VERIFY EMAIL VIEW */}
            {view === 'verify' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="space-y-1.5 text-center lg:text-left">
                  <h1 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-1.5">
                    <ArrowLeft size={16} className="cursor-pointer text-slate-400 hover:text-white" onClick={() => setView('register')} /> Verify Operator Email
                  </h1>
                  <p className="text-xs text-slate-400">A verification code has been generated for {verifyingEmail || 'your email'}.</p>
                </div>

                {/* Demonstration Alert showing code */}
                {receivedCode && (
                  <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl text-xs text-cyan-400 flex items-start gap-2.5 leading-relaxed font-semibold animate-fade-in">
                    <HelpCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase">Demo Alert System</p>
                      <p className="mt-0.5">Verification code generated: <span className="font-extrabold tracking-widest text-[#FFF] underline">{receivedCode}</span></p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      6-Digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-center tracking-[0.4em] font-extrabold text-sm text-white outline-none focus:ring-1 focus:ring-cyan-500/35 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 text-xs font-black uppercase tracking-wider transition-all transform active:scale-[0.98] flex items-center justify-center"
                  >
                    {submitting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : 'Confirm Verification Node'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* 4. FORGOT PASSWORD VIEW */}
            {view === 'forgot' && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="space-y-1.5 text-center lg:text-left">
                  <h1 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-1.5">
                    <ArrowLeft size={16} className="cursor-pointer text-slate-400 hover:text-white" onClick={() => setView('login')} /> Request Reset Link
                  </h1>
                  <p className="text-xs text-slate-400">Request a verification reset code to replace key strings.</p>
                </div>

                {/* Demonstration Alert showing reset code */}
                {receivedCode && resetSentEmail && (
                  <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl text-xs text-cyan-400 flex items-start gap-2.5 leading-relaxed font-semibold animate-fade-in">
                    <HelpCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase">Demo Alert System</p>
                      <p className="mt-0.5">Password reset code generated: <span className="font-extrabold tracking-widest text-[#FFF] underline">{receivedCode}</span></p>
                    </div>
                  </div>
                )}

                {/* If code requested, show password reset form, otherwise show request form */}
                {!resetSentEmail ? (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Mail size={11} className="text-slate-500" /> Account Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="operator@routeguardian.com"
                        className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 text-xs font-black uppercase tracking-wider transition-all transform active:scale-[0.98] flex items-center justify-center"
                    >
                      {submitting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : 'Request Identity Reset Code'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        6-Digit Reset Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-center font-extrabold text-sm tracking-[0.2em] text-white outline-none focus:ring-1 focus:ring-cyan-500/35 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        New Security Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#070D1E]/80 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-500/35 font-semibold transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-900 text-xs font-black uppercase tracking-wider transition-all transform active:scale-[0.98] flex items-center justify-center"
                    >
                      {submitting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : 'Confirm Credentials Modification'}
                    </button>
                  </form>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;