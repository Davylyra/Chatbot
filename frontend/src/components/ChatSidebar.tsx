import React, { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiMessageCircle,
  FiStar,
  FiShoppingCart,
  FiClipboard,
  FiUser,
  FiX,
  FiMenu,
  FiTrash2,
  FiPlus,
  FiBell,
  FiFileText,
  FiSettings,
  FiHelpCircle,
  FiInfo,
  FiLogOut,
  FiLogIn,
  FiUserPlus,
  FiChevronUp,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { guestHeaders } from '../utils/guestId';

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
  // Event the collapsed sidebar's menu button fires to expand it. The chat
  // page and the other pages listen for different names.
  toggleEvent?: string;
}

const CHAT_LIMIT = 30;

// One sidebar for every page, laid out like ChatGPT and Claude: new chat and
// a few shortcuts at the top, the student's chats in the middle, and the
// account menu under their name at the bottom.
const ChatSidebar: React.FC<ChatSidebarProps> = memo(
  ({ isOpen, onClose, isDesktop = false, toggleEvent = 'toggleSidebar' }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isGuest, isAuthenticated, logout } = useAuth();
    const { theme } = useTheme();
    const dark = theme === 'dark';

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    const token = localStorage.getItem('token');
    const loggedIn = isAuthenticated && !!token;

    // silent = true skips the loading text, used for background refreshes
    // (polling, post-delete, post-send) so the list doesn't flicker.
    const fetchConversations = async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        const currentToken = localStorage.getItem('token');
        const endpoint = currentToken
          ? `${API_BASE_URL}/chat/conversations?limit=${CHAT_LIMIT}`
          : `${API_BASE_URL}/chat/conversations-demo?limit=${CHAT_LIMIT}`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : guestHeaders()),
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const convList = data.conversations || data.data || [];
          if (Array.isArray(convList)) {
            setConversations(
              convList.map((conv: any) => ({
                id: conv.id || conv._id?.toString(),
                title: conv.title || 'New Conversation',
                lastMessage: conv.lastMessage || conv.last_message || '',
                timestamp: conv.timestamp || new Date().toISOString(),
                messageCount: Number(conv.messageCount || 0),
              }))
            );
          }
        }
      } catch (err) {
        console.error('Error fetching recent chats:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    };

    useEffect(() => {
      fetchConversations();

      // Titles are generated server-side a moment after the first exchange,
      // and a brand-new conversation isn't in this list until it's saved.
      // Refetch quietly so the sidebar catches up without a page reload.
      const handleExternalRefresh = () => fetchConversations(true);
      window.addEventListener('conversationsUpdated', handleExternalRefresh);

      const pollId = window.setInterval(() => fetchConversations(true), 20000);

      return () => {
        window.removeEventListener('conversationsUpdated', handleExternalRefresh);
        window.clearInterval(pollId);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [API_BASE_URL]);

    useEffect(() => {
      if (!menuOpen) return;
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    const closeOnMobile = () => {
      if (!isDesktop) onClose();
    };

    const go = (path: string, state?: any) => {
      setMenuOpen(false);
      navigate(path, state ? { state } : undefined);
      closeOnMobile();
    };

    const handleNewChat = () => {
      if (location.pathname === '/chat') {
        window.dispatchEvent(new CustomEvent('triggerNewChat'));
      } else {
        navigate('/chat', { state: { forceNewConversation: true } });
      }
      closeOnMobile();
    };

    const handleDeleteConversation = async (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation();

      if (confirmingId !== conversationId) {
        // First click arms the confirm state; the second deletes. Avoids a
        // native confirm() popup.
        setConfirmingId(conversationId);
        return;
      }

      setConfirmingId(null);
      setDeletingId(conversationId);

      const previousConversations = conversations;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      try {
        const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
          method: 'DELETE',
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to delete conversation (${response.status})`);
        }

        // If the open conversation was deleted, back out to a fresh chat.
        if (location.state?.conversationId === conversationId) {
          navigate('/chat', { state: { forceNewConversation: true } });
        }

        window.dispatchEvent(new CustomEvent('conversationsUpdated'));
      } catch (err) {
        console.error('Error deleting conversation:', err);
        setConversations(previousConversations);
      } finally {
        setDeletingId(null);
      }
    };

    const shortcuts = [
      {
        icon: FiClipboard,
        label: 'Career Assessment',
        isActive: location.pathname.startsWith('/assessment'),
        action: () => go('/assessment'),
      },
      {
        icon: FiStar,
        label: 'Career Coach',
        isActive: false,
        action: () =>
          // Opens a fresh chat where Cerkyl asks the first question.
          go('/chat', { forceNewConversation: true, forceCoachMode: true }),
      },
      {
        icon: FiShoppingCart,
        label: 'Buy Forms',
        isActive: location.pathname.startsWith('/forms'),
        action: () => go('/forms'),
      },
    ];

    const accountMenu = [
      { icon: FiUser, label: 'Profile', path: '/profile', authOnly: true },
      { icon: FiBell, label: 'Notifications', path: '/notifications' },
      { icon: FiFileText, label: 'Transactions', path: '/transactions', authOnly: true },
      { icon: FiSettings, label: 'Settings', path: '/settings' },
      { icon: FiHelpCircle, label: 'Help & Support', path: '/help-support' },
      { icon: FiInfo, label: 'About CERKYL', path: '/about' },
    ].filter((item) => loggedIn || !item.authOnly);

    const activeConversationId = location.pathname === '/chat' ? location.state?.conversationId : null;

    const rowHover = dark ? 'hover:bg-[#1e2329]' : 'hover:bg-gray-200';
    const mutedText = dark ? 'text-gray-500' : 'text-gray-400';
    const sectionLabel = `text-xs font-semibold tracking-wide ${dark ? 'text-gray-500' : 'text-gray-500'}`;
    const displayName = isGuest || !loggedIn ? 'Guest' : user?.name || 'User';

    const renderChats = () => {
      if (!isOpen) return null;

      if (loading) {
        return <div className={`px-2.5 text-sm ${mutedText}`}>Loading...</div>;
      }

      if (!loggedIn && conversations.length === 0) {
        return (
          <div
            className={`mx-1 p-3 rounded-xl text-sm whitespace-normal ${dark ? 'bg-[#1a1e23] text-gray-400' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            <p className="mb-2">Log in to save your chats and see them here.</p>
            <button
              onClick={() => go('/login')}
              className="text-sm font-semibold text-blue-500 hover:text-blue-400"
            >
              Log in
            </button>
          </div>
        );
      }

      if (conversations.length === 0) {
        return (
          <div className={`px-2.5 text-sm ${mutedText}`}>
            No chats yet
          </div>
        );
      }

      return conversations.map((conv) => {
        const isActive = conv.id === activeConversationId;
        return (
          <div
            key={conv.id}
            className={`relative flex items-center rounded-lg group w-full ${
              isActive ? (dark ? 'bg-[#1e2329]' : 'bg-gray-200') : rowHover
            }`}
            onMouseLeave={() => setConfirmingId((id) => (id === conv.id ? null : id))}
          >
            <button
              onClick={() => go('/chat', { conversationId: conv.id, conversationTitle: conv.title })}
              disabled={deletingId === conv.id}
              title={conv.title}
              className={`flex-1 min-w-0 pl-2.5 pr-1 py-2 text-left text-sm truncate transition-colors disabled:opacity-40 ${
                isActive
                  ? dark
                    ? 'text-white'
                    : 'text-gray-900'
                  : dark
                    ? 'text-gray-300 group-hover:text-white'
                    : 'text-gray-700 group-hover:text-gray-900'
              }`}
            >
              {conv.title}
            </button>

            {loggedIn &&
              (confirmingId === conv.id ? (
                <div className="flex items-center shrink-0 pr-1.5 space-x-1">
                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    title="Confirm delete"
                    className="p-1 rounded-md text-red-500 hover:bg-red-500/10"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingId(null);
                    }}
                    title="Cancel"
                    className={`p-1 rounded-md ${dark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-300'}`}
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  disabled={deletingId === conv.id}
                  title="Delete chat"
                  className={`shrink-0 mr-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-40 ${dark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              ))}
          </div>
        );
      });
    };

    // Rendered in a portal: the sidebar clips its overflow and animates with
    // a transform, which would cut off a menu positioned inside it.
    const accountMenuPopup =
      menuOpen &&
      createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            role="menu"
            style={{ left: isDesktop && !isOpen ? 80 : 12 }}
            className={`fixed bottom-20 z-[61] w-64 p-1.5 rounded-xl shadow-2xl border ${dark ? 'bg-[#1e2329] border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
          >
            <div className={`px-3 py-2 text-xs truncate ${mutedText}`}>
              {loggedIn ? user?.email || displayName : 'Guest mode'}
            </div>
            {accountMenu.map((item) => (
              <button
                key={item.path}
                role="menuitem"
                onClick={() => go(item.path)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${dark ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'} ${
                  location.pathname.startsWith(item.path) ? 'font-semibold' : ''
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
            <div className={`my-1 border-t ${dark ? 'border-gray-700' : 'border-gray-200'}`} />
            {loggedIn ? (
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate('/');
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-red-500 transition-colors ${dark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
              >
                <FiLogOut className="w-4 h-4 shrink-0" />
                <span>Log out</span>
              </button>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => go('/signup')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${dark ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'}`}
                >
                  <FiUserPlus className="w-4 h-4 shrink-0" />
                  <span>Create account</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => go('/login')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${dark ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'}`}
                >
                  <FiLogIn className="w-4 h-4 shrink-0" />
                  <span>Log in</span>
                </button>
              </>
            )}
          </motion.div>
        </>,
        document.body
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
          initial={false}
          animate={{
            width: isDesktop ? (isOpen ? 280 : 72) : 280,
            x: !isDesktop && !isOpen ? -300 : 0,
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`${isDesktop ? 'relative' : 'fixed'} left-0 top-0 h-full shadow-2xl z-50 flex flex-col shrink-0 transition-colors duration-200 ${dark ? 'bg-[#13161a] border-gray-800' : 'bg-gray-50 border-gray-200'} border-r overflow-hidden whitespace-nowrap`}
        >
          {/* Header */}
          <div
            className={`px-4 flex items-center h-[64px] shrink-0 ${isOpen ? 'justify-between' : 'justify-center'}`}
          >
            {isOpen ? (
              <>
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => go('/')}>
                  <img src="/cerkyl.svg" alt="CERKYL" className="w-8 h-8 object-contain" />
                  <span
                    className={`text-xl font-bold tracking-wide ${dark ? 'text-white' : 'text-gray-900'}`}
                  >
                    CERKYL
                  </span>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close sidebar"
                  title="Close sidebar"
                  className={`p-2 rounded-lg transition-colors ${dark ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
                >
                  {isDesktop ? <FiMenu className="w-5 h-5" /> : <FiX className="w-5 h-5" />}
                </button>
              </>
            ) : (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent(toggleEvent))}
                aria-label="Open sidebar"
                title="Open sidebar"
                className={`p-2 rounded-lg transition-colors ${dark ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-black'}`}
              >
                <FiMenu className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* New chat and shortcuts */}
          <div className={`${isOpen ? 'px-3' : 'px-2 flex flex-col items-center'} pb-2 space-y-1 shrink-0`}>
            <button
              onClick={handleNewChat}
              title={!isOpen ? 'New Chat' : undefined}
              className={`${isOpen ? 'w-full px-2.5' : 'w-10 justify-center'} flex items-center space-x-3 py-2 rounded-lg font-medium text-sm transition-colors ${dark ? 'text-white hover:bg-[#1e2329]' : 'text-gray-900 hover:bg-gray-200'}`}
            >
              <span className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                <FiPlus className="w-4 h-4" />
              </span>
              {isOpen && <span>New Chat</span>}
            </button>

            {shortcuts.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                title={!isOpen ? item.label : undefined}
                className={`${isOpen ? 'w-full px-2.5' : 'w-10 justify-center'} flex items-center space-x-3 py-2 rounded-lg text-sm transition-colors ${
                  item.isActive
                    ? dark
                      ? 'bg-[#1e2329] text-white'
                      : 'bg-gray-200 text-gray-900'
                    : dark
                      ? 'text-gray-300 hover:bg-[#1e2329] hover:text-white'
                      : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4" />
                </span>
                {isOpen && <span>{item.label}</span>}
              </button>
            ))}
          </div>

          {/* Chats */}
          <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-hide ${isOpen ? 'px-3' : 'px-2'} pt-3 pb-4`}>
            {isOpen ? (
              <>
                <div className="flex items-center justify-between px-2.5 mb-1.5">
                  <h3 className={sectionLabel}>Your chats</h3>
                </div>
                <div className="space-y-0.5">{renderChats()}</div>
              </>
            ) : (
              <div className="flex justify-center">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent(toggleEvent))}
                  title="Your chats"
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${dark ? 'text-gray-400 hover:bg-[#1e2329] hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'}`}
                >
                  <FiMessageCircle className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Account */}
          <div className={`p-2 border-t shrink-0 ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={!isOpen ? displayName : undefined}
              className={`w-full flex items-center rounded-lg p-2 transition-colors ${isOpen ? 'space-x-3' : 'justify-center'} ${rowHover}`}
            >
              <div
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center border ${dark ? 'bg-[#1e2329] border-gray-700' : 'bg-white shadow-sm border-gray-200'}`}
              >
                <FiUser className={`w-4 h-4 ${dark ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              {isOpen && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <h4 className={`font-semibold text-sm truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                      {displayName}
                    </h4>
                    <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {loggedIn ? 'Free Plan' : 'Limited access'}
                    </p>
                  </div>
                  <FiChevronUp
                    className={`w-4 h-4 shrink-0 transition-transform ${menuOpen ? '' : 'rotate-180'} ${mutedText}`}
                  />
                </>
              )}
            </button>
          </div>
        </motion.div>

        {accountMenuPopup}
      </>
    );
  }
);

ChatSidebar.displayName = 'ChatSidebar';

export default ChatSidebar;
