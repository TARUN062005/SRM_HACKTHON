import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/hooks/useAuth";
import axios from "axios";
import toast from "react-hot-toast";
import {
  User,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  Shield,
  Fingerprint,
  ChevronRight,
  Loader2,
  Mail,
  AlertTriangle,
  Megaphone,
  ExternalLink,
  CheckCircle,
  Clock,
  Navigation,
} from "lucide-react";

// FORCE HMR REBUILD: 08:53Z

// ✅ Push Notification Support
const requestNotificationPermission = () => {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    return false;
  }
  
  if (Notification.permission === "granted") {
    return true;
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        console.log("Notification permission granted.");
        return true;
      }
    });
  }
  return false;
};

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  // Sidebar closed by default
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // ✅ Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const notificationsDropdownRef = useRef(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [fcmToken, setFcmToken] = useState(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      setNotifLoading(true);
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get(`${BASE_URL}/api/user/notifications?mode=unreadCount`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setUnreadCount(res.data?.unreadCount || 0);
      }
    } catch (err) {
      console.error("Unread count fetch failed:", err.message);
    } finally {
      setNotifLoading(false);
    }
  }, [BASE_URL]);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get(`${BASE_URL}/api/user/notifications?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setRecentNotifications(res.data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch recent notifications:", err.message);
    }
  }, [BASE_URL]);

  // ✅ Mark notification as read
  const markNotificationRead = useCallback(async (notificationId) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      await axios.patch(
        `${BASE_URL}/api/user/notifications/${notificationId}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state
      setRecentNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read:", err.message);
    }
  }, [BASE_URL]);

  // ✅ Mark all as read
  const markAllNotificationsRead = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.patch(
        `${BASE_URL}/api/user/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        toast.success("All notifications marked as read");
        setRecentNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        setShowNotificationsDropdown(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark all as read");
    }
  }, [BASE_URL]);

  // ✅ Setup push notifications
  const setupPushNotifications = useCallback(async () => {
    // Check if service worker and push manager are supported
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("Push notifications not supported");
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return;
    }

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      
      // Listen for incoming push notifications
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "PUSH_NOTIFICATION") {
          const { title, body, data } = event.data.payload;
          
          // Show notification
          if (Notification.permission === "granted") {
            const notification = new Notification(title, {
              body,
              icon: "/icon.png",
              data,
            });
            
            notification.onclick = () => {
              window.focus();
              notification.close();
              
              // Navigate to notifications page or specific notification
              if (data.notificationId) {
                navigate(`/notifications`);
              }
            };
          }
          
          // Refresh unread count
          fetchUnreadCount();
          fetchRecentNotifications();
        }
      });
      
    } catch (error) {
      console.error("Failed to setup push notifications:", error);
    }
  }, [BASE_URL, navigate, fetchUnreadCount, fetchRecentNotifications]);

  // ✅ Track CTA click
  const trackCTAClick = useCallback(async (notificationId, ctaUrl) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      await axios.post(
        `${BASE_URL}/api/user/notifications/${notificationId}/click`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Open the URL
      if (ctaUrl) {
        window.open(ctaUrl, "_blank");
      }
    } catch (err) {
      console.error("Failed to track click:", err);
      // Still open the URL even if tracking fails
      if (ctaUrl) {
        window.open(ctaUrl, "_blank");
      }
    }
  }, [BASE_URL]);

  // Close dropdowns when click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileDropdownOpen(false);
      }
      if (notificationsDropdownRef.current && !notificationsDropdownRef.current.contains(event.target)) {
        setShowNotificationsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
    setIsProfileDropdownOpen(false);
    setShowNotificationsDropdown(false);
  }, [location.pathname]);

  // Disable body scroll when sidebar open (mobile)
  useEffect(() => {
    if (isSidebarOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => (document.body.style.overflow = "");
  }, [isSidebarOpen]);

  // ✅ Setup notifications
  useEffect(() => {
    // Fetch initial data
    fetchUnreadCount();
    fetchRecentNotifications();
    
    // Setup push notifications if supported
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setupPushNotifications();
    }
    
    // Set up polling for new notifications
    const pollInterval = setInterval(() => {
      fetchUnreadCount();
      if (showNotificationsDropdown) {
        fetchRecentNotifications();
      }
    }, 30000); // Poll every 30 seconds
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchUnreadCount, fetchRecentNotifications, setupPushNotifications, showNotificationsDropdown]);

  // ✅ When user visits notifications page, refresh count immediately
  useEffect(() => {
    if (location.pathname === "/notifications") {
      fetchUnreadCount();
      fetchRecentNotifications();
    }
  }, [location.pathname, fetchUnreadCount, fetchRecentNotifications]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const pageTitle =
    location.pathname === "/dashboard"
      ? "Dashboard"
      : location.pathname.replace("/", "").replaceAll("-", " ");

  // ✅ Get notification icon
  const getNotificationIcon = (type) => {
    switch (type) {
      case "SECURITY":
        return <AlertTriangle className="text-rose-500" size={16} />;
      case "ANNOUNCEMENT":
        return <Megaphone className="text-indigo-500" size={16} />;
      case "MARKETING":
        return <Mail className="text-emerald-500" size={16} />;
      case "SYSTEM":
      default:
        return <Bell className="text-blue-500" size={16} />;
    }
  };

  // ✅ Get priority badge
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "URGENT":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700">URGENT</span>;
      case "HIGH":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-700">HIGH</span>;
      default:
        return null;
    }
  };

  // ✅ Format date
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 overflow-hidden flex">
      {/* Overlay only when sidebar open */}
      {isSidebarOpen && (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed top-0 left-0 z-50 h-full w-72",
          "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800",
          "transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "flex flex-col",
        ].join(" ")}
      >
        {/* Header */}
        <div className="p-6 flex items-center border-b border-slate-100 dark:border-slate-800 h-20">
          <button
            onClick={() => {
              navigate("/dashboard");
              setIsSidebarOpen(false);
            }}
            className="flex items-center text-left group"
          >
            <div className="relative">
              <div className="bg-primary-600 p-2.5 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)] group-hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] transition-all shrink-0">
                <Shield className="text-white" size={24} />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-100 dark:border-slate-800 shadow-sm">
                 <Fingerprint size={12} className="text-primary-600" />
              </div>
            </div>
            <div className="ml-3 flex flex-col">
              <span className="text-lg font-black tracking-tighter text-slate-900 dark:text-white leading-none">
                Route<span className="text-primary-600">Guardian</span>
              </span>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Tactical Console</span>
            </div>
          </button>

          <button
            aria-label="Close sidebar"
            onClick={() => setIsSidebarOpen(false)}
            className="ml-auto p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Menu */}
        <div className="flex-1 overflow-y-auto py-4 px-4">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-3">
            Menu
          </div>

          <Link
            to="/dashboard"
            className="flex items-center justify-between px-4 py-3 rounded-2xl font-semibold text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition group"
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="flex items-center gap-2">
              <Shield size={18} className="text-slate-400 group-hover:text-primary-600 transition-colors" />
              Dashboard
            </span>
            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
          </Link>

          <Link
            to="/notifications"
            className="mt-2 flex items-center justify-between px-4 py-3 rounded-2xl font-semibold text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition group"
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="flex items-center gap-2">
              <Bell size={18} className="text-slate-400 group-hover:text-primary-600 transition-colors" />
              Notifications
            </span>

            {unreadCount > 0 ? (
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-red-600 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : (
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
            )}
          </Link>
        </div>

        {/* Settings bottom */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
          <Link
            to="/settings"
            className="flex items-center space-x-3 w-full p-3 rounded-2xl transition-all duration-200 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600"
            onClick={() => setIsSidebarOpen(false)}
          >
            <Settings size={22} />
            <span className="font-semibold text-sm">Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main wrapper */}
      <div className={["flex-1 flex flex-col h-full transition-all duration-300 relative", isSidebarOpen ? "lg:pl-72" : "lg:pl-0"].join(" ")}>
        {/* Navbar — hidden on dashboard (it has its own sidebar header) */}
        <header className={location.pathname === '/dashboard'
          ? "hidden"
          : "h-20 bg-white/80 dark:bg-slate-950/60 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-30"}
        >
          {/* Left */}
          <div className={`flex items-center gap-4 pointer-events-auto ${location.pathname === '/dashboard' ? 'bg-white/90 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 px-4 py-2 rounded-2xl' : ''}`}>
            <button
              aria-label="Open sidebar menu"
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>

            <div className="hidden sm:flex items-center space-x-2 text-sm">
              <span className="text-slate-500 font-medium">Dashboard</span>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="text-slate-800 font-bold capitalize">
                {pageTitle || "Dashboard"}
              </span>
            </div>
          </div>

          {/* Right */}
          <div className={`flex items-center space-x-4 pointer-events-auto ${location.pathname === '/dashboard' ? 'bg-white/90 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 px-2 py-1.5 rounded-[1.25rem]' : ''}`}>
            
            {/* ✅ New Route Action Button */}
            {location.pathname === '/dashboard' && (
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('toggleNewRoute'))}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                <Navigation size={16} /> New Route
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative" ref={notificationsDropdownRef}>
              <button
                onClick={() => {
                  setShowNotificationsDropdown(!showNotificationsDropdown);
                  if (!showNotificationsDropdown) {
                    fetchRecentNotifications();
                  }
                }}
                className="relative p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                title="Notifications"
              >
                {notifLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Bell size={22} />
                )}
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
                )}
              </button>

              {showNotificationsDropdown && (
                <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 py-3 z-[100] animate-in slide-in-from-top-2 duration-200 max-h-[80vh] overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-2 border-b border-slate-50 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Notifications</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {unreadCount} unread • {recentNotifications.length} total
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notifications List */}
                  <div className="flex-1 overflow-y-auto py-2">
                    {recentNotifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                        <p className="text-slate-500 dark:text-slate-400 font-bold mt-2">
                          No notifications yet
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          You'll see important updates here
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 px-2">
                        {recentNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-3 rounded-xl transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
                              !notification.isRead ? "bg-blue-50 dark:bg-blue-900/20" : ""
                            }`}
                            onClick={() => {
                              if (!notification.isRead) {
                                markNotificationRead(notification.id);
                              }
                              navigate("/notifications");
                              setShowNotificationsDropdown(false);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                                    {notification.title}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    {getPriorityBadge(notification.priority)}
                                    {!notification.isRead && (
                                      <span className="w-2 h-2 rounded-full bg-red-500" />
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                                  {notification.message}
                                </p>
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-xs font-bold text-slate-400">
                                    {formatTime(notification.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 px-4">
                    <Link
                      to="/notifications"
                      onClick={() => setShowNotificationsDropdown(false)}
                      className="flex items-center justify-center w-full py-2.5 rounded-xl font-bold text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

            {/* Profile */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsProfileDropdownOpen((v) => !v)}
                className="h-11 w-11 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-primary-200 hover:scale-105 transition-all ring-2 ring-white dark:ring-slate-900 overflow-hidden"
              >
                {user?.profileImage ? (
                  <img src={user.profileImage} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.charAt(0) || "U"
                )}
              </button>

              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 py-3 z-[100] animate-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-slate-50 dark:border-slate-800 mb-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.name}</p>
                  </div>

                  <Link
                    to="/profile"
                    className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600 transition-all mx-2 rounded-xl"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  >
                    <User size={18} />
                    <span className="font-semibold text-sm">My Profile</span>
                  </Link>

                  <Link
                    to="/settings"
                    className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600 transition-all mx-2 rounded-xl"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  >
                    <Settings size={18} />
                    <span className="font-semibold text-sm">Settings</span>
                  </Link>

                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-2 mx-4" />

                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-3 w-[calc(100%-16px)] mx-2 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all rounded-xl"
                  >
                    <LogOut size={18} />
                    <span className="font-bold text-sm">Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content - THE REAL SCROLL FIX */}
        <main className={`flex-1 flex flex-col relative overflow-hidden`}>
          <div className={`flex-1 w-full flex flex-col relative ${location.pathname === '/dashboard' ? 'overflow-hidden' : 'overflow-y-auto p-6 lg:p-10 pb-24'}`}>
            <div className={location.pathname === '/dashboard' ? 'flex-1 w-full h-full relative' : 'max-w-7xl mx-auto w-full'}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;