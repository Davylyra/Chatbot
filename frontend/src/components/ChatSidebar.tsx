import React, { memo, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiMessageCircle,
  FiStar,
  FiUsers,
  FiFileText,
  FiSearch,
  FiUser,
  FiX,
  FiMenu,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  universityContext?: string;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDesktop?: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = memo(({ isOpen, onClose, isDesktop = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { theme } = useTheme();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const endpoint = token
          ? `${API_BASE_URL}/chat/conversations?limit=15`
          : `${API_BASE_URL}/chat/conversations-demo?limit=15`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const convList = data.conversations || data.data || [];
          if (Array.isArray(convList)) {
            const formatted = convList.map((conv: any) => ({
              id: conv.id || conv._id?.toString(),
              title: conv.title || 'New Conversation',
              lastMessage: conv.lastMessage || conv.last_message || '',
              timestamp: conv.timestamp || new Date().toISOString(),
              messageCount: Number(conv.messageCount || 0),
            }));
            setConversations(formatted);
          }
        }
      } catch (err) {
        console.error('Error fetching recent chats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, [API_BASE_URL]);

  const quickAccess = [
    {
      icon: FiStar,
      label: 'Career Coach',
      color: 'bg-purple-500',
      action: () =>
        navigate('/chat', {
          state: {
            forceNewConversation: true,
            forceCoachMode: true,
            initialMessage:
              "I am confused about my career path and need help finding out what I'm good at.",
          },
        }),
    },
    {
      icon: FiUsers,
      label: 'Compare Schools',
      color: 'bg-blue-500',
      action: () =>
        navigate('/chat', {
          state: { forceNewConversation: true, initialMessage: 'Compare KNUST and UG' },
        }),
    },
    {
      icon: FiFileText,
      label: 'Admission Requirements',
      color: 'bg-green-500',
      action: () =>
        navigate('/chat', {
          state: {
            forceNewConversation: true,
            initialMessage: 'What are the admission requirements?',
          },
        }),
    },
    {
      icon: FiSearch,
      label: 'Explore Programs',
      color: 'bg-orange-500',
      action: () =>
        navigate('/chat', {
          state: {
            forceNewConversation: true,
            initialMessage: 'I want to explore university programs',
          },
        }),
    },
  ];

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <AnimatePresence>
        {!isDesktop && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          width: isDesktop ? (isOpen ? 280 : 72) : 280,
          x: !isDesktop && !isOpen ? -300 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`${isDesktop ? 'relative' : 'fixed'} left-0 top-0 h-full shadow-2xl z-50 flex flex-col transition-colors duration-200 ${theme === 'dark' ? 'bg-[#13161a] border-gray-800' : 'bg-gray-50 border-gray-200'} border-r overflow-hidden whitespace-nowrap`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center h-[72px] ${isOpen ? 'justify-between' : 'justify-center'} ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}
        >
          {isOpen ? (
            <>
              <div
                className="flex items-center space-x-3 cursor-pointer"
                onClick={() => navigate('/')}
              >
                <img src="/cerkyl.svg" alt="CERKYL" className="w-8 h-8 object-contain" />
                <span
                  className={`text-xl font-bold tracking-wide ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                >
                  CERKYL
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close sidebar"
                title="Close sidebar"
                className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
              >
                {isDesktop ? <FiMenu className="w-5 h-5" /> : <FiX className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggleSidebar'))}
              aria-label="Open sidebar"
              title="Open sidebar"
              className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
            >
              <FiMenu className="w-6 h-6" />
            </button>
          )}
        </div>

        {isOpen && (
          <div className="px-5 py-4">
            <div
              className={`flex items-center rounded-2xl px-4 py-3 mb-4 transition-colors ${theme === 'dark' ? 'bg-[#1e2329]' : 'bg-white border border-gray-200 shadow-sm'}`}
            >
              <FiSearch className="text-gray-500 w-5 h-5 mr-3 shrink-0" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-transparent w-full focus:outline-none text-sm ${theme === 'dark' ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
              />
            </div>

            <button
              onClick={() => {
                if (location.pathname === '/chat') {
                  window.dispatchEvent(new CustomEvent('triggerNewChat'));
                } else {
                  navigate('/chat', { state: { forceNewConversation: true } });
                }
                if (!isDesktop) onClose();
              }}
              className="w-full flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-3 font-medium transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            >
              <span className="text-xl mr-2">+</span> New Chat
            </button>
          </div>
        )}

        {!isOpen && (
          <div className="px-2 py-4 flex justify-center">
            <button
              onClick={() => {
                if (location.pathname === '/chat') {
                  window.dispatchEvent(new CustomEvent('triggerNewChat'));
                } else {
                  navigate('/chat', { state: { forceNewConversation: true } });
                }
              }}
              className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)]"
              title="New Chat"
            >
              <span className="text-xl">+</span>
            </button>
          </div>
        )}

        {/* Scrollable Middle Section */}
        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
          {/* Quick Access */}
          <div className={`${isOpen ? 'px-5 py-4' : 'px-2 py-4'} shrink-0`}>
            {isOpen && (
              <h3
                className={`text-xs font-bold mb-3 tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                QUICK ACCESS
              </h3>
            )}
            <div className={`space-y-2 ${!isOpen && 'flex flex-col items-center'}`}>
              {quickAccess.map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    item.action();
                    if (!isDesktop) onClose();
                  }}
                  title={!isOpen ? item.label : undefined}
                  className={`${isOpen ? 'w-full px-2.5' : 'w-10 justify-center'} flex items-center space-x-3 py-2.5 rounded-xl transition-all duration-200 group ${theme === 'dark' ? 'hover:bg-[#1e2329]' : 'hover:bg-gray-200'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white ${item.color}`}
                  >
                    <item.icon className="w-4 h-4" />
                  </div>
                  {isOpen && (
                    <span
                      className={`font-semibold text-sm ${theme === 'dark' ? 'text-gray-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'}`}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Chats */}
          <div className={`${isOpen ? 'px-5 py-2' : 'px-2 py-2'} flex-1`}>
            {isOpen && (
              <h3
                className={`text-xs font-bold mb-3 tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                RECENT ACTIVITY
              </h3>
            )}
            <div className={`space-y-1 pb-4 ${!isOpen && 'flex flex-col items-center'}`}>
              {loading
                ? isOpen && (
                    <div
                      className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
                    >
                      Loading...
                    </div>
                  )
                : filteredConversations.length > 0
                  ? filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        title={!isOpen ? conv.title : undefined}
                        onClick={() => {
                          navigate('/chat', {
                            state: { conversationId: conv.id, conversationTitle: conv.title },
                          });
                          if (!isDesktop) onClose();
                        }}
                        className={`${isOpen ? 'w-full px-2.5' : 'w-10 justify-center'} flex items-center space-x-3 py-2.5 rounded-xl transition-all duration-200 group ${theme === 'dark' ? 'hover:bg-[#1e2329] text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-800'}`}
                      >
                        <FiMessageCircle className="w-5 h-5 shrink-0" />
                        {isOpen && <span className="text-sm truncate text-left">{conv.title}</span>}
                      </button>
                    ))
                  : isOpen && (
                      <div
                        className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
                      >
                        No recent chats
                      </div>
                    )}
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div
          className={`p-4 border-t flex ${isOpen ? 'items-center space-x-3' : 'justify-center'} ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}
        >
          <div
            onClick={() => navigate('/profile')}
            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors border ${theme === 'dark' ? 'bg-[#1e2329] border-gray-700 hover:bg-gray-800' : 'bg-white shadow-sm border-gray-200 hover:bg-gray-100'}`}
          >
            <FiUser className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('/profile')}>
              <h4
                className={`font-bold text-sm truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
              >
                {isGuest ? 'Guest' : user?.name || 'User'}
              </h4>
              <p
                className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                {isGuest ? 'Limited Plan' : 'Free Plan'}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
});

export default ChatSidebar;
