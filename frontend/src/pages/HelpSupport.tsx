import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHelpCircle, FiMessageCircle, FiMail, FiPhone, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useTheme } from '../contexts/ThemeContext';
import { HELP_SECTIONS, FAQS } from '../data/constants';
import { contentService, type PageContent } from '../services/contentService';

const HelpSupport: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const helpSections = HELP_SECTIONS;

  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent('help-support');
        setPageContent(content);
      } catch (error) {
        console.error('Failed to load page content:', error);
      }
    };

    loadPageContent();
  }, []);

  // Toggle FAQ expansion
  const toggleFAQ = (faqId: string) => {
    setExpandedFAQ(expandedFAQ === faqId ? null : faqId);
  };

  // Find FAQ answer by question
  const getFAQByQuestion = (question: string) => {
    return FAQS.find(faq => faq.question === question);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Navbar 
        title="HELP & SUPPORT"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
        {helpSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sectionIndex * 0.1 }}
            className="mb-6"
          >
            <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>{section.title}</h3>
            
            <div className="space-y-3">
              {section.title === "Frequently Asked Questions" ? (
                // FAQ items with expandable answers
                section.items.map((item, itemIndex) => {
                  const faq = getFAQByQuestion(item);
                  if (!faq) return null;
                  
                  const isExpanded = expandedFAQ === faq.id;
                  
                  return (
                    <motion.div
                      key={faq.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: sectionIndex * 0.1 + itemIndex * 0.05 }}
                      className={`overflow-hidden transition-all duration-300 ${
                        theme === 'dark' 
                          ? 'glass-card-unified-dark bg-gray-700/80' 
                          : 'glass-card-unified bg-white/80'
                      }`}
                    >
                      {/* FAQ Question - Clickable Header */}
                      <button
                        onClick={() => toggleFAQ(faq.id)}
                        className="w-full p-4 flex items-center justify-between hover:shadow-lg transition-all duration-300"
                      >
                        <div className="flex items-center space-x-3 flex-1 text-left">
                          <FiHelpCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                          <span className={`font-medium transition-colors duration-200 ${
                            theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                          }`}>{faq.question}</span>
                        </div>
                        <div className="ml-3 flex-shrink-0">
                          {isExpanded ? (
                            <FiChevronUp className={`w-5 h-5 transition-colors duration-200 ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                            }`} />
                          ) : (
                            <FiChevronDown className={`w-5 h-5 transition-colors duration-200 ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                            }`} />
                          )}
                        </div>
                      </button>
                      
                      {/* FAQ Answer - Expandable Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className={`px-4 pb-4 border-t transition-colors duration-200 ${
                              theme === 'dark' 
                                ? 'border-gray-600 text-gray-300' 
                                : 'border-gray-200 text-gray-700'
                            }`}>
                              <p className="text-sm leading-relaxed mt-3 text-justify">
                                {faq.answer}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              ) : (
                // Regular support items (non-FAQ)
                section.items.map((item, itemIndex) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: sectionIndex * 0.1 + itemIndex * 0.05 }}
                    className={`p-4 hover:shadow-lg transition-all duration-300 cursor-pointer ${
                      theme === 'dark' 
                        ? 'glass-card-unified-dark bg-gray-700/80' 
                        : 'glass-card-unified bg-white/80'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <FiHelpCircle className="w-5 h-5 text-primary-600" />
                      <span className={`transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                      }`}>{item}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        ))}

        {/* Contact Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`p-6 ${
            theme === 'dark' 
              ? 'glass-card-unified-dark bg-gray-700/80' 
              : 'glass-card-unified bg-white/80'
          }`}
        >
          <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {pageContent?.sections.find(s => s.id === 'get-in-touch-title')?.title || 'Get in Touch'}
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <FiMessageCircle className="w-5 h-5 text-primary-600" />
              <div>
                <p className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'live-chat')?.title || 'Live Chat'}
                </p>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'live-chat')?.content || 'Available 24/7'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <FiMail className="w-5 h-5 text-primary-600" />
              <div>
                <p className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'email-support')?.title || 'Email'}
                </p>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'email-support')?.content }
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <FiPhone className="w-5 h-5 text-primary-600" />
              <div>
                <p className={`font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {pageContent?.sections.find(s => s.id === 'phone-support')?.title || 'Phone'}
                </p>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {import.meta.env.VITE_CONTACT_PHONE || pageContent?.sections.find(s => s.id === 'phone-support')?.content || ''}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HelpSupport;
