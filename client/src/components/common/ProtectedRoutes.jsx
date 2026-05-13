import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth/hooks/useAuth';
import { Shield } from 'lucide-react';

const ProtectedRoutes = ({ allowedRoles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-shell min-h-screen flex items-center justify-center px-6">
        <div className="surface-glass rounded-[28px] px-8 py-10 text-center max-w-sm w-full">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
            <Shield size={22} className="text-cyan-300" />
          </div>
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 rg-loading-ring animate-spin" />
          <h1 className="text-lg font-black text-white">Restoring secure session</h1>
          <p className="mt-2 text-sm text-slate-400">Validating access and loading your workspace.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoutes;