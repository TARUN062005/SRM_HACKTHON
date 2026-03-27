import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth/hooks/useAuth';

const ProtectedRoutes = ({ allowedRoles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoutes;