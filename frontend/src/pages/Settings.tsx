import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSun, FiMoon, FiMonitor, FiGlobe, FiBell, FiMail, FiInfo, FiLock } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useGuestLimitations } from '../hooks/useGuestLimitations';
import GuestLimitationModal from '../components/GuestLimitationModal';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { themeMode, setThemeMode, theme } = useTheme();
  const { isGuest } = useAuth();
  const { showLimitationModal, limitationData, checkGuestAccess, closeLimitationModal } =
    useGuestLimitations();
  const [localSettings, setLocalSettings] = useState({
    language: 'en',
    pushNotifications: true,
    emailUpdates: true,
  });

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark'
          ? 'bg-gradient-to-b from-transparent via-gray-800/50 to-gray-800'
          : 'bg-gradient-to-b from-transparent via-white/50 to-white'
      }`}
    >
      <Navbar
        title="SETTINGS"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex items-center mb-4">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mr-3"></div>
            <h3
              className={`text-lg font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}
            >
              Appearance
            </h3>
          </div>

          <div
            className={`backdrop-blur-md rounded-2xl p-6 space-y-6 border transition-all duration-200 ${
              theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/80 border-white/30'
            }`}
          >
            <div>
              <div className="flex items-center space-x-3 mb-3">
                <FiSun
                  className={`w-5 h-5 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}
                />
                <div>
                  <h4
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  >
                    Theme
                  </h4>
                  <p
                    className={`text-sm transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Choose your preferred theme
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setThemeMode('light')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    themeMode === 'light'
                      ? 'border-primary-500 bg-primary-50'
                      : theme === 'dark'
                        ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                        : 'border-gray-200 bg-white/60 hover:border-gray-300'
                  }`}
                >
                  <FiSun
                    className={`w-6 h-6 mx-auto mb-1 transition-colors duration-200 ${
                      themeMode === 'light'
                        ? 'text-primary-600'
                        : theme === 'dark'
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  />
                  <p
                    className={`text-xs font-medium transition-colors duration-200 ${
                      themeMode === 'light'
                        ? 'text-primary-700'
                        : theme === 'dark'
                          ? 'text-gray-200'
                          : 'text-gray-700'
                    }`}
                  >
                    Light
                  </p>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setThemeMode('dark')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    themeMode === 'dark'
                      ? 'border-primary-500 bg-primary-50'
                      : theme === 'dark'
                        ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                        : 'border-gray-200 bg-white/60 hover:border-gray-300'
                  }`}
                >
                  <FiMoon
                    className={`w-6 h-6 mx-auto mb-1 transition-colors duration-200 ${
                      themeMode === 'dark'
                        ? 'text-primary-600'
                        : theme === 'dark'
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  />
                  <p
                    className={`text-xs font-medium transition-colors duration-200 ${
                      themeMode === 'dark'
                        ? 'text-primary-700'
                        : theme === 'dark'
                          ? 'text-gray-200'
                          : 'text-gray-700'
                    }`}
                  >
                    Dark
                  </p>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setThemeMode('auto')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    themeMode === 'auto'
                      ? 'border-primary-500 bg-primary-50'
                      : theme === 'dark'
                        ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                        : 'border-gray-200 bg-white/60 hover:border-gray-300'
                  }`}
                >
                  <FiMonitor
                    className={`w-6 h-6 mx-auto mb-1 transition-colors duration-200 ${
                      themeMode === 'auto'
                        ? 'text-primary-600'
                        : theme === 'dark'
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  />
                  <p
                    className={`text-xs font-medium transition-colors duration-200 ${
                      themeMode === 'auto'
                        ? 'text-primary-700'
                        : theme === 'dark'
                          ? 'text-gray-200'
                          : 'text-gray-700'
                    }`}
                  >
                    Auto
                  </p>
                </motion.button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FiGlobe
                  className={`w-5 h-5 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}
                />
                <div>
                  <h4
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  >
                    Language
                  </h4>
                  <p
                    className={`text-sm transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Choose display Language
                  </p>
                </div>
              </div>
              <select
                value={localSettings.language}
                onChange={(e) => {
                  const newLanguage = e.target.value as 'en' | 'tw' | 'ga' | 'ew';
                  setLocalSettings({ ...localSettings, language: newLanguage });
                }}
                title="Select display language"
                aria-label="Display language"
                className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors duration-200 ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white/60 border-white/30 text-gray-900'
                }`}
              >
                <option value="en">English</option>
                <option value="tw">Twi</option>
                <option value="ga">Ga</option>
                <option value="ew">Ewe</option>
              </select>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center mb-4">
            <FiBell
              className={`w-5 h-5 mr-3 transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}
            />
            <h3
              className={`text-lg font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}
            >
              Notifications
            </h3>
          </div>

          <div
            className={`backdrop-blur-md rounded-2xl p-6 space-y-6 border transition-all duration-200 ${
              theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/80 border-white/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <FiBell
                  className={`w-5 h-5 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}
                />
                <div className="flex-1">
                  <h4
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  >
                    Push Notifications
                  </h4>
                  <p
                    className={`text-sm transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Get Notified about Updates
                  </p>
                  {isGuest && (
                    <p
                      className={`text-xs mt-1 transition-colors duration-200 ${
                        theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
                      }`}
                    >
                      Account required
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!checkGuestAccess('notifications')) return;
                  const newValue = !localSettings.pushNotifications;
                  setLocalSettings({ ...localSettings, pushNotifications: newValue });
                }}
                disabled={isGuest}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isGuest
                    ? theme === 'dark'
                      ? 'bg-gray-700 cursor-not-allowed'
                      : 'bg-gray-200 cursor-not-allowed'
                    : localSettings.pushNotifications
                      ? 'bg-primary-500'
                      : theme === 'dark'
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                }`}
              >
                {isGuest ? (
                  <FiLock
                    className={`absolute inset-0 m-auto w-3 h-3 ${
                      theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  />
                ) : (
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.pushNotifications ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <FiMail
                  className={`w-5 h-5 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}
                />
                <div className="flex-1">
                  <h4
                    className={`font-medium transition-colors duration-200 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}
                  >
                    Email Updates
                  </h4>
                  <p
                    className={`text-sm transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    Receive admissions via email
                  </p>
                  {isGuest && (
                    <p
                      className={`text-xs mt-1 transition-colors duration-200 ${
                        theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
                      }`}
                    >
                      Account required
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!checkGuestAccess('notifications')) return;
                  const newValue = !localSettings.emailUpdates;
                  setLocalSettings({ ...localSettings, emailUpdates: newValue });
                }}
                disabled={isGuest}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isGuest
                    ? theme === 'dark'
                      ? 'bg-gray-700 cursor-not-allowed'
                      : 'bg-gray-200 cursor-not-allowed'
                    : localSettings.emailUpdates
                      ? 'bg-primary-500'
                      : theme === 'dark'
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                }`}
              >
                {isGuest ? (
                  <FiLock
                    className={`absolute inset-0 m-auto w-3 h-3 ${
                      theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  />
                ) : (
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.emailUpdates ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* App Information Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center mb-4">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 transition-colors duration-200 ${
                theme === 'dark' ? 'bg-blue-900/50' : 'bg-blue-100'
              }`}
            >
              <FiInfo
                className={`w-4 h-4 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                }`}
              />
            </div>
            <h3
              className={`text-lg font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}
            >
              App Information
            </h3>
          </div>

          <div
            className={`backdrop-blur-md rounded-2xl p-6 border transition-all duration-200 ${
              theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/80 border-white/30'
            }`}
          >
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <span
                  className={`transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  Version
                </span>
                <span
                  className={`font-medium transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}
                >
                  2.1.0
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span
                  className={`transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  Last Updated
                </span>
                <span
                  className={`font-medium transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}
                >
                  {new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <div className="text-center mb-6">
              <h4
                className={`font-bold mb-1 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}
              >
                CERKYL
              </h4>
              <p
                className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                Your AI Assistant for Ghana University Admissions
              </p>
            </div>

            <div className="flex space-x-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Privacy
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Rate Us
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Terms
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Guest Limitation Modal */}
      <GuestLimitationModal
        isOpen={showLimitationModal}
        onClose={closeLimitationModal}
        feature={limitationData?.feature || ''}
        description={limitationData?.description || ''}
        benefits={limitationData?.benefits || []}
      />
    </div>
  );
};

export default Settings;
