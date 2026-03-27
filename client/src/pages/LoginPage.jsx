import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, Mail, Lock, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "../lib/auth/hooks/useAuth";
import authService from "../lib/auth/authService";
import axios from "axios";
import toast from "react-hot-toast";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSuspended, setIsSuspended] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);

  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSuspended(false);

    try {
      const data = await authService.login(email, password);

      if (!data?.success) {
        toast.error(data?.message || "Login failed");
        return;
      }

      if (data?.token) {
        localStorage.setItem("token", data.token);
      }

      localStorage.setItem("login_timestamp", Date.now().toString());

      setUser(data.user);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      const errorMessage = err?.response?.data?.message || "Login failed";
      const errorCode = err?.response?.data?.code;

      if (errorCode === "ACCOUNT_SUSPENDED") {
        setIsSuspended(true);
        toast.error("Your account is currently suspended.");
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleRequestReactivation = async () => {
    if (!email?.trim()) {
      toast.error("Please enter your email to request reactivation.");
      return;
    }

    setIsSendingLink(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/user/request-reactivation`, {
        email,
      });

      toast.success(response?.data?.message || "Reactivation link sent to your email!");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send reactivation link.");
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl shadow-xl transform transition-all">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-200">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="mt-2 text-sm text-gray-500">Access your secure dashboard</p>
        </div>

        {/* --- Suspended Account Alert --- */}
        {isSuspended && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-amber-800">Account Suspended</h3>
                <p className="text-xs text-amber-700 mt-1">
                  Your account was suspended or deactivated. Would you like to reactivate it?
                </p>

                <button
                  type="button"
                  onClick={handleRequestReactivation}
                  disabled={isSendingLink}
                  className="mt-3 flex items-center space-x-2 text-xs font-bold text-white bg-amber-600 px-4 py-2 rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50"
                >
                  {isSendingLink ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Mail className="h-3 w-3" />
                  )}
                  <span>{isSendingLink ? "Sending..." : "Send Reactivation Link"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                className="block w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-sm"
                placeholder="Email address"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                className="block w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-sm"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-bold text-primary-600 hover:text-primary-700"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="group relative w-full flex justify-center items-center py-4 px-4 text-sm font-bold rounded-2xl text-white bg-primary-600 hover:bg-primary-700 focus:outline-none shadow-lg shadow-primary-100 transition-all active:scale-[0.98]"
          >
            Sign In
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400 font-medium">New to RouteGuardian?</span>
            </div>
          </div>

          <Link
            to="/register"
            className="mt-6 block w-full text-center py-4 border-2 border-gray-50 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 transition-all"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
