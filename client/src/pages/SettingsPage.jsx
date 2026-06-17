import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  User, Shield, Trash2, AlertCircle, Save, Sun, Moon, Monitor,
  Camera, Phone, Calendar, MapPin, Globe, Loader2,
  Lock, Unlock, Palette, CheckCircle, Check, Copy, Eye, EyeOff,
  QrCode, Laptop, Smartphone, Key
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'profile',    label: 'Profile Info',  Icon: User },
  { id: 'security',   label: 'Security',      Icon: Shield },
];

const SettingsPage = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  // Tab State
  const [activeSection, setActiveSection] = useState('appearance');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || params.get('section');
    if (tab && ['appearance', 'profile', 'security'].includes(tab)) {
      setActiveSection(tab);
    }
  }, []);

  // Profile Form States
  const [formData, setFormData] = useState({
    name:     user?.name     || '',
    bio:      user?.bio      || '',
    gender:   user?.gender   || '',
    phone:    user?.phone    || '',
    dob:      user?.dob ? String(user.dob).slice(0, 10) : '',
    location: user?.location || '',
    country:  user?.country  || '',
  });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profilePreview, setProfilePreview]     = useState(user?.profileImage || '');
  const [removeProfileImage, setRemoveProfileImage] = useState(false);

  // Theme Settings
  const [selectedTheme, setSelectedTheme] = useState('dark');

  // Delete account confirmation modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Suspend account confirmation modal state
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Sync state if user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name:     user.name     || '',
        bio:      user.bio      || '',
        gender:   user.gender   || '',
        phone:    user.phone    || '',
        dob:      user.dob ? String(user.dob).slice(0, 10) : '',
        location: user.location || '',
        country:  user.country  || '',
      });
      setProfilePreview(user.profileImage || '');
      setRemoveProfileImage(false);
      setProfileImageFile(null);
    }
  }, [user]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (profilePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(profilePreview);
      }
    };
  }, [profilePreview]);

  // Image upload
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image too large — max 2 MB');
      return;
    }
    setProfileImageFile(file);
    if (profilePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(profilePreview);
    }
    setProfilePreview(URL.createObjectURL(file));
    setRemoveProfileImage(false);
    toast.success('New photo loaded. Click "Save Changes" to apply.');
  };

  const handleRemoveImage = () => {
    setProfileImageFile(null);
    if (profilePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(profilePreview);
    }
    setProfilePreview('');
    setRemoveProfileImage(true);
    toast.success('Photo removed. Save changes to update database.');
  };

  // Submit Profile Information
  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        if (k !== 'profileImage') {
          fd.append(k, v || '');
        }
      });
      if (profileImageFile) {
        fd.append('profileImage', profileImageFile);
      } else if (removeProfileImage) {
        fd.append('removeProfileImage', 'true');
      }

      const res = await axios.patch(`${BASE_URL}/api/user/settings`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });

      if (res.data?.success) {
        toast.success('Profile details updated successfully');
        if (res.data.user) {
          setUser(res.data.user); // updates global auth state
        }
      } else {
        toast.error(res.data?.message || 'Update failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdateLoading(false);
    }
  };

  // Suspend or delete account
  const handleAccountAction = async (type) => {
    if (type === 'permanent') {
      setIsDeleteModalOpen(true);
      setDeleteConfirmInput('');
      return;
    }
    if (type === 'suspend') {
      setIsSuspendModalOpen(true);
      return;
    }
  };

  const handleConfirmSuspendAccount = async () => {
    setSuspendLoading(true);
    try {
      await axios.delete(`${BASE_URL}/api/user/account?type=suspend`, { withCredentials: true });
      toast.success('Account suspended successfully.');
      setIsSuspendModalOpen(false);
      logout();
    } catch {
      toast.error('Failed to suspend account. Please try again.');
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmInput !== 'DELETE') {
      toast.error('Please type DELETE to confirm.');
      return;
    }
    setDeleteLoading(true);
    try {
      await axios.delete(`${BASE_URL}/api/user/account?type=permanent`, { withCredentials: true });
      toast.success('Account permanently deleted.');
      setIsDeleteModalOpen(false);
      logout();
    } catch {
      toast.error('Failed to delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLogoutAllSessions = async () => {
    if (!window.confirm('Are you sure you want to sign out of all active sessions? You will be logged out of this device as well.')) return;
    try {
      const res = await axios.post(`${BASE_URL}/api/user/logout-all`, {}, { withCredentials: true });
      if (res.data?.success) {
        toast.success('Successfully logged out of all sessions.');
        logout();
      } else {
        toast.error(res.data?.message || 'Failed to logout all sessions.');
      }
    } catch (err) {
      toast.error('Failed to logout all sessions.');
    }
  };

  // Theme card action handlers
  const handleThemeSelect = (themeId) => {
    if (themeId === 'light') {
      toast('Tactical dark theme enforced by security protocol.', {
        icon: '🔒',
        style: {
          background: '#101826',
          color: '#FF5C7A',
          border: '1px solid rgba(255, 92, 122, 0.2)'
        }
      });
      return;
    }
    setSelectedTheme(themeId);
    if (themeId === 'system') {
      toast.success('System settings synchronized');
    }
  };

  return (
    <div className="min-h-full py-8 px-4 sm:px-6 lg:px-8 bg-[#081120] text-[#F3F6FA] flex justify-center items-start">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Title Header */}
        <div className="border-b border-white/5 pb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#00C2FF] mb-1">
            System Settings
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white">Settings</h1>
          <p className="text-sm mt-1 text-[#9AA7B5]">
            Manage profile details, security settings, 2FA credentials, and system visual configurations.
          </p>
        </div>

        {/* Tab Navigation Menu */}
        <div className="flex border-b border-white/5 pb-px gap-6 overflow-x-auto no-scrollbar">
          {SECTIONS.map(({ id, label, Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className="relative pb-4 text-sm font-semibold transition-colors focus:outline-none flex items-center gap-2 flex-shrink-0 cursor-pointer"
                style={{ color: isActive ? '#00C2FF' : '#9AA7B5' }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeSettingsTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C2FF]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            
            {/* APPEARANCE SECTION */}
            {activeSection === 'appearance' && (
              <motion.div
                key="appearance"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                <div className="bg-[#101826] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-xl">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Palette className="text-[#00C2FF]" size={18} />
                      Visual Mode Configuration
                    </h2>
                    <p className="text-sm text-[#9AA7B5] mt-1">
                      Choose how the interface and geospatial data grids render on your machine.
                    </p>
                  </div>

                  {/* Theme Previews Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    
                    {/* Dark Card */}
                    <div
                      onClick={() => handleThemeSelect('dark')}
                      className={`relative rounded-xl border p-4 bg-[#0B1220] cursor-pointer transition-all duration-200 group flex flex-col justify-between h-48 ${
                        selectedTheme === 'dark'
                          ? 'border-[#00C2FF] shadow-[0_0_15px_rgba(0,194,255,0.15)]'
                          : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Moon size={13} className="text-[#00C2FF]" /> Tactical Dark
                        </span>
                        {selectedTheme === 'dark' && (
                          <span className="w-4 h-4 rounded-full bg-[#00C2FF] flex items-center justify-center text-[#081120]">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      
                      {/* Mini Mockup Visual */}
                      <div className="flex-1 mt-4 bg-[#050B15]/90 rounded-lg overflow-hidden border border-white/5 flex p-1.5 gap-1.5 select-none">
                        <div className="w-1/4 h-full bg-[#101826]/70 rounded-md border border-white/5 flex flex-col p-1 gap-1">
                          <div className="w-full h-1 bg-white/10 rounded" />
                          <div className="w-3/4 h-1 bg-white/10 rounded" />
                          <div className="w-1/2 h-1 bg-white/10 rounded" />
                        </div>
                        <div className="flex-1 h-full bg-[#081120] rounded-md border border-white/5 p-1.5 flex flex-col justify-between">
                          <div className="flex gap-1">
                            <div className="w-6 h-1.5 bg-[#00C2FF]/20 rounded border border-[#00C2FF]/30" />
                            <div className="w-4 h-1.5 bg-white/5 rounded" />
                          </div>
                          {/* Route line simulation */}
                          <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
                            <svg className="w-full h-8 overflow-visible" stroke="#00C2FF" strokeWidth={1} fill="none">
                              <path d="M 5,20 C 15,5 25,35 40,10 C 50,5 65,30 85,25" />
                              <circle cx={5} cy={20} r={1.5} fill="#00C2FF" />
                              <circle cx={85} cy={25} r={1.5} fill="#00C2FF" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Light Card */}
                    <div
                      onClick={() => handleThemeSelect('light')}
                      className="relative rounded-xl border p-4 bg-slate-100 cursor-pointer transition-all duration-200 flex flex-col justify-between h-48 border-white/5 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Sun size={13} className="text-slate-500" /> Day Ops
                        </span>
                        <span className="text-[9px] font-black uppercase bg-slate-300/60 text-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Lock size={9} /> Locked
                        </span>
                      </div>

                      {/* Mini Mockup Visual */}
                      <div className="flex-1 mt-4 bg-white rounded-lg overflow-hidden border border-slate-300/40 flex p-1.5 gap-1.5 select-none opacity-40">
                        <div className="w-1/4 h-full bg-slate-100 rounded-md border border-slate-200 flex flex-col p-1 gap-1">
                          <div className="w-full h-1 bg-slate-300 rounded" />
                          <div className="w-3/4 h-1 bg-slate-300 rounded" />
                          <div className="w-1/2 h-1 bg-slate-300 rounded" />
                        </div>
                        <div className="flex-1 h-full bg-slate-50 rounded-md border border-slate-200 p-1.5 flex flex-col justify-between">
                          <div className="flex gap-1">
                            <div className="w-6 h-1.5 bg-slate-300 rounded" />
                            <div className="w-4 h-1.5 bg-slate-200 rounded" />
                          </div>
                          <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
                            <svg className="w-full h-8 overflow-visible" stroke="#475569" strokeWidth={1} fill="none">
                              <path d="M 5,20 C 15,5 25,35 40,10 C 50,5 65,30 85,25" />
                              <circle cx={5} cy={20} r={1.5} fill="#475569" />
                              <circle cx={85} cy={25} r={1.5} fill="#475569" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Hover Overlay locked tag */}
                      <div className="absolute inset-0 bg-slate-900/90 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-3 text-center">
                        <Lock size={16} className="text-[#FF5C7A] mb-1" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">Tactical Standard Only</span>
                        <span className="text-[9px] text-[#9AA7B5] mt-1">Dark mode required for night routing visualization.</span>
                      </div>
                    </div>

                    {/* System Card */}
                    <div
                      onClick={() => handleThemeSelect('system')}
                      className={`relative rounded-xl border p-4 bg-[#0B1220] cursor-pointer transition-all duration-200 group flex flex-col justify-between h-48 ${
                        selectedTheme === 'system'
                          ? 'border-[#00C2FF] shadow-[0_0_15px_rgba(0,194,255,0.15)]'
                          : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Monitor size={13} className="text-[#00C2FF]" /> System Native
                        </span>
                        {selectedTheme === 'system' && (
                          <span className="w-4 h-4 rounded-full bg-[#00C2FF] flex items-center justify-center text-[#081120]">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        )}
                      </div>

                      {/* Split View Mockup */}
                      <div className="flex-1 mt-4 rounded-lg overflow-hidden border border-white/5 flex select-none relative bg-[#050B15]">
                        <div className="absolute inset-0 bg-[#0B1220] flex p-1.5 gap-1.5">
                          {/* Split Diagonal Cover */}
                          <div className="w-1/4 h-full bg-[#101826]/70 rounded-md border border-white/5 flex flex-col p-1 gap-1">
                            <div className="w-full h-1 bg-white/10 rounded" />
                            <div className="w-3/4 h-1 bg-white/10 rounded" />
                          </div>
                          <div className="flex-1 h-full bg-[#081120] rounded-md border border-white/5 p-1.5 flex flex-col justify-between">
                            <div className="flex gap-1">
                              <div className="w-6 h-1.5 bg-[#00C2FF]/20 rounded border border-[#00C2FF]/30" />
                            </div>
                            <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
                              <svg className="w-full h-8 overflow-visible" stroke="#00C2FF" strokeWidth={1} fill="none">
                                <path d="M 5,20 C 15,5 25,35 40,10 C 50,5 65,30 85,25" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        {/* Right diagonal light split */}
                        <div 
                          className="absolute right-0 top-0 bottom-0 bg-slate-100 border-l border-slate-300 flex p-1.5 gap-1.5 overflow-hidden" 
                          style={{ width: '45%', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
                        >
                          <div className="flex-1 h-full bg-slate-50 rounded-md border border-slate-200 p-1.5 flex flex-col justify-between items-end">
                            <div className="w-6 h-1.5 bg-slate-300 rounded" />
                            <svg className="w-full h-8 overflow-visible" stroke="#475569" strokeWidth={1} fill="none">
                              <path d="M -20,20 C -10,5 0,35 15,10 C 25,5 40,30 60,25" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Info Tip Panel */}
                <div className="rounded-xl border border-[#00C2FF]/10 bg-[#00C2FF]/5 p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#00C2FF]/10 border border-[#00C2FF]/20 flex-shrink-0">
                    <CheckCircle className="text-[#00C2FF]" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Visual System Active</p>
                    <p className="text-xs text-[#9AA7B5] mt-0.5">
                      Your RouteGuardian view uses Dark Mode by default. Light controls are disabled to protect night operations mapping contrast.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PROFILE INFO SECTION */}
            {activeSection === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                <form onSubmit={handleUpdate} className="bg-[#101826] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                  
                  {/* Card Title Header with Upload */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <User className="text-[#00C2FF]" size={18} />
                        Profile Details
                      </h2>
                      <p className="text-sm text-[#9AA7B5] mt-1">
                        Update your professional details, contact information, and avatar.
                      </p>
                    </div>

                    {/* Avatar Upload Controller */}
                    <div className="flex items-center gap-4">
                      {/* Avatar preview shape */}
                      <div className="relative group w-20 h-20">
                        <div className="w-20 h-20 rounded-full overflow-hidden border border-white/10 bg-[#0B1220] flex items-center justify-center shadow-lg">
                          {profilePreview ? (
                            <img src={profilePreview} alt="User profile" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl font-black text-[#00C2FF]">
                              {formData.name ? formData.name.charAt(0).toUpperCase() : 'U'}
                            </span>
                          )}
                        </div>
                        {/* Overlay with camera icon */}
                        <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer">
                          <Camera size={18} className="text-white" />
                          <span className="text-[8px] text-white/80 font-bold uppercase mt-1">Edit</span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                        </label>
                      </div>

                      {/* Image Action Buttons */}
                      <div className="space-y-1">
                        <label className="block px-3 py-1.5 bg-[#0B1220] border border-white/5 rounded-lg text-xs font-bold text-white hover:border-[#00C2FF]/30 hover:bg-[#101826] cursor-pointer text-center transition-all duration-150">
                          Upload Photo
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                        </label>
                        {profilePreview && (
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="block w-full px-3 py-1.5 bg-transparent border border-red-500/10 rounded-lg text-xs font-bold text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all duration-150"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Form Input Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Full Name */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Your full name"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200"
                        />
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200"
                        />
                      </div>
                    </div>

                    {/* DOB */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <input
                          type="date"
                          value={formData.dob}
                          onChange={e => setFormData({ ...formData, dob: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200 scheme-dark"
                        />
                      </div>
                    </div>

                    {/* Gender select */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">Gender</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <select
                          value={formData.gender}
                          onChange={e => setFormData({ ...formData, gender: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200 cursor-pointer appearance-none"
                        >
                          <option value="" className="bg-[#0B1220]">Select Gender</option>
                          <option value="MALE" className="bg-[#0B1220]">Male</option>
                          <option value="FEMALE" className="bg-[#0B1220]">Female</option>
                          <option value="OTHER" className="bg-[#0B1220]">Other</option>
                        </select>
                      </div>
                    </div>

                    {/* City */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">City / Region</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <input
                          type="text"
                          value={formData.location}
                          onChange={e => setFormData({ ...formData, location: e.target.value })}
                          placeholder="City, State"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200"
                        />
                      </div>
                    </div>

                    {/* Country */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#9AA7B5]">Country</label>
                      <div className="relative">
                        <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8A99]" size={15} />
                        <input
                          type="text"
                          value={formData.country}
                          onChange={e => setFormData({ ...formData, country: e.target.value })}
                          placeholder="Country"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200"
                        />
                      </div>
                    </div>

                  </div>

                  {/* Bio Description Area */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#9AA7B5]">Biography</label>
                    <textarea
                      value={formData.bio}
                      rows="3"
                      onChange={e => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Brief description of your operational profile or division..."
                      className="w-full px-4 py-3 bg-[#0B1220] border border-white/5 rounded-xl text-sm font-medium text-white placeholder-[#7C8A99] focus:outline-none focus:border-[#00C2FF] focus:ring-1 focus:ring-[#00C2FF]/20 transition-all duration-200 resize-none"
                    />
                  </div>

                  {/* Save profile updates button */}
                  <div className="flex justify-end pt-4 border-t border-white/5">
                    <button
                      type="submit"
                      disabled={updateLoading}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#00C2FF] hover:bg-[#26d0ff] text-[#041019] transition-all duration-200 disabled:opacity-50 shadow-[0_4px_12px_rgba(0,194,255,0.15)] cursor-pointer"
                    >
                      {updateLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* SECURITY SECTION */}
            {activeSection === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-6 animate-fade-in"
              >
                {/* Real User Credentials Dashboard */}
                <div className="bg-[#101826] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Shield className="text-[#00C2FF]" size={18} />
                      Identity & Security Parameters
                    </h2>
                    <p className="text-sm text-[#9AA7B5] mt-1">
                      Review your terminal credentials and manage session validation.
                    </p>
                  </div>

                  {/* Dynamic User Profile parameters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {user?.email && (
                      <div className="bg-[#0B1220] border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                        <span className="text-xs font-bold text-[#9AA7B5]">Account Email</span>
                        <span className="text-sm font-bold text-white mt-1 truncate">{user.email}</span>
                      </div>
                    )}

                    {user?.role && (
                      <div className="bg-[#0B1220] border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                        <span className="text-xs font-bold text-[#9AA7B5]">Account Clearance Type</span>
                        <span className="text-sm font-bold text-[#00C2FF] mt-1 capitalize">
                          {user.role === 'ADMIN' ? 'Administrator' : 'Standard Operator'}
                        </span>
                      </div>
                    )}

                    {user?.createdAt && (
                      <div className="bg-[#0B1220] border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                        <span className="text-xs font-bold text-[#9AA7B5]">Node Provisioned Date</span>
                        <span className="text-sm font-bold text-white mt-1">
                          {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    )}

                    {user?.lastLogin && (
                      <div className="bg-[#0B1220] border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                        <span className="text-xs font-bold text-[#9AA7B5]">Last Terminal Handshake</span>
                        <span className="text-sm font-bold text-slate-300 mt-1">
                          {new Date(user.lastLogin).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sign Out All Sessions */}
                  <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Sign Out All Sessions</h4>
                      <p className="text-xs text-[#9AA7B5] mt-1">
                        Log out from all other active web sessions. This will invalidate all active session tokens immediately.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogoutAllSessions}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:border-[#00C2FF]/30 text-white hover:bg-white/10 transition-all flex-shrink-0 cursor-pointer text-center"
                    >
                      Terminate Sessions
                    </button>
                  </div>
                </div>

                {/* Account Lifecycle / Danger Zone Panel */}
                <div className="bg-[#101826] border border-red-500/15 rounded-2xl overflow-hidden shadow-xl">
                  {/* Danger Zone Title */}
                  <div className="bg-red-500/5 border-b border-red-500/15 px-6 py-4 flex items-center gap-3">
                    <AlertCircle className="text-[#FF5C7A]" size={18} />
                    <div>
                      <h3 className="text-sm font-bold text-[#FF5C7A]">Danger Zone</h3>
                      <p className="text-[11px] text-[#7C8A99] mt-0.5">
                        Lifecycle operations are destructive. Proceed with absolute caution.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Suspend option */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-white">Suspend Account Profile</h4>
                        <p className="text-[11px] text-[#9AA7B5] mt-0.5">
                          Disables your account credentials temporarily. Your data remains stored but logins will block until reactivation.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAccountAction('suspend')}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-red-500/25 hover:border-red-500/40 text-[#FF5C7A] hover:bg-red-500/5 transition-all flex-shrink-0 cursor-pointer"
                      >
                        <Shield size={12} />
                        Suspend Account
                      </button>
                    </div>

                    <div className="border-t border-white/5" />

                    {/* Delete option */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-white">Permanently Delete Account</h4>
                        <p className="text-[11px] text-[#9AA7B5] mt-0.5">
                          Completely erase all logistics logs, saved shipments, and account configuration parameters. This action is irreversible.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAccountAction('permanent')}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#FF5C7A] hover:bg-[#ff7a93] text-[#081120] transition-all flex-shrink-0 cursor-pointer shadow-md"
                      >
                        <Trash2 size={12} />
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>

                {/* Deletion Confirmation Modal */}
                {isDeleteModalOpen && (
                  <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                      onClick={() => setIsDeleteModalOpen(false)}
                    />
                    {/* Modal container */}
                    <div className="relative w-full max-w-md p-6 rounded-[24px] bg-[#0E1624] border border-red-500/20 shadow-2xl text-white z-10 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#FF5C7A]">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">Delete Account Node</h3>
                          <p className="text-xs text-[#9AA7B5] mt-0.5">Destructive and permanent operation.</p>
                        </div>
                      </div>
                      <p className="text-sm text-[#9AA7B5] leading-relaxed">
                        This action cannot be undone. All saved shipping vectors, history, and clearances will be completely erased.
                      </p>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-[#9AA7B5]">
                          Type <span className="text-red-400 font-extrabold">DELETE</span> to confirm
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmInput}
                          onChange={e => setDeleteConfirmInput(e.target.value)}
                          placeholder="DELETE"
                          className="w-full px-4 py-2.5 bg-[#081120] border border-white/5 rounded-xl text-sm font-semibold text-white placeholder-[#7C8A99] focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20 transition-all text-center"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          onClick={() => setIsDeleteModalOpen(false)}
                          className="px-4 py-2 bg-transparent border border-white/5 rounded-xl text-xs font-bold text-white hover:border-white/10 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmDeleteAccount}
                          disabled={deleteConfirmInput !== 'DELETE' || deleteLoading}
                          className="px-5 py-2 bg-[#FF5C7A] hover:bg-[#ff7a93] disabled:opacity-35 text-[#081120] font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-red-500/10"
                        >
                          {deleteLoading ? 'Deleting...' : 'Confirm Destruction'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isSuspendModalOpen && (
                  <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                      onClick={() => setIsSuspendModalOpen(false)}
                    />
                    {/* Modal container */}
                    <div className="relative w-full max-w-md p-6 rounded-[24px] bg-[#0E1624] border border-amber-500/20 shadow-2xl text-white z-10 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                          <Shield size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">Suspend Account Profile</h3>
                          <p className="text-xs text-[#9AA7B5] mt-0.5">Temporary account deactivation.</p>
                        </div>
                      </div>
                      <p className="text-sm text-[#9AA7B5] leading-relaxed">
                        This operation will temporarily suspend your account and sign you out of all devices. Your saved routes, shipments, and settings will be preserved, but you will not be able to log back in until your node is reactivated.
                      </p>
                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          onClick={() => setIsSuspendModalOpen(false)}
                          className="px-4 py-2 bg-transparent border border-white/5 rounded-xl text-xs font-bold text-white hover:border-white/10 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmSuspendAccount}
                          disabled={suspendLoading}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-[#081120] font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-amber-500/10"
                        >
                          {suspendLoading ? 'Suspending...' : 'Confirm Suspension'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
