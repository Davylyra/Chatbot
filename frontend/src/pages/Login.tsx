import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiUser } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAutoCloseError } from '../hooks/useAutoCloseError';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, loginAsGuest, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const signupMessage = (location.state as any)?.message || null;
  const { theme } = useTheme();

  // Auto-dismiss error after 5 seconds
  useAutoCloseError(error, () => setError(null), 5000);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      const result = await login(email, password);
      
      // Only navigate if login was successful
      if (result.success) {
        navigate('/');
      } else {
        // Show error message inline instead of redirecting
        setError(result.message || 'Login failed. Please check your credentials and try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  const handleCreateAccount = () => {
    navigate('/signup');
  };

  const handleContinueAsGuest = () => {
    loginAsGuest();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${theme === 'dark' ? 'white' : 'black'} 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }} />
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo and Title */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center"
            >
              <img 
                src="/glinax-logo.jpeg" 
                alt="Glinax Logo" 
                className="w-16 h-16 rounded-2xl object-cover"
              />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`text-4xl font-bold mb-3 bg-gradient-to-r ${
                theme === 'dark' 
                  ? 'from-white to-gray-300 bg-clip-text text-transparent' 
                  : 'from-gray-900 to-gray-600 bg-clip-text text-transparent'
              }`}
            >
              Welcome back
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`text-lg transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Sign in to your account
            </motion.p>
        </div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`rounded-3xl p-8 shadow-2xl transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark' 
              : 'glass-card-unified'
            }`}
        >
            <form onSubmit={handleLogin} className="space-y-6">
              {signupMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800"
                >
                  <p className="text-sm text-green-700 dark:text-green-400">{signupMessage}</p>
                </motion.div>
              )}
              
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-4 p-3 rounded-lg border ${
                    theme === 'dark'
                      ? 'bg-red-900/20 border-red-800'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-600'
                  }`}>{error}</p>
                </motion.div>
              )}
            {/* Email Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Email address
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiMail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                    className={`w-full pl-12 pr-4 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                  theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
                required
              />
                </div>
            </div>

            {/* Password Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Password
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiLock className="w-5 h-5" />
              </div>
              <input
                    type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                    className={`w-full pl-12 pr-12 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                  theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
                required
              />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute inset-y-0 right-0 pr-4 flex items-center ${
                      theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                    } transition-colors duration-200`}
                  >
                    {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Forgot Password */}
              <div className="text-right">
                <button
                  type="button"
                  className={`text-sm font-medium transition-colors duration-200 ${
                    theme === 'dark' 
                      ? 'text-primary-400 hover:text-primary-300' 
                      : 'text-primary-600 hover:text-primary-700'
                  }`}
                >
                  Forgot password?
                </button>
            </div>

            {/* Sign In Button */}
              <motion.button
              type="submit"
              disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 flex items-center justify-center shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                  <>
                    Sign in
                    <FiArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </motion.button>
          </form>
        </motion.div>

          {/* Alternative Options */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-8 space-y-4"
          >
            {/* Create Account */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            onClick={handleCreateAccount}
              className={`w-full py-4 px-6 rounded-2xl border-2 font-semibold transition-all duration-200 flex items-center justify-center ${
              theme === 'dark'
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              <FiUser className="w-5 h-5 mr-2" />
              Create new account
            </motion.button>

        {/* Continue as Guest */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleContinueAsGuest}
              className={`w-full py-4 px-6 rounded-2xl border-2 font-semibold transition-all duration-200 flex items-center justify-center ${
            theme === 'dark' 
                  ? 'border-primary-500/50 text-primary-400 hover:bg-primary-500/10 hover:border-primary-400'
                  : 'border-primary-200 text-primary-600 hover:bg-primary-50 hover:border-primary-300'
              }`}
            >
              Continue as guest
            </motion.button>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center mt-12"
          >
            <p className={`text-sm transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
