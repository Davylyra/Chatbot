import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiTrash2, FiLock, FiLogIn } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useTheme } from '../contexts/ThemeContext';
import { useAppStore } from '../store';
import { useAuth } from '../contexts/AuthContext';

const RecentChats: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { isAuthenticated, isGuest } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  
  // Use dynamic chat data from store
  const { conversations, deleteConversation } = useAppStore();
  const [chatSections, setChatSections] = useState<Array<{
    title: string;
    chats: Array<{
      id: string;
      name: string;
      color: string;
      timestamp: Date;
    }>;
  }>>([]);

  // Convert conversations to chat sections format
  useEffect(() => {
    if (conversations.length === 0) {
      setChatSections([]);
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const sections: Array<{
      title: string;
      chats: Array<{
        id: string;
        name: string;
        color: string;
        timestamp: Date;
      }>;
    }> = [
      { title: "Today", chats: [] },
      { title: "Yesterday", chats: [] },
      { title: "Previous 7 Days", chats: [] }
    ];

    const colors = [
      "bg-orange-500", "bg-blue-500", "bg-purple-500", "bg-red-500", 
      "bg-green-500", "bg-pink-500", "bg-indigo-500", "bg-yellow-500"
    ];

    conversations.forEach((conv, index) => {
      const convDate = new Date(conv.timestamp);
      const chatItem = {
        id: conv.id,
        name: conv.title || `Chat ${index + 1}`,
        color: colors[index % colors.length],
        timestamp: convDate
      };

      if (convDate >= today) {
        sections[0].chats.push(chatItem);
      } else if (convDate >= yesterday) {
        sections[1].chats.push(chatItem);
      } else if (convDate >= weekAgo) {
        sections[2].chats.push(chatItem);
      }
    });

    // Filter out empty sections
    setChatSections(sections.filter(section => section.chats.length > 0));
  }, [conversations]);

  const deleteChat = (chatId: string) => {
    // Use store's deleteConversation method
    deleteConversation(chatId);
  };

  const filteredSections = chatSections.map(section => ({
    ...section,
    chats: section.chats.filter(chat => 
      chat.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(section => section.chats.length > 0);

  return (
    <div className="min-h-screen">
      <Navbar 
        title="RECENT CHATS"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      {/* Guest User Guard - Show clear error message */}
      {(isGuest || !isAuthenticated) && (
        <div className="max-w-md mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`p-8 text-center rounded-2xl border-2 ${
              theme === 'dark'
                ? 'bg-gray-800/50 border-yellow-500/30 backdrop-blur-md'
                : 'bg-yellow-50/80 border-yellow-400/50 backdrop-blur-md'
            }`}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mb-4"
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                theme === 'dark'
                  ? 'bg-yellow-500/20'
                  : 'bg-yellow-400/20'
              }`}>
                <FiLock className={`w-8 h-8 ${
                  theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
                }`} />
              </div>
            </motion.div>
            
            <h2 className={`text-2xl font-bold mb-3 ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              Authentication Required
            </h2>
            
            <p className={`text-lg mb-6 leading-relaxed ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Log in to access your conversation history and save your chats for future reference.
            </p>
            
            <div className="space-y-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/login', { state: { from: '/recent-chats' } })}
                className={`w-full py-3 px-6 rounded-xl font-semibold flex items-center justify-center space-x-2 transition-all duration-200 ${
                  theme === 'dark'
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                }`}
              >
                <FiLogIn className="w-5 h-5" />
                <span>Log In to Continue</span>
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/signup')}
                className={`w-full py-3 px-6 rounded-xl font-medium transition-all duration-200 ${
                  theme === 'dark'
                    ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-200 border border-gray-600'
                    : 'bg-white/80 hover:bg-white text-gray-700 border border-gray-300'
                }`}
              >
                Create New Account
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/')}
                className={`w-full py-2 px-4 rounded-lg text-sm transition-all duration-200 ${
                  theme === 'dark'
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-600 hover:text-gray-700'
                }`}
              >
                Return to Home
              </motion.button>
            </div>
            
            <div className={`mt-6 pt-6 border-t ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            }`}>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                💡 <strong>Note:</strong> Guest users can still chat with the AI assistant, but conversation history is not saved.
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Only show chat history for authenticated users */}
      {isAuthenticated && !isGuest && (
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className={`p-4 flex items-center space-x-3 transition-all duration-200 ${
            theme === 'dark' 
              ? 'glass-unified-dark' 
              : 'glass-unified'
          }`}>
            <FiSearch className={`w-5 h-5 transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`} />
            <input
              type="text"
              placeholder="Search Chats...."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`flex-1 bg-transparent outline-none transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'text-gray-200 placeholder-gray-400' 
                  : 'text-gray-700 placeholder-gray-500'
              }`}
            />
          </div>
        </motion.div>

        {/* Chat Sections */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          <AnimatePresence>
            {filteredSections.length > 0 ? (
              filteredSections.map((section, sectionIndex) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: sectionIndex * 0.1 }}
                >
                  <h3 className={`text-lg font-bold mb-3 transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{section.title}</h3>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {section.chats.map((chat, chatIndex) => (
                        <motion.div
                          key={chat.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20, scale: 0.95 }}
                          transition={{ delay: chatIndex * 0.05 }}
                          className={`p-4 hover:shadow-lg transition-all duration-300 cursor-pointer relative group ${
                            theme === 'dark' 
                              ? 'glass-unified-dark hover:bg-white/10' 
                              : 'glass-unified hover:bg-white/30'
                          }`}
                          onClick={() => navigate('/chat')}
                          onMouseEnter={() => setHoveredChat(chat.id)}
                          onMouseLeave={() => setHoveredChat(null)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 rounded-full ${chat.color}`}></div>
                              <span className={`font-medium transition-colors duration-200 ${
                                theme === 'dark' ? 'text-white' : 'text-gray-800'
                              }`}>{chat.name}</span>
                            </div>
                            
                            {/* Delete Button - appears on hover */}
                            <motion.button
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ 
                                opacity: hoveredChat === chat.id ? 1 : 0,
                                scale: hoveredChat === chat.id ? 1 : 0.8
                              }}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteChat(chat.id);
                              }}
                              className={`p-2 rounded-full transition-all duration-200 ${
                                theme === 'dark'
                                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                  : 'bg-red-100 hover:bg-red-200 text-red-600'
                              }`}
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className={`text-lg font-medium transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {searchQuery ? 'No chats found matching your search.' : 'No recent chats available.'}
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`mt-2 text-sm transition-colors duration-200 ${
                      theme === 'dark' ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'
                    }`}
                  >
                    Clear search
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer Stats */}
        {filteredSections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 pt-4 border-t border-white/20"
          >
            <div className={`flex justify-between items-center text-sm transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              <span>{chatSections.reduce((total, section) => total + section.chats.length, 0)} Conversations</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>{chatSections.reduce((total, section) => total + section.chats.length, 0) * 3} Messages</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      )}
    </div>
  );
};

export default RecentChats;
