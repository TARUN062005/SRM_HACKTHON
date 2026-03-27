import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth/hooks/useAuth';
import toast from 'react-hot-toast';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return; // Prevent double execution in StrictMode

    const handleCallback = async () => {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');

      if (!token) {
        toast.error('Authentication token missing');
        return navigate('/auth');
      }

      processed.current = true;

      // Persist token + timestamp
      localStorage.setItem('token', token);
      localStorage.setItem('login_timestamp', Date.now().toString());

      try {
        // Verify token and fetch profile from backend
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();

        if (data.success) {
          setUser(data.user);
          toast.success('Securely signed in!');
          navigate('/dashboard');
        } else {
          throw new Error(data.message);
        }
      } catch (err) {
        console.error('Callback Error:', err);
        localStorage.removeItem('token');
        localStorage.removeItem('login_timestamp');
        toast.error('Failed to finalize login. Please try again.');
        navigate('/auth');
      }
    };

    handleCallback();
  }, [location, navigate, setUser]);

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary-600"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-2 w-2 bg-primary-600 rounded-full animate-ping"></div>
        </div>
      </div>
      <p className="mt-6 text-slate-900 font-bold text-lg animate-pulse">Finalizing your secure session...</p>
      <p className="text-slate-500 text-sm">Validating credentials with RouteGuardian...</p>
    </div>
  );
};

export default AuthCallback;
