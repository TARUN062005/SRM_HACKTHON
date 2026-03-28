import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { 
  User, Shield, Edit3, CheckCircle2, Mail, Phone, MapPin, Globe, Clock, 
  ArrowRight, Activity, Zap, Play, ChevronRight, Layers, BellRing, Cpu, Fingerprint 
} from 'lucide-react';
import { motion } from 'framer-motion';

const ProfilePage = () => {
  const { user: authUser } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchFullProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        const [profileRes, activityRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user/profile`, { headers }),
          axios.get(`${BASE_URL}/api/user/activity`, { headers }),
        ]);

        setProfileData(profileRes.data.user);
        setActivities(activityRes.data.logs || []);
      } catch (err) {
        console.error('Profile fetch error:', err);
        setError('Could not load profile data.');
      } finally {
        setLoading(false);
      }
    };

    fetchFullProfile();
  }, [BASE_URL]);

  const displayUser = profileData || authUser;

  // ✅ Age calculation from DOB
  const ageText = useMemo(() => {
    const dob = displayUser?.dob;
    if (!dob) return 'Not Set';
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return 'Invalid DOB';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 0 ? 'Invalid DOB' : `${age} years`;
  }, [displayUser?.dob]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="h-20 w-20 border-t-2 border-primary-600 rounded-full animate-spin" />
          <User className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-600" size={32} />
        </div>
        <p className="text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase text-[10px]">Synchronizing Profile...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-32"
    >
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-600/10 border border-primary-600/20 text-primary-600 text-[10px] font-black uppercase tracking-widest">
            <Shield size={12} /> Secure Identity Module
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
            Account Node
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Biometric verification and system clearance history.
          </p>
        </div>

        <button
          onClick={() => (window.location.href = '/settings')}
          className="bg-primary-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-primary-700 transition-all shadow-xl shadow-primary-600/20 flex items-center justify-center space-x-3 active:scale-95 text-sm"
        >
          <Edit3 size={18} />
          <span>Modify Clearance</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT PROFILE CARD */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] p-10 border border-white dark:border-slate-800 shadow-xl text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600/5 blur-[50px] group-hover:bg-primary-600/10 transition-colors" />
            
            <div className="relative inline-block mb-8">
              <div className="h-32 w-32 sm:h-40 sm:w-40 bg-slate-100 dark:bg-slate-800/50 rounded-full mx-auto flex items-center justify-center text-primary-600 text-5xl font-black shadow-2xl overflow-hidden border-4 border-white dark:border-slate-800">
                {displayUser?.profileImage ? (
                  <img src={displayUser.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  displayUser?.name?.charAt(0) || 'U'
                )}
              </div>
              <div className={`absolute bottom-2 right-2 h-6 w-6 rounded-full border-4 border-white dark:border-slate-900 shadow-lg ${displayUser?.isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
            </div>

            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
              {displayUser?.name || 'Anonymous'}
            </h2>
            <p className="text-primary-600 font-black uppercase text-[10px] tracking-[0.3em] mb-8">
              {displayUser?.role || 'Operator'} • Lvl 4 Security
            </p>

            <div className="flex flex-wrap justify-center gap-3 mb-10">
              <span className="px-4 py-1.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                Age: {ageText}
              </span>
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${displayUser?.emailVerified ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-orange-500/10 text-orange-600 border border-orange-500/20'}`}>
                {displayUser?.emailVerified ? 'Identity Verified' : 'Vetting Pending'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-10 border-t border-slate-100 dark:border-slate-800">
              <div className="text-center">
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">{activities.length}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Logs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">{displayUser?.country || 'NA'}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Region</p>
              </div>
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2rem] p-8 border border-white dark:border-slate-800 shadow-xl space-y-4">
             <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-emerald-600 font-bold text-sm">
                <CheckCircle2 size={18} /> System Integrity Optimal
             </div>
             <div className="flex items-center gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-blue-600 font-bold text-sm">
                <Shield size={18} /> Neural Handshake Active
             </div>
          </div>
        </div>

        {/* RIGHT INFO CARDS */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <User size={20} className="text-primary-600" /> Clearance Intelligence
              </h3>
            </div>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              {[
                { label: 'Primary Email', val: displayUser?.email || '—', icon: <Mail /> },
                { label: 'Contact Comms', val: displayUser?.phone || 'Not Registered', icon: <Phone /> },
                { label: 'Origin Point', val: displayUser?.location || 'Undisclosed', icon: <MapPin /> },
                { label: 'Clearance Level', val: 'Level 4 Intelligence', icon: <Globe /> },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-4 group">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-[1.25rem] text-slate-400 group-hover:text-primary-600 transition-colors">
                    {React.cloneElement(item.icon, { size: 20 })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="text-slate-900 dark:text-white font-bold truncate text-base">{item.val}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-10 pb-10">
               <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[1.5rem] border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">System Biography</p>
                  <p className="text-slate-600 dark:text-slate-300 font-medium italic">"{displayUser?.bio || 'No operative biography provided yet.'}"</p>
               </div>
            </div>
          </div>

          {/* Activity Logs */}
          <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <Clock size={20} className="text-primary-600" /> Neural Activity Log
              </h3>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activities.length > 0 ? (
                activities.slice(0, 8).map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    className="p-8 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-5">
                      <div className={`h-3 w-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)] ${log.action?.includes('Success') ? 'bg-green-500' : 'bg-primary-500'}`} />
                      <div>
                        <p className="text-slate-900 dark:text-white font-black text-sm group-hover:text-primary-600 transition-colors">
                          {log.action}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          {log.details || 'Identity Handshake'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.createdAt ? new Date(log.createdAt).toLocaleDateString() : '—'}</p>
                       <p className="text-[10px] text-slate-300 font-mono mt-1">{log.ip || '0.0.0.0'}</p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No Secure Logs Identified</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProfilePage;
