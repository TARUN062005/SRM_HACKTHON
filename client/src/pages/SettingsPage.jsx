import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth/hooks/useAuth";
import axios from "axios";
import {
  User,
  Shield,
  Trash2,
  AlertCircle,
  Save,
  Settings,
  Moon,
  Sun,
  Camera,
  Phone,
  Calendar,
  MapPin,
  Globe,
  Bell,
  BellOff,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

import { getToken } from "firebase/messaging";
import { messaging } from "../lib/push/firebaseClient";
import { motion, AnimatePresence } from "framer-motion";

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const [formData, setFormData] = useState({
    name: user?.name || "",
    bio: user?.bio || "",
    gender: user?.gender || "",
    phone: user?.phone || "",
    dob: user?.dob ? String(user.dob).slice(0, 10) : "",
    location: user?.location || "",
    country: user?.country || "",
  });

  const [updateLoading, setUpdateLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState(user?.profileImage || "");
  const [theme, setTheme] = useState("light");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState("default");

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    }

    if ("Notification" in window) {
      setPushPermission(Notification.permission);
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (profilePreview && profilePreview.startsWith("blob:")) {
        URL.revokeObjectURL(profilePreview);
      }
    };
  }, [profilePreview]);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setTheme("light");
      toast.success("Light mode enabled");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setTheme("dark");
      toast.success("Dark mode enabled");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large. Max 2MB allowed.");
      return;
    }
    setProfileImageFile(file);
    if (profilePreview && profilePreview.startsWith("blob:")) {
      URL.revokeObjectURL(profilePreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setProfilePreview(previewUrl);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([key, val]) => fd.append(key, val || ""));
      if (profileImageFile) fd.append("profileImage", profileImageFile);
      const res = await axios.patch(`${BASE_URL}/api/user/settings`, fd, {
        headers: {
          ...getAuthHeader(),
          "Content-Type": "multipart/form-data",
        },
      });
      if (res.data?.success) {
        toast.success("Profile updated successfully!");
      } else {
        toast.error(res.data?.message || "Update failed");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Update failed");
    } finally {
      setUpdateLoading(false);
    }
  };

  const enablePushNotifications = async () => {
    try {
      setPushLoading(true);
      if (!("Notification" in window)) {
        toast.error("This browser does not support notifications.");
        return;
      }
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        toast.error("Notification permission denied.");
        setPushEnabled(false);
        return;
      }
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        toast.error("Missing VITE_FIREBASE_VAPID_KEY in client .env");
        return;
      }
      const fcmToken = await getToken(messaging, { vapidKey });
      if (!fcmToken) {
        toast.error("Failed to generate FCM token");
        return;
      }
      const res = await axios.post(
        `${BASE_URL}/api/user/notifications/push-token`,
        { token: fcmToken, platform: "WEB" },
        { headers: getAuthHeader() }
      );
      if (res.data?.success) {
        toast.success("Push notifications enabled ✅");
        setPushEnabled(true);
      } else {
        toast.error(res.data?.message || "Failed to enable push");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to enable push");
    } finally {
      setPushLoading(false);
    }
  };

  const disablePushNotifications = async () => {
    try {
      setPushLoading(true);
      const token = localStorage.getItem("token");
      await axios.delete(`${BASE_URL}/api/user/notifications/push-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Push notifications disabled for this account ✅");
      setPushEnabled(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to disable push");
    } finally {
      setPushLoading(false);
    }
  };

  const handleAccountAction = async (actionType) => {
    const isPermanent = actionType === "permanent";
    const confirmMsg = isPermanent
      ? "WARNING: This will permanently delete your account and all data. This cannot be undone!"
      : "Are you sure you want to suspend your account? You can reactivate it later via email.";
    if (!window.confirm(confirmMsg)) return;
    try {
      await axios.delete(`${BASE_URL}/api/user/account?type=${actionType}`, {
        headers: getAuthHeader(),
      });
      toast.success(isPermanent ? "Account deleted" : "Account suspended");
      logout();
    } catch (err) {
      toast.error("Action failed. Please try again.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-12 pb-32"
    >
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-600/10 border border-primary-600/20 text-primary-600 text-[10px] font-black uppercase tracking-widest">
            <Settings size={12} /> System Configuration
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
            Settings Node
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Manage your operative profile and interface protocols.
          </p>
        </div>

        <button
          onClick={toggleTheme}
          className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white dark:border-slate-800 text-slate-700 dark:text-white px-6 py-4 rounded-2xl font-black hover:bg-white dark:hover:bg-slate-800 transition-all shadow-xl active:scale-95 text-sm flex items-center gap-3"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === "dark" ? "Day Protocol" : "Night Protocol"}</span>
        </button>
      </div>

      {/* Push Notifications Block */}
      <section className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white dark:border-slate-800 shadow-2xl overflow-hidden group">
        <div className="p-10 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-6 flex-wrap">
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
              <Bell size={24} className="text-primary-600" /> Push Comms
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
              Real-time synchronization for security alerts and fleet broadcasts.
            </p>
          </div>

          <div className="flex gap-4">
            {pushEnabled ? (
              <button
                type="button"
                onClick={disablePushNotifications}
                disabled={pushLoading}
                className="px-8 py-4 rounded-2xl font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-3 text-sm"
              >
                {pushLoading ? <Loader2 className="animate-spin" size={18} /> : <BellOff size={18} />}
                Terminate Link
              </button>
            ) : (
              <button
                type="button"
                onClick={enablePushNotifications}
                disabled={pushLoading}
                className="px-8 py-4 rounded-2xl font-black bg-primary-600 text-white hover:bg-primary-700 transition-all shadow-xl shadow-primary-600/20 disabled:opacity-50 flex items-center gap-3 text-sm"
              >
                {pushLoading ? <Loader2 className="animate-spin" size={18} /> : <Bell size={18} />}
                Establish Link
              </button>
            )}
          </div>
        </div>

        <div className="p-10">
          <div className="bg-slate-50 dark:bg-slate-950/50 rounded-[2rem] border border-slate-100 dark:border-slate-900 p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className={`h-3 w-3 rounded-full ${pushEnabled ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                Status: {pushEnabled ? "Active Satellite Link" : "Comms Offline"}
              </p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              Establishing a secure push channel requires system-level permissions. Ensure your proxy 
              and firewall protocols allow bidirectional data flow from the Firebase relay.
            </p>
          </div>
        </div>
      </section>

      {/* Main Profile Form */}
      <section className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-primary-600/5 rounded-2xl text-primary-600">
                <User size={24} />
             </div>
             <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Biometric Registry</h2>
          </div>

          <div className="flex items-center gap-6">
             <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden border-2 border-white dark:border-slate-700 shadow-lg">
                {profilePreview ? (
                  <img src={profilePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-xl">
                    {user?.name?.charAt(0) || "U"}
                  </div>
                )}
             </div>
             <label className="cursor-pointer bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-[1rem] font-black text-sm hover:scale-105 transition-transform flex items-center gap-2">
                <Camera size={16} /> Update Bio-Data
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
             </label>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="p-10 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {[
              { label: 'Display Identifier', key: 'name', type: 'text' },
              { label: 'Comms Frequency', key: 'phone', type: 'tel', icon: <Phone size={14} />, placeholder: '+91xxxxxxxxxx' },
              { label: 'Origin Date', key: 'dob', type: 'date', icon: <Calendar size={14} /> },
              { label: 'Gender Protocol', key: 'gender', type: 'select', options: ['MALE', 'FEMALE', 'OTHER'] },
              { label: 'Deployment Hub', key: 'location', type: 'text', icon: <MapPin size={14} />, placeholder: 'City, Region' },
              { label: 'Territory', key: 'country', type: 'text', icon: <Globe size={14} />, placeholder: 'Country' }
            ].map((field) => (
              <div key={field.key} className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                  {field.icon} {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={formData[field.key]}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-white font-bold outline-none focus:ring-4 focus:ring-primary-600/10 transition-all appearance-none"
                  >
                    <option value="">Unspecified</option>
                    {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={formData[field.key]}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-white font-bold outline-none focus:ring-4 focus:ring-primary-600/10 transition-all"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Operative History (Bio)</label>
             <textarea
               value={formData.bio}
               onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
               rows="4"
               className="w-full px-6 py-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-white font-bold outline-none focus:ring-4 focus:ring-primary-600/10 transition-all resize-none"
             />
          </div>

          <div className="flex justify-end pt-8">
            <button
              type="submit"
              disabled={updateLoading}
              className="bg-primary-600 text-white px-12 py-5 rounded-2xl font-black text-lg hover:bg-primary-700 transition-all shadow-2xl shadow-primary-600/30 active:scale-95 disabled:opacity-50 flex items-center gap-3"
            >
              {updateLoading ? <Loader2 className="animate-spin" size={24} /> : <Save size={24} />}
              <span>Commit Changes</span>
            </button>
          </div>
        </form>
      </section>

      {/* Extreme Measures (Danger Zone) */}
      <section className="bg-red-500/5 dark:bg-red-500/10 rounded-[2.5rem] border border-red-500/20 p-12">
        <div className="flex items-center gap-4 mb-6">
           <div className="p-3 bg-red-500 text-white rounded-2xl shadow-lg shadow-red-500/20">
              <AlertCircle size={28} />
           </div>
           <div>
              <h2 className="text-2xl font-black text-red-600 dark:text-red-400 tracking-tight">Critical Overrides</h2>
              <p className="text-red-500/60 font-medium text-sm">Destructive protocols. Use with extreme caution.</p>
           </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <button
            onClick={() => handleAccountAction("suspend")}
            className="flex-1 px-8 py-5 bg-white dark:bg-slate-900 border border-red-500/20 text-red-600 dark:text-red-400 font-black rounded-2xl hover:bg-red-500/5 transition-all flex items-center justify-center gap-3 shadow-sm"
          >
            <Shield size={20} />
            Suspend Proxy
          </button>

          <button
            onClick={() => handleAccountAction("permanent")}
            className="flex-1 px-8 py-5 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-3"
          >
            <Trash2 size={20} />
            Purge All Data
          </button>
        </div>
      </section>
    </motion.div>
  );
};

export default SettingsPage;
