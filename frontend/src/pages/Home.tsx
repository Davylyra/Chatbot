/**
 * Home Page Component
 * 
 * This is the main landing page of the Glinax Chatbot application.
 * It displays personalized greetings, action buttons, and university information.
 * 
 * Features:
 * - Personalized greeting based on user authentication status
 * - Quick action buttons for chat and forms
 * - Program recommendation card
 * - University sessions with search functionality
 * - Responsive design with glassmorphism effects
 * - Fixed height layout that adjusts to screen size
 * 
 * Layout Structure:
 * - Fixed height container (100vh/100dvh) with no scrolling
 * - Navbar at the top with fixed height
 * - Content area with scrollable content inside
 * - Responsive adjustments for different screen heights
 * 
 * Integration Notes:
 * - Ready for backend data integration
 * - Loading states implemented for better UX
 * - Error handling for failed data loads
 * - Uses unified glassmorphism system for consistent styling
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiMessageCircle, 
  FiShoppingCart, 
  FiUsers, 
  FiSearch,
  FiStar,
  FiX
} from 'react-icons/fi';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
// LoadingSpinner removed - app loads instantly
import LazyImage from '../components/LazyImage';
import { useAppStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getTimeBasedGreeting } from '../utils/greetings';
import { useGuestLimitations } from '../hooks/useGuestLimitations';
import GuestLimitationModal from '../components/GuestLimitationModal';
import { contentService, type PageContent } from '../services/contentService';

const Home: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setError] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  
  const navigate = useNavigate();
  const { user, isAuthenticated, isGuest } = useAuth();
  const { loadForms, forms, currentConversation, saveCurrentConversation } = useAppStore();
  const { theme } = useTheme();
  const { 
    showLimitationModal, 
    limitationData, 
    checkGuestAccess, 
    closeLimitationModal 
  } = useGuestLimitations();

  // Load initial data when component mounts
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load forms and universities data
        // TODO: Replace with real API calls from services/api.ts
        if (isAuthenticated && forms.length === 0) {
          await loadForms();
        }
        
        // TODO: Load universities when backend integration is ready
        // if (universities.length === 0) {
        //   await loadUniversities();
        // }
      } catch {
        setError('Failed to load data. Please try again.');
        // Error loading initial data - handled gracefully
      }
    };

    loadInitialData();
  }, [isAuthenticated, forms.length, loadForms]);

  // Load page content
  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent('home');
        setPageContent(content);
      } catch (error) {
        console.error('Failed to load page content:', error);
      }
    };

    loadPageContent();
  }, []);

  // Use forms data from store, fallback to static data
  const allUniversities = forms.length > 0 ? forms.slice(0, 6) : [
    {
      id: "1",
      universityName: "KNUST",
      fullName: "Kwame Nkrumah Univ. of Science & Technology",
      logo: "/university-logos/knust-logo.png"
    },
    {
      id: "2",
      universityName: "UG", 
      fullName: "University of Ghana",
      logo: "/university-logos/ug-logo.png"
    },
    {
      id: "3",
      universityName: "UCC",
      fullName: "University of Cape Coast", 
      logo: "/university-logos/ucc-logo.png"
    },
    {
      id: "4",
      universityName: "UDS",
      fullName: "University for Development Studies",
      logo: "/university-logos/uds-logo.png"
    },
    {
      id: "5",
      universityName: "GCTU",
      fullName: "Ghana Communication Technology University",
      logo: "/university-logos/gctu-logo.png"
    },
    {
      id: "6",
      universityName: "UEW",
      fullName: "University of Education, Winneba",
      logo: "/university-logos/uew-logo.png"
    }
  ];

  const filteredUniversities = useMemo(() => 
    searchQuery
      ? allUniversities.filter(uni =>
          uni.universityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          uni.fullName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : allUniversities.slice(0, 3),
    [searchQuery, allUniversities]
  );

  const displayUniversities = useMemo(() => 
    searchOpen ? filteredUniversities : allUniversities.slice(0, 3),
    [searchOpen, filteredUniversities, allUniversities]
  );

  // App loads instantly - no loading states

  // App handles errors gracefully without blocking UI

  return (
    <div className="fixed-height-container flex flex-col overflow-hidden">
      <Navbar 
        title="GLINAX"
        onMenuClick={() => setSidebarOpen(true)}
        showProfileButton={true}
        onProfileClick={() => navigate('/profile')}
      />
      
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="fixed-height-content flex flex-col max-w-sm mx-auto px-4 py-4 overflow-hidden">
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Welcome Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-4"
          >
          <p className={`text-sm transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {`${getTimeBasedGreeting()}! `}
            {pageContent?.sections.find(s => s.id === 'welcome-message')?.content || 'Your AI Assistant for Ghana University Admissions'}
          </p>
          {isGuest && (
            <div className={`mt-2 px-3 py-1 rounded-full text-xs transition-colors duration-200 ${
              theme === 'dark' 
                ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700' 
                : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
            }`}>
              {pageContent?.sections.find(s => s.id === 'guest-mode-notice')?.content || 'Guest Mode - Limited Features'}
            </div>
          )}
        </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center gap-3 mb-6"
          >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              // Save current conversation and start a new one
              if (checkGuestAccess('chat')) {
                // Save current conversation if it exists and has messages
                if (currentConversation) {
                  saveCurrentConversation();
                }
                
                // Force a new conversation start
                navigate('/chat', { state: { forceNewConversation: true } });
              }
            }}
            className="w-32 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-200 shadow-md flex flex-col items-center justify-center space-y-2"
          >
            <FiMessageCircle className="w-5 h-5" />
            <span className="text-xs">
              {pageContent?.sections.find(s => s.id === 'start-chat-button')?.content || 'Start New Chat'}
            </span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/forms')}
            className="w-32 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-200 shadow-md flex flex-col items-center justify-center space-y-2"
          >
            <FiShoppingCart className="w-5 h-5" />
            <span className="text-xs">
              {pageContent?.sections.find(s => s.id === 'buy-forms-button')?.content || 'Buy Forms'}
            </span>
          </motion.button>
        </motion.div>

          {/* Personalized Greeting */}
          {isAuthenticated && user && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center mb-4"
            >
              <h2 className={`text-2xl font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-primary-400' : 'text-primary-600'
              }`}>
                Hello<br />{isGuest ? 'Guest' : user.name}
              </h2>
            </motion.div>
          )}

          {/* Program Recommendation Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={`p-4 mb-4 shadow-lg transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark' 
              : 'glass-card-unified'
          }`}
        >
          <div className="flex items-center mb-4">
            <div className="bg-yellow-400 rounded-full p-2 mr-3 shadow-md">
              <FiStar className="w-4 h-4 text-white" />
            </div>
            <h3 className={`font-bold text-lg transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              {pageContent?.sections.find(s => s.id === 'program-recommendation-title')?.title || 'Get Program Recommendation'}
            </h3>
          </div>
          <p className={`text-sm mb-5 leading-relaxed transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          }`}>
            {pageContent?.sections.find(s => s.id === 'program-recommendation-title')?.content || 'Tell us your grades and interests, and we\'ll recommend the best programs for you'}
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (checkGuestAccess('assessment')) {
                navigate('/assessment');
              }
            }}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-200 shadow-md text-sm"
          >
            {pageContent?.sections.find(s => s.id === 'start-assessment-button')?.content || 'Start Assessment'}
          </motion.button>
        </motion.div>

          {/* University Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`p-4 mb-4 shadow-lg transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark' 
              : 'glass-card-unified'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'bg-white/10 border border-white/20' 
                  : 'bg-gray-100'
              }`}>
                <FiUsers className={`w-5 h-5 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-700'
                }`} />
              </div>
              <h3 className={`text-lg font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                {pageContent?.sections.find(s => s.id === 'university-sessions-title')?.content || 'University Sessions'}
              </h3>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSearchOpen(!searchOpen)}
              className={`p-2 rounded-full transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'hover:bg-white/10' 
                  : 'hover:bg-gray-100'
              }`}
            >
              {searchOpen ? (
                <FiX className={`w-5 h-5 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`} />
              ) : (
                <FiSearch className={`w-5 h-5 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`} />
              )}
            </motion.button>
          </div>

          {/* Search Bar */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-4 overflow-hidden"
              >
                <div className={`p-4 flex items-center space-x-3 transition-all duration-200 ${
                  theme === 'dark' ? 'glass-input-dark' : 'glass-input'
                }`}>
                  <FiSearch className={`w-4 h-4 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search universities..."
                    className={`flex-1 bg-transparent outline-none text-sm transition-colors duration-200 ${
                      theme === 'dark' 
                        ? 'text-gray-200 placeholder-gray-400' 
                        : 'text-gray-700 placeholder-gray-500'
                    }`}
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {displayUniversities.map((university, index) => (
                <motion.div
                  key={university.id || university.universityName}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-2xl hover:shadow-xl transition-all duration-300 cursor-pointer ${
                    theme === 'dark' 
                      ? 'bg-gray-700/50 border border-gray-600/50 hover:bg-gray-700/70' 
                      : 'bg-gray-50/50 border border-gray-200/50 hover:bg-gray-50/70'
                  }`}
                  onClick={() => {
                    // Save current conversation and start university-specific chat
                    if (currentConversation) {
                      saveCurrentConversation();
                    }
                    
                    navigate('/chat', { 
                      state: { 
                        universityContext: {
                          name: university.universityName,
                          fullName: university.fullName,
                          logo: university.logo
                        },
                        forceNewConversation: true,
                        initialMessage: `Tell me about ${university.fullName} - their programs, admission requirements, and application process.`
                      }
                    });
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <LazyImage 
                        src={university.logo || "/university-logos/default-logo.png"}
                        alt={`${university.universityName} logo`}
                        className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 shadow-md"
                        priority={false}
                        fallback={
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-md ${
                            university.universityName === 'KNUST' ? 'bg-blue-600' :
                            university.universityName === 'UG' ? 'bg-green-600' :
                            university.universityName === 'UCC' ? 'bg-cyan-500' :
                            university.universityName === 'UDS' ? 'bg-emerald-500' :
                            university.universityName === 'UENR' ? 'bg-amber-500' :
                            university.universityName === 'UEW' ? 'bg-purple-500' :
                            university.universityName === 'UMaT' ? 'bg-blue-500' :
                            university.universityName === 'UHAS' ? 'bg-emerald-500' :
                            university.universityName === 'GCTU' ? 'bg-pink-500' :
                            university.universityName === 'TTU' ? 'bg-orange-500' :
                            university.universityName === 'UPSA' ? 'bg-indigo-500' :
                            'bg-gray-500'
                          }`}>
                            {university.universityName}
                          </div>
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-semibold text-sm transition-colors duration-200 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-800'
                      }`}>{university.universityName}</h4>
                      <p className={`text-xs truncate transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                      }`}>{university.fullName}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {searchOpen && filteredUniversities.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`text-center py-6 transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <div className={`p-4 transition-all duration-200 ${
                theme === 'dark' 
                  ? 'glass-unified-dark' 
                  : 'glass-unified'
              }`}>
                <p className="text-sm">
                  {pageContent?.sections.find(s => s.id === 'no-universities-found')?.content || 'No universities found'}
                </p>
              </div>
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (checkGuestAccess('universities')) {
                navigate('/universities');
              }
            }}
            className="w-full mt-4 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-200 shadow-md text-sm"
          >
            {pageContent?.sections.find(s => s.id === 'view-all-universities-button')?.content || 'View All Universities'}
          </motion.button>
          </motion.div>
        </div>
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

export default Home;
