import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FiMail,
  FiLock,
  FiEye,
  FiEyeOff,
  FiArrowRight,
  FiUser,
  FiUserCheck,
} from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useAutoCloseError } from "../hooks/useAutoCloseError";
import AuthLayout from "../components/AuthLayout";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, loginAsGuest, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const signupMessage = (location.state as any)?.message || null;

  // Auto-dismiss error after 5 seconds
  useAutoCloseError(error, () => setError(null), 5000);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await login(email, password);

      if (result.success) {
        navigate("/");
      } else {
        setError(
          result.message ||
            "Login failed. Please check your credentials and try again.",
        );
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  const handleCreateAccount = () => {
    navigate("/signup");
  };

  const handleContinueAsGuest = () => {
    loginAsGuest();
    navigate("/");
  };

  return (
    <AuthLayout
      title="Welcome Back to CERKYL"
      subtitle="Sign in to manage your university applications, track form submissions, and chat with AI application advisors."
      badgeText="Student Portal"
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm"
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Sign In
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Enter your account credentials to continue
          </p>
        </div>

        {/* Feedback Alerts */}
        {signupMessage && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/60"
          >
            <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center">
              <FiUserCheck className="w-4 h-4 mr-2 text-green-600 dark:text-green-400 flex-shrink-0" />
              {signupMessage}
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60"
          >
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {error}
            </p>
          </motion.div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiMail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-colors"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Password
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiLock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <FiEyeOff className="w-5 h-5" />
                ) : (
                  <FiEye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors duration-150 flex items-center justify-center text-base shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Sign In
                <FiArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500 font-medium">
              Don't have an account?
            </span>
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCreateAccount}
            className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-center"
          >
            <FiUser className="w-4 h-4 mr-2 text-slate-500 dark:text-slate-400" />
            Create new account
          </button>

          <button
            type="button"
            onClick={handleContinueAsGuest}
            className="w-full py-3 px-4 rounded-xl border border-primary-200 dark:border-primary-900/60 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold text-sm hover:bg-primary-100 dark:hover:bg-primary-900/60 transition-colors flex items-center justify-center"
          >
            Continue as Guest
          </button>
        </div>

        {/* Footer info */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-6 leading-relaxed">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </AuthLayout>
  );
};

export default Login;
