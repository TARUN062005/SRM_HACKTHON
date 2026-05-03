import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  User, Shield, Trash2, AlertCircle, Save, Sun, Moon, Monitor,
  Camera, Phone, Calendar, MapPin, Globe, Bell, BellOff, Loader2,
  ChevronRight, Lock, Palette,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getToken } from 'firebase/messaging';
import { messaging } from '../lib/push/firebaseClient';
import { motion } from 'framer-motion';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

// Theme helpers
const THEMES = [
  { id: 'light',  label: 'Light',  Icon: Sun     },
  { id: 'dark',   label: 'Dark',   Icon: Moon    },
  { id: 'system', label: 'System', Icon: Monitor },
];

const applyTheme = (themeId) => {
  if (themeId === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  } else {
    document.documentElement.classList.toggle('dark', themeId === 'dark');
  }
  localStorage.setItem('theme', themeId);
};

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    gender: user?.gender || '',
    phone: user?.phone || '',
    dob: user?.dob ? String(user.dob).slice(0, 10) : '',
    location: user?.location || '',
    country: user?.country || '',
  });

  const [updateLoading, setUpdateLoading] = useState(false);
  const [pushLoading, setPushLoading]     = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profilePreview, setProfilePreview]     = useState(user?.profileImage || '');
  const [theme, setTheme]           = useState('light');
  const [pushEnabled, setPushEnabled]     = useState(false);
  const [activeSection, setActiveSection] = useState('appearance');

  // Init theme
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light';
    setTheme(saved);
    applyTheme(saved);
    if ('Notification' in window) setPushEnabled(Notification.permission === 'granted');
    return () => {
      if (profilePreview?.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    };
  }, []);

  const handleThemeChange = (themeId) => {
    setTheme(themeId);
    applyTheme(themeId);
    toast.success(`${themeId.charAt(0).toUpperCase() + themeId.slice(1)} theme applied`);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select a valid image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image too large — max 2 MB'); return; }
    setProfileImageFile(file);
    if (profilePreview?.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => fd.append(k, v || ''));
      if (profileImageFile) fd.append('profileImage', profileImageFile);
      const res = await axios.patch(`${BASE_URL}/api/user/settings`, fd, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) toast.success('Profile updated');
      else toast.error(res.data?.message || 'Update failed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdateLoading(false);
    }
  };

  const enablePush = async () => {
    setPushLoading(true);
    try {
      if (!('Notification' in window)) { toast.error('Browser does not support notifications'); return; }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast.error('Notification permission denied'); return; }
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) { toast.error('Push notifications not configured'); return; }
      const fcmToken = await getToken(messaging, { vapidKey });
      if (!fcmToken) { toast.error('Failed to generate push token'); return; }
      const res = await axios.post(`${BASE_URL}/api/user/notifications/push-token`,
        { token: fcmToken, platform: 'WEB' }, { headers: getAuthHeader() });
      if (res.data?.success) { toast.success('Push notifications enabled'); setPushEnabled(true); }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to enable push');
    } finally {
      setPushLoading(false);
    }
  };

  const disablePush = async () => {
    setPushLoading(true);
    try {
      await axios.delete(`${BASE_URL}/api/user/notifications/push-token`, { headers: getAuthHeader() });
      toast.success('Push notifications disabled');
      setPushEnabled(false);
    } catch (err) {
      toast.error('Failed to disable push');
    } finally {
      setPushLoading(false);
    }
  };

  const handleAccountAction = async (type) => {
    const msg = type === 'permanent'
      ? 'This will permanently delete your account and all data. This cannot be undone!'
      : 'This will suspend your account. You can reactivate it later.';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${BASE_URL}/api/user/account?type=${type}`, { headers: getAuthHeader() });
      toast.success(type === 'permanent' ? 'Account deleted' : 'Account suspended');
      logout();
    } catch {
      toast.error('Action failed. Please try again.');
    }
  };

  const SECTIONS = [
    { id: 'appearance',    label: 'Appearance',     Icon: Palette      },
    { id: 'profile',       label: 'Profile',        Icon: User         },
    { id: 'notifications', label: 'Notifications',  Icon: Bell         },
    { id: 'security',      label: 'Security',       Icon: Lock         },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto pb-20">

      {/* Page header */}
      <div className="mb-8">
        <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">Configuration</p>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage your profile, appearance, and account preferences.</p>
      </div>

      <div className="flex gap-8">

        {/* Left nav */}
        <div className="w-52 flex-shrink-0">
          <nav className="space-y-1 sticky top-4">
            {SECTIONS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setActiveSection(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all ${
                  activeSection === id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* ── APPEARANCE ── */}
          {activeSection === 'appearance' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Theme</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Choose how RouteGuardian looks on your device.</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => handleThemeChange(id)}
                      className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                        theme === id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                      {/* Preview box */}
                      <div className={`w-full h-16 rounded-xl overflow-hidden border ${
                        id === 'dark' ? 'bg-slate-900 border-slate-700'
                        : id === 'system' ? 'bg-gradient-to-r from-white to-slate-900 border-slate-300'
                        : 'bg-white border-slate-200'
                      }`}>
                        <div className={`h-full flex flex-col justify-between p-2`}>
                          <div className={`h-1.5 w-3/4 rounded-full ${id === 'dark' ? 'bg-slate-700' : 'bg-slate-200'}`} />
                          <div className="flex gap-1">
                            <div className={`h-1.5 flex-1 rounded-full ${id === 'dark' ? 'bg-slate-700' : 'bg-slate-200'}`} />
                            <div className={`h-1.5 flex-1 rounded-full ${id === 'dark' ? 'bg-blue-800' : 'bg-blue-200'}`} />
                          </div>
                        </div>
                      </div>
                      <Icon size={16} className={theme === id ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'} />
                      <span className={`text-sm font-bold ${theme === id ? 'text-blue-600' : 'text-slate-600 dark:text-slate-300'}`}>
                        {label}
                      </span>
                      {theme === id && (
                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── PROFILE ── */}
          {activeSection === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Profile Information</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Update your name, photo and personal details.</p>
                </div>
                {/* Avatar */}
                <label className="cursor-pointer group relative">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-700 shadow-md group-hover:opacity-80 transition-opacity">
                    {profilePreview
                      ? <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-blue-600 text-xl font-black">{user?.name?.charAt(0) || 'U'}</div>
                    }
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-sm">
                    <Camera size={11} className="text-white" />
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>

              <form onSubmit={handleUpdate} className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {[
                    { label: 'Full Name',    key: 'name',     type: 'text'   },
                    { label: 'Phone',        key: 'phone',    type: 'tel',    placeholder: '+1 (555) 000-0000' },
                    { label: 'Date of Birth',key: 'dob',      type: 'date'   },
                    { label: 'Gender',       key: 'gender',   type: 'select', options: ['Male', 'Female', 'Other'] },
                    { label: 'City',         key: 'location', type: 'text',   placeholder: 'City, Region' },
                    { label: 'Country',      key: 'country',  type: 'text',   placeholder: 'Country' },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{field.label}</label>
                      {field.type === 'select' ? (
                        <select value={formData[field.key]}
                          onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
                          <option value="">Select…</option>
                          {field.options.map(opt => <option key={opt} value={opt.toUpperCase()}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} value={formData[field.key]} placeholder={field.placeholder}
                          onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Bio</label>
                  <textarea value={formData.bio} rows="3"
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell us a bit about yourself…"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none" />
                </div>

                <div className="flex justify-end mt-6">
                  <button type="submit" disabled={updateLoading}
                    className="flex items-center gap-2.5 px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50">
                    {updateLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save changes
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeSection === 'notifications' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Push Notifications</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Receive real-time alerts for risk events, route changes, and system status.</p>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${pushEnabled ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {pushEnabled ? 'Notifications active' : 'Notifications disabled'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {pushEnabled
                          ? 'You will receive real-time supply chain alerts on this device.'
                          : 'Enable push notifications to receive risk and route alerts.'}
                      </p>
                    </div>
                  </div>
                  {pushEnabled ? (
                    <button onClick={disablePush} disabled={pushLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 flex-shrink-0">
                      {pushLoading ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
                      Disable
                    </button>
                  ) : (
                    <button onClick={enablePush} disabled={pushLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex-shrink-0 shadow-sm">
                      {pushLoading ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                      Enable
                    </button>
                  )}
                </div>

                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Push notifications require browser permission. RouteGuardian uses Firebase Cloud Messaging (FCM) to deliver alerts. Notifications include risk alerts, weather warnings, and geopolitical event updates.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SECURITY ── */}
          {activeSection === 'security' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Account</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Manage your account status and data.</p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Email address</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.email || '—'}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-black rounded-full uppercase tracking-wide">Verified</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Account status</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your account is active and in good standing</p>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-black rounded-full uppercase tracking-wide">Active</span>
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/50 overflow-hidden">
                <div className="px-6 py-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/30">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-500" />
                    <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Danger Zone</h3>
                  </div>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">These actions are irreversible. Proceed with caution.</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Suspend account</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Temporarily disable your account. You can reactivate via email.</p>
                    </div>
                    <button onClick={() => handleAccountAction('suspend')}
                      className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0">
                      <Shield size={14} /> Suspend
                    </button>
                  </div>
                  <div className="h-px bg-slate-100 dark:bg-slate-800" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Delete account</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permanently delete your account and all associated data. Cannot be undone.</p>
                    </div>
                    <button onClick={() => handleAccountAction('permanent')}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all shadow-sm flex-shrink-0">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
