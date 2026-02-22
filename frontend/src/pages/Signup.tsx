import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiArrowRight, FiCheck } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAutoCloseError } from '../hooks/useAutoCloseError';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { signup, isLoading } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Auto-dismiss general error after 5 seconds
  useAutoCloseError(errors.submit || null, () => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.submit;
      return newErrors;
    });
  }, 5000);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    const newErrors: {[key: string]: string} = {};
    
    // Validate name
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    } else if (!formData.email.toLowerCase().endsWith('@gmail.com')) {
      newErrors.email = 'Email must be a Gmail address (@gmail.com)';
    }
    
    // Validate password strength (must match backend requirements)
    const passwordErrors: string[] = [];
    if (formData.password.length < 8) {
      passwordErrors.push('at least 8 characters');
    }
    if (!/[a-z]/.test(formData.password)) {
      passwordErrors.push('lowercase letter');
    }
    if (!/[A-Z]/.test(formData.password)) {
      passwordErrors.push('uppercase letter');
    }
    if (!/[0-9]/.test(formData.password)) {
      passwordErrors.push('number');
    }
    if (!/[!@#$%^&*]/.test(formData.password)) {
      passwordErrors.push('special character (!@#$%^&*)');
    }
    
    if (passwordErrors.length > 0) {
      newErrors.password = `Password must have: ${passwordErrors.join(', ')}`;
    }
    
    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    // If there are errors, show them and stop
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setErrors({});
      const result = await signup(formData.name, formData.email, formData.password);
      if (result.success) {
        navigate('/login', { state: { signupSuccess: true, message: result.message } });
      } else {
        // Parse backend errors and display them properly
        if (result.errors && Array.isArray(result.errors)) {
          const backendErrors: {[key: string]: string} = {};
          for (const error of result.errors) {
            if (error.includes('Name')) backendErrors.name = error;
            else if (error.includes('Email') || error.includes('@gmail')) backendErrors.email = error;
            else if (error.includes('Password')) backendErrors.password = error;
            else backendErrors.submit = error;
          }
          if (Object.keys(backendErrors).length > 0) {
            setErrors(backendErrors);
          } else {
            setErrors({ submit: result.message || 'Signup failed' });
          }
        } else {
          setErrors({ submit: result.message || 'Signup failed' });
        }
      }
    } catch (error: any) {
      setErrors({ submit: error.message || 'Signup failed. Please try again.' });
    }
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
              Create your account
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`text-lg transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Join Glinax and start your university journey
            </motion.p>
          </div>

          {/* Signup Form */}
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
            <form onSubmit={handleSignup} className="space-y-6">
              {/* Name Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Full name
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiUser className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    className={`w-full pl-12 pr-4 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                      errors.name
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                        : theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                    }`}
                    required
                  />
                </div>
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1 flex items-center">
                    <span className="mr-1">⚠️</span> {errors.name}
                  </p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Email address <span className="text-xs text-gray-500">(@gmail.com only)</span>
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiMail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your.email@gmail.com"
                    className={`w-full pl-12 pr-4 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                      errors.email
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                        : theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                    }`}
                    required
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1 flex items-center">
                    <span className="mr-1">⚠️</span> {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Password <span className="text-xs text-gray-500">(min 8 chars)</span>
                </label>
                <p className={`text-xs transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Must include: uppercase, lowercase, number, special char (!@#$%^&*)
                </p>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiLock className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="e.g., MyPass123!"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className={`w-full pl-12 pr-12 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                      errors.password
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                        : theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                    }`}
                    style={{ 
                      WebkitTextSecurity: showPassword ? 'none' : 'disc',
                      textSecurity: showPassword ? 'none' : 'disc',
                      fontFamily: 'monospace'
                    } as React.CSSProperties}
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center justify-center z-50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowPassword(!showPassword);
                      }}
                      className={`flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-200/20 transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                      }`}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      style={{ 
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        position: 'relative',
                        zIndex: 9999
                      }}
                    >
                      {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1 flex items-center">
                    <span className="mr-1">⚠️</span> {errors.password}
                  </p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <label className={`text-sm font-semibold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Confirm password
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    <FiLock className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm your password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className={`w-full pl-12 pr-12 py-4 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200 ${
                      errors.confirmPassword
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                        : theme === 'dark'
                        ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-500'
                    }`}
                    style={{ 
                      WebkitTextSecurity: showConfirmPassword ? 'none' : 'disc',
                      textSecurity: showConfirmPassword ? 'none' : 'disc',
                      fontFamily: 'monospace'
                    } as React.CSSProperties}
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center justify-center z-50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowConfirmPassword(!showConfirmPassword);
                      }}
                      className={`flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-200/20 transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                      }`}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      style={{ 
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        position: 'relative',
                        zIndex: 9999
                      }}
                    >
                      {showConfirmPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-500 text-sm mt-1 flex items-center">
                    <span className="mr-1">⚠️</span> {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* General Error Message */}
              {errors.submit && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <p className="text-red-600 dark:text-red-400 text-sm">{errors.submit}</p>
                </div>
              )}

              {/* Terms Agreement */}
              <div className="flex items-start space-x-3">
                <button
                  type="button"
                  onClick={() => setAgreedToTerms(!agreedToTerms)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                    agreedToTerms
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : theme === 'dark'
                      ? 'border-gray-600 hover:border-gray-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {agreedToTerms && <FiCheck className="w-3 h-3" />}
                </button>
                <p className={`text-sm leading-relaxed transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  I agree to the{' '}
                  <button
                    type="button"
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' 
                        ? 'text-primary-400 hover:text-primary-300' 
                        : 'text-primary-600 hover:text-primary-700'
                    }`}
                  >
                    Terms of Service
                  </button>
                  {' '}and{' '}
                  <button
                    type="button"
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' 
                        ? 'text-primary-400 hover:text-primary-300' 
                        : 'text-primary-600 hover:text-primary-700'
                    }`}
                  >
                    Privacy Policy
                  </button>
                </p>
              </div>

              {/* Create Account Button */}
              <motion.button
                type="submit"
                disabled={isLoading || !agreedToTerms}
                whileHover={{ scale: agreedToTerms ? 1.02 : 1 }}
                whileTap={{ scale: agreedToTerms ? 0.98 : 1 }}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 flex items-center justify-center shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Create account
                    <FiArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* Sign In Link */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-8"
          >
            <p className={`transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className={`font-semibold transition-colors duration-200 ${
                  theme === 'dark' 
                    ? 'text-primary-400 hover:text-primary-300' 
                    : 'text-primary-600 hover:text-primary-700'
                }`}
              >
                Sign in
              </button>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Signup;
