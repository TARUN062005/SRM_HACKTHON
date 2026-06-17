import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { 
  User, Shield, Edit3, Mail, MapPin, Globe, Clock, 
  Activity, Layers, Calendar, ChevronDown, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ProfilePage = () => {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  
  const [profileData, setProfileData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [shipmentsCount, setShipmentsCount] = useState(0);
  const [activeRoutesCount, setActiveRoutesCount] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatarError, setAvatarError] = useState(false);
  
  // For paged/lazy loading of activity logs
  const [visibleLogsCount, setVisibleLogsCount] = useState(6);

  const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

  // Reset avatar image error when the user profileImage changes
  useEffect(() => {
    setAvatarError(false);
  }, [profileData?.profileImage, authUser?.profileImage]);

  useEffect(() => {
    const fetchFullProfile = async () => {
      try {
        const [profileRes, activityRes, shipmentsRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user/profile`, { withCredentials: true }),
          axios.get(`${BASE_URL}/api/user/activity`, { withCredentials: true }),
          axios.get(`${BASE_URL}/api/ai/shipments`, { withCredentials: true })
        ]);

        setProfileData(profileRes.data.user);
        
        const logs = activityRes.data.logs || [];
        setActivities(logs);

        if (shipmentsRes.data?.success && Array.isArray(shipmentsRes.data.shipments)) {
          const list = shipmentsRes.data.shipments;
          setShipmentsCount(list.length);
          
          // Count active or in-transit shipments
          const activeCount = list.filter(s => {
            const status = (s.status || '').toUpperCase();
            return status === 'ACTIVE' || status === 'IN_TRANSIT' || status === 'TRANSIT';
          }).length;
          
          setActiveRoutesCount(activeCount || Math.min(1, list.length));
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        setError('Could not sync node telemetry.');
      } finally {
        setLoading(false);
      }
    };

    fetchFullProfile();
  }, [BASE_URL]);

  const displayUser = profileData || authUser;

  // Joined Date Formatter
  const joinedDate = useMemo(() => {
    const dateStr = displayUser?.createdAt;
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [displayUser?.createdAt]);

  // Count Risk assessments from activity logs
  const riskAssessmentsPerformed = useMemo(() => {
    return activities.filter(a => {
      const act = (a.action || '').toLowerCase();
      return act.includes('risk') || act.includes('analyze') || act.includes('route') || act.includes('shipment');
    }).length || shipmentsCount;
  }, [activities, shipmentsCount]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="h-16 w-16 border-t-2 border-cyan-400 rounded-full animate-spin" />
          <User className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400 animate-pulse" size={24} />
        </div>
        <p className="text-slate-500 font-bold tracking-widest uppercase text-[10px]">Syncing Telemetry...</p>
      </div>
    );
  }

  const handleLoadMoreLogs = () => {
    setVisibleLogsCount(prev => prev + 6);
  };

  const paginatedLogs = activities.slice(0, visibleLogsCount);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-32 text-slate-100 font-sans"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Side: Profile Details & Overview Stats */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* 1. PROFILE HEADER CARD */}
          <div className="bg-[#101826]/85 border border-slate-800/60 backdrop-blur-2xl rounded-[32px] p-8 relative overflow-hidden shadow-2xl flex flex-col items-center text-center gap-6">
            {/* Glow vector effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-500/5 blur-[90px] pointer-events-none" />
            
            {/* Avatar Area */}
            <div className="relative group">
              <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-slate-800/80 bg-slate-950 flex items-center justify-center shadow-xl transition-all group-hover:scale-[1.03] duration-300">
                {displayUser?.profileImage && !avatarError ? (
                  <img 
                    src={displayUser.profileImage} 
                    alt="Profile" 
                    className="w-full h-full object-cover" 
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <span className="text-3xl font-black text-cyan-400">
                    {displayUser?.name?.charAt(0) || 'U'}
                  </span>
                )}
              </div>
              <div className={`absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-4 border-[#101826] shadow-lg ${displayUser?.isActive !== false ? 'bg-green-500' : 'bg-slate-400'}`} />
            </div>

            {/* User Identity Details */}
            <div className="space-y-4 w-full">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                  <Shield size={10} /> Secure Identity Module
                </div>
                <h2 className="text-xl font-black text-white tracking-tight break-words">
                  {displayUser?.name || 'Operative'}
                </h2>
                <p className="text-xs text-slate-400 font-semibold flex items-center justify-center gap-1.5 break-all">
                  <Mail size={13} className="text-slate-500 flex-shrink-0" /> {displayUser?.email}
                </p>
              </div>

              <div className="flex flex-col gap-2.5 text-xs text-slate-400 pt-3 border-t border-slate-800/40 max-w-md mx-auto text-left">
                <div className="flex items-center gap-2 font-medium">
                  <Calendar size={13} className="text-slate-500" />
                  <span>Joined: <b className="text-slate-300">{joinedDate}</b></span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Globe size={13} className="text-slate-500" />
                  <span>Clearance: <b className="text-cyan-400 capitalize">{displayUser?.role || 'operator'}</b></span>
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <div className="pt-2 w-full">
              <button
                onClick={() => navigate('/settings?tab=profile')}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 hover:bg-[#101826] rounded-2xl text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Edit3 size={13} className="text-cyan-400" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* 2. ACCOUNT OVERVIEW CARD */}
          <div className="bg-[#101826]/80 border border-slate-800/85 backdrop-blur-xl rounded-[24px] p-6 shadow-2xl space-y-4">
            <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest leading-none">
              Intelligence &amp; Fleet Overview
            </h3>
            
            <div className="flex flex-col gap-3">
              <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <Layers size={16} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Total Shipments</span>
                  <span className="text-lg font-black text-white leading-none mt-1 block">{shipmentsCount}</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Activity size={16} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Active Transits</span>
                  <span className="text-lg font-black text-white leading-none mt-1 block">{activeRoutesCount}</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                  <Shield size={16} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Risk Assessments</span>
                  <span className="text-lg font-black text-white leading-none mt-1 block">{riskAssessmentsPerformed}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Activity Logs */}
        <div className="lg:col-span-2">
          {/* 3. ACTIVITY LOGS CARD */}
          <div className="bg-[#101826]/80 border border-slate-800/80 backdrop-blur-xl rounded-[24px] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest leading-none">
                Secure Activity Logs
              </h3>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                {activities.length} entries recorded
              </span>
            </div>

            {/* Scrollable Container with Fixed Max Height */}
            <div className="max-h-[500px] overflow-y-auto pr-1 scrollbar-thin divide-y divide-slate-800/40 border border-slate-850/60 rounded-xl bg-slate-950/40">
              {activities.length > 0 ? (
                <div className="divide-y divide-slate-800/40">
                  <AnimatePresence>
                    {paginatedLogs.map((log, i) => {
                      const isSuccess = (log.action || '').toLowerCase().includes('success') || (log.action || '').toLowerCase().includes('verified') || (log.action || '').toLowerCase().includes('saved');
                      
                      return (
                        <motion.div
                          key={log.id || i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-4 flex items-center justify-between group hover:bg-[#101826]/30 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {isSuccess ? (
                              <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                            ) : (
                              <ShieldAlert size={14} className="text-cyan-500 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
                                {log.action}
                              </p>
                              <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">
                                {log.details || 'Identity Verified'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 pl-4">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                              {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : '—'}
                            </p>
                            <p className="text-[9px] text-slate-600 font-mono mt-0.5">{log.ip || '127.0.0.1'}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="p-16 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                  No secure system logs identified
                </div>
              )}
            </div>

            {/* Load More Control */}
            {activities.length > visibleLogsCount && (
              <button
                onClick={handleLoadMoreLogs}
                className="w-full py-2.5 rounded-xl border border-slate-800 hover:border-cyan-500/20 text-[10px] font-black uppercase tracking-wider text-cyan-400 hover:bg-[#101826]/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ChevronDown size={12} />
                <span>Load More Activity Logs</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProfilePage;
