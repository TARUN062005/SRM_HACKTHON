import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Pages
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import RoutesMapPage from './pages/RoutesMapPage';
import ShipmentsPage from './pages/ShipmentsPage';
import VerifyEmail from './pages/VerifyEmail';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import RateLimitPage from './pages/RateLimitPage';
import NotFound from './pages/NotFound';
import ReactivatePage from './pages/ReactivatePage';
import NotificationsPage from './pages/NotificationsPage';

// Layouts & Guards
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoutes from './components/common/ProtectedRoutes';

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '12px',
            background: '#334155',
            color: '#fff',
          }
        }}
      />

      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/too-many-requests" element={<RateLimitPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoutes />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/routes-map"  element={<RoutesMapPage />} />
            <Route path="/shipments"   element={<ShipmentsPage />} />
            <Route path="/profile"     element={<ProfilePage />} />
            <Route path="/reactivate"  element={<ReactivatePage />} />
            <Route path="/settings"    element={<SettingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
