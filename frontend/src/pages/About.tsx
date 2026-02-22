import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiInfo, FiStar, FiUsers, FiTarget } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useTheme } from '../contexts/ThemeContext';
import { contentService, type PageContent } from '../services/contentService';

const About: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [pageContent, setPageContent] = useState<PageContent | null>(null);

  // Load page content
  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent('about');
        setPageContent(content);
      } catch (error) {
        console.error('Failed to load page content:', error);
      }
    };

    loadPageContent();
  }, []);

  return (
    <div className={`min-h-screen ${
      theme === 'dark' 
        ? 'bg-gradient-to-b from-transparent via-gray-800/50 to-gray-800' 
        : 'bg-gradient-to-b from-transparent via-white/50 to-white'
    }`}>
      <Navbar 
        title="ABOUT GLINAX"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* App Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`backdrop-blur-md rounded-2xl p-6 mb-6 text-center border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}
        >
          <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiInfo className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {pageContent?.sections.find(s => s.id === 'app-title')?.title || 'Glinax Chatbot'}
          </h2>
          <p className={`mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {pageContent?.sections.find(s => s.id === 'app-title')?.content || 'Your AI Assistant for Ghana University Admissions'}
          </p>
          <div className={`px-3 py-1 rounded-full text-sm font-medium inline-block transition-colors duration-200 ${
            theme === 'dark' 
              ? 'bg-primary-600/20 text-primary-300' 
              : 'bg-primary-100 text-primary-700'
          }`}>
            {pageContent?.sections.find(s => s.id === 'version')?.content || 'Version 2.1.0'}
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4 mb-6"
        >
          <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {pageContent?.sections.find(s => s.id === 'features-title')?.title || 'Features'}
          </h3>
          
          <div className={`backdrop-blur-md rounded-2xl p-4 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}>
            <div className="flex items-center space-x-3">
              <FiStar className="w-5 h-5 text-yellow-500" />
              <div>
                <h4 className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'ai-assistance')?.title || 'AI-Powered Assistance'}
                </h4>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'ai-assistance')?.content || 'Get instant answers to your admission questions'}
                </p>
              </div>
            </div>
          </div>

          <div className={`backdrop-blur-md rounded-2xl p-4 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}>
            <div className="flex items-center space-x-3">
              <FiUsers className="w-5 h-5 text-blue-500" />
              <div>
                <h4 className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'university-network')?.title || 'University Network'}
                </h4>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'university-network')?.content || 'Access information from all major Ghanaian universities'}
                </p>
              </div>
            </div>
          </div>

          <div className={`backdrop-blur-md rounded-2xl p-4 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}>
            <div className="flex items-center space-x-3">
              <FiTarget className="w-5 h-5 text-green-500" />
              <div>
                <h4 className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'personalized-recommendations')?.title || 'Personalized Recommendations'}
                </h4>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'personalized-recommendations')?.content || 'Get program recommendations based on your interests'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Mission */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`backdrop-blur-md rounded-2xl p-6 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}
        >
          <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {pageContent?.sections.find(s => s.id === 'mission-title')?.title || 'Our Mission'}
          </h3>
          <p className={`leading-relaxed transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {pageContent?.sections.find(s => s.id === 'mission-title')?.content || 'To simplify the university admission process in Ghana by providing students with easy access to information, guidance, and support through our AI-powered platform. We believe every student deserves the opportunity to pursue higher education.'}
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default About;
