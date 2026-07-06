import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageCircle, FiClock, FiRefreshCw, FiTrash2, FiSearch, FiX } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store';
import ChatBubble from './ChatBubble';
import GuestLimitationModal from './GuestLimitationModal';
import { getMarkdownPreview } from '../utils/markdownUtils';

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  universityContext?: string;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  conversationId: string;
  sources?: any[];
  confidence?: number;
  attachments?: any[];
}

const conversationsCache = {
  data: null as Conversation[] | null,
  timestamp: 0,
  ttl: 5 * 60 * 1000, // 5 minutes
  isValid: function () {
    return this.data && Date.now() - this.timestamp < this.ttl;
  },
  set: function (data: Conversation[]) {
    this.data = data;
    this.timestamp = Date.now();
  },
  clear: function () {
    this.data = null;
    this.timestamp = 0;
  },
};

const ConversationHistory: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { isGuest } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleGuestModalClose = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest',
      });
    }
  }, []);

  if (isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GuestLimitationModal
          isOpen={true}
          onClose={handleGuestModalClose}
          feature="Chat History"
          description="Access your complete chat history and continue previous conversations."
          benefits={[
            'View all your previous chats',
            'Continue interrupted conversations',
            'Search through chat history',
            'Export chat transcripts',
          ]}
        />
      </div>
    );
  }

  useEffect(() => {
    if (messages.length > 0 && !loadingMessages) {
      const timer = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, loadingMessages, scrollToBottom]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const loadConversations = async (forceRefresh = false) => {
    try {
      if (!forceRefresh && conversationsCache.isValid()) {
        setConversations(conversationsCache.data!);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');

      const demoEndpoint = `${API_BASE_URL}/chat/conversations-demo?limit=20`;
      const authEndpoint = `${API_BASE_URL}/chat/conversations?limit=20`;

      let response: Response;
      let conversationPayload: any;

      try {
        if (token) {
          response = await fetch(authEndpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            conversationPayload = await response.json();
          } else if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            throw new Error('Auth failed');
          } else {
            throw new Error(`Auth endpoint failed: ${response.status}`);
          }
        } else {
          throw new Error('No token');
        }
      } catch (authError) {
        response = await fetch(demoEndpoint, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Demo endpoint failed: ${response.status}`);
        }

        conversationPayload = await response.json();
      }

      const conversationsList = conversationPayload.conversations || conversationPayload.data || [];
      if (!Array.isArray(conversationsList)) {
        console.warn('Invalid data format:', conversationPayload);
        setConversations([]);
        setError('No conversations found');
        return;
      }

      const validConversations = conversationsList
        .filter((conv: any) => conv && (conv.id || conv._id))
        .map(
          (conv: any): Conversation => ({
            id: conv.id || conv._id?.toString() || String(conv._id),
            title: conv.title || 'New Conversation',
            lastMessage: conv.lastMessage || conv.last_message || '',
            timestamp:
              conv.timestamp || conv.updated_at || conv.created_at || new Date().toISOString(),
            messageCount: Number(conv.messageCount || conv.message_count || 0),
            universityContext: conv.universityContext || conv.university_context,
          })
        )
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      conversationsCache.set(validConversations);
      setConversations(validConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setError('Unable to load conversation history');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      setError(null);

      const token = localStorage.getItem('token');

      const demoEndpoint = `${API_BASE_URL}/chat/conversations-demo/${conversationId}/messages?limit=100`;
      const authEndpoint = `${API_BASE_URL}/chat/conversations/${conversationId}/messages?limit=100`;

      let response: Response;
      let messagesPayload: any;

      try {
        if (token) {
          response = await fetch(authEndpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            messagesPayload = await response.json();
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Auth failed');
          } else {
            throw new Error(`Auth endpoint failed: ${response.status}`);
          }
        } else {
          throw new Error('No token');
        }
      } catch (authError) {
        response = await fetch(demoEndpoint, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Demo endpoint failed: ${response.status}`);
        }

        messagesPayload = await response.json();
      }

      const msgArray = Array.isArray(messagesPayload.messages)
        ? messagesPayload.messages
        : Array.isArray(messagesPayload.data)
          ? messagesPayload.data
          : Array.isArray(messagesPayload)
            ? messagesPayload
            : [];

      if (!Array.isArray(msgArray)) {
        console.warn('Invalid message data format');
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      const validMessages = msgArray
        .filter((msg: any) => msg && (msg.message || msg.text) && (msg.id || msg._id))
        .map((msg: any, index: number) => {
          const ts = msg.timestamp || msg.created_at;
          const parsedTs = parseDate(ts) || new Date();
          return {
            id: msg.id || msg._id?.toString() || `msg_${Date.now()}_${index}`,
            text: msg.message ?? msg.text ?? '',
            isUser: typeof msg.isUser === 'boolean' ? msg.isUser : !msg.is_bot,
            timestamp: parsedTs.toISOString(),
            conversationId: msg.conversation_id || conversationId,
            sources: msg.sources || [],
            confidence: Number(msg.confidence || 0),
            attachments: msg.attachments || [],
          } as Message;
        });

      const dedupedMessages: Message[] = [];
      const seenSignatures = new Set<string>();

      for (const msg of validMessages) {
        const timestampSec = Math.floor(parseDate(msg.timestamp)?.getTime() ?? 0 / 1000);
        const signature = `${msg.isUser}|${msg.text}|${timestampSec}`;

        if (!seenSignatures.has(signature)) {
          seenSignatures.add(signature);
          dedupedMessages.push(msg);
        }
      }

      setMessages(dedupedMessages);

      setSelectedConversation((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        const last = dedupedMessages[dedupedMessages.length - 1];
        return {
          ...prev,
          lastMessage: last ? last.text.slice(0, 120) : prev.lastMessage,
          messageCount: dedupedMessages.length,
          timestamp: last ? last.timestamp : prev.timestamp,
        };
      });
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Unable to load conversation messages. Please try again.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadConversations(false);
  }, []);

  const handleConversationSelect = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    await loadMessages(conversation.id);
  };

  const handleContinueConversation = (conversation: Conversation) => {
    navigate('/chat', {
      state: {
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        universityContext: conversation.universityContext
          ? {
              name: conversation.universityContext,
              fullName: conversation.universityContext,
            }
          : undefined,
      },
    });
  };

  const handleDeleteConversation = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(conversation);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    const conversation = conversationToDelete;

    const previousConversations = [...conversations];
    const previousSelected = selectedConversation;
    const previousMessages = [...messages];

    try {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== conversation.id);
        return updated;
      });

      conversationsCache.clear();

      if (selectedConversation?.id === conversation.id) {
        setSelectedConversation(null);
        setMessages([]);
      }

      const store = useAppStore?.getState?.();
      if (store?.deleteConversation) {
        store.deleteConversation(conversation.id);
      }

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/chat/${conversation.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });

      if (response.status === 401 && !token) {
        setConversations(previousConversations);
        setSelectedConversation(previousSelected);
        setMessages(previousMessages);
        setError('Demo users cannot delete conversations. Please log in for full features.');
        setTimeout(() => setError(null), 3000);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.status}`);
      }

      await response.json();
    } catch (error) {
      console.error('Error deleting conversation:', error);

      setConversations(previousConversations);
      setSelectedConversation(previousSelected);
      setMessages(previousMessages);

      setError('Failed to delete conversation. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setConversationToDelete(null);
    }
  };

  const parseDate = (ts?: string | Date | null): Date | null => {
    if (!ts) return null;
    const d = ts instanceof Date ? ts : new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations;
    }

    const query = searchQuery.toLowerCase().trim();
    return conversations.filter((conv) => {
      const titleMatch = conv.title?.toLowerCase().includes(query);
      const messageMatch = conv.lastMessage?.toLowerCase().includes(query);
      const universityMatch = conv.universityContext?.toLowerCase().includes(query);

      return titleMatch || messageMatch || universityMatch;
    });
  }, [conversations, searchQuery]);

  const formatTimestamp = (timestamp: string) => {
    const date = parseDate(timestamp);
    if (!date) return 'Unknown';
    const now = new Date();
    const isToday = now.toDateString() === date.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.toDateString() === date.toDateString();

    const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) {
      return `Today - ${timeString}`;
    }
    if (isYesterday) {
      return `Yesterday - ${timeString}`;
    }
    return `${date.toLocaleDateString()} - ${timeString}`;
  };

  if (isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GuestLimitationModal
          isOpen={true}
          onClose={handleGuestModalClose}
          feature="Chat History"
          description="Access your complete chat history and continue previous conversations."
          benefits={[
            'View all your previous chats',
            'Continue interrupted conversations',
            'Search through chat history',
            'Export chat transcripts',
          ]}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex">
        <div
          className={`w-full md:w-1/3 border-r flex flex-col ${selectedConversation ? 'hidden md:flex' : 'flex'} ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div
            className={`p-4 border-b ${
              theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                Conversation History
              </h3>
            </div>
            {/* Search Bar Skeleton */}
            <div
              className={`w-full h-10 rounded-lg animate-pulse ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`p-3 rounded-lg animate-pulse ${
                  theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`h-4 rounded w-2/3 ${
                      theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`}
                  />
                  <div
                    className={`h-3 rounded w-16 ${
                      theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`}
                  />
                </div>
                <div
                  className={`h-3 rounded w-full my-2 ${
                    theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                />
                <div
                  className={`h-3 rounded w-4/5 ${
                    theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="inline-block"
            >
              <FiRefreshCw className="w-8 h-8" />
            </motion.div>
            <p className="mt-3">Loading conversations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center p-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
        <p className="text-red-500 mb-4">{error}</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => loadConversations(true)} // Force refresh on error retry
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200"
        >
          Try Again
        </motion.button>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <div
        className={`w-full md:w-1/3 border-r flex flex-col ${selectedConversation ? 'hidden md:flex' : 'flex'} ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}
      >
        <div
          className={`p-4 border-b ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              Conversation History
            </h3>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => loadConversations(true)} // Force refresh
              className={`p-2 rounded-lg ${
                theme === 'dark'
                  ? 'hover:bg-gray-700 text-gray-400'
                  : 'hover:bg-gray-200 text-gray-500'
              }`}
              title="Refresh conversations"
            >
              <FiRefreshCw className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="relative">
            <FiSearch
              className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-10 py-2 rounded-lg text-sm transition-colors ${
                theme === 'dark'
                  ? 'bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:border-primary-500'
                  : 'bg-white text-gray-800 placeholder-gray-500 border border-gray-300 focus:border-primary-500'
              } focus:outline-none focus:ring-2 focus:ring-primary-500/20`}
            />
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSearchQuery('')}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full ${
                  theme === 'dark'
                    ? 'hover:bg-gray-600 text-gray-400'
                    : 'hover:bg-gray-200 text-gray-500'
                }`}
                title="Clear search"
              >
                <FiX className="w-3 h-3" />
              </motion.button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
          {conversations.length === 0 ? (
            <div
              className={`text-center p-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              <FiMessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No conversation history yet</p>
              <p className="text-sm mt-2">Start chatting to see your conversations here!</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div
              className={`text-center p-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              <FiSearch className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No conversations found</p>
              <p className="text-sm mt-2">Try a different search term</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                Clear Search
              </motion.button>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredConversations.map((conversation, index) => (
                <motion.div
                  key={conversation.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleConversationSelect(conversation)}
                  className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedConversation?.id === conversation.id
                      ? theme === 'dark'
                        ? 'bg-primary-600/20 border border-primary-500'
                        : 'bg-primary-100 border border-primary-300'
                      : theme === 'dark'
                        ? 'hover:bg-gray-700/50'
                        : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4
                      className={`font-medium text-sm truncate ${
                        theme === 'dark' ? 'text-white' : 'text-gray-800'
                      }`}
                    >
                      {conversation.title && conversation.title !== 'Untitled'
                        ? conversation.title
                        : conversation.lastMessage
                          ? conversation.lastMessage.slice(0, 60)
                          : 'New Conversation'}
                    </h4>
                    <span
                      className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                    >
                      {formatTimestamp(conversation.timestamp)}
                    </span>
                  </div>

                  {conversation.universityContext && (
                    <div
                      className={`text-xs px-2 py-1 rounded-full mb-2 inline-block ${
                        theme === 'dark'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      {conversation.universityContext}
                    </div>
                  )}

                  <p
                    className={`text-xs truncate ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    {conversation.lastMessage
                      ? getMarkdownPreview(conversation.lastMessage, 80)
                      : 'No messages yet'}
                  </p>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                      <FiClock
                        className={`w-3 h-3 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      />
                      <span
                        className={`text-xs ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        {conversation.messageCount} messages
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => handleDeleteConversation(conversation, e)}
                        className={`p-1.5 rounded-md transition-colors duration-200 ${
                          theme === 'dark'
                            ? 'hover:bg-red-900/30 text-red-400 hover:text-red-300'
                            : 'hover:bg-red-100 text-red-600 hover:text-red-700'
                        }`}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContinueConversation(conversation);
                        }}
                        className="text-xs px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors duration-200"
                      ></motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex-1 flex flex-col w-full ${selectedConversation ? 'flex' : 'hidden md:flex'}`}
      >
        {selectedConversation ? (
          <>
            <div
              className={`p-4 border-b flex items-center ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <button
                onClick={() => setSelectedConversation(null)}
                className={`md:hidden p-2 mr-3 rounded-full flex-shrink-0 ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
              >
                <FiX className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-semibold truncate ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}
                >
                  {selectedConversation.title}
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {selectedConversation.messageCount} messages • Last active{' '}
                  {formatTimestamp(selectedConversation.timestamp)}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
              {loadingMessages ? (
                <div
                  className={`flex items-center justify-center h-32 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <FiRefreshCw className="w-6 h-6" />
                  </motion.div>
                  <span className="ml-3">Loading messages...</span>
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((message, index) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                    >
                      {/* Use ChatBubble component for professional formatting with markdown support */}
                      <ChatBubble
                        message={{
                          ...message,
                          conversationId: message.conversationId || selectedConversation?.id || '',
                        }}
                      />
                    </motion.div>
                  ))}
                  <div ref={messagesEndRef} />
                </AnimatePresence>
              )}
            </div>

            <div
              className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleContinueConversation(selectedConversation)}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-lg transition-colors duration-200"
              >
                Continue This Conversation
              </motion.button>
            </div>
          </>
        ) : (
          <div
            className={`flex items-center justify-center h-full ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            <div className="text-center">
              <FiMessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
              <p className="text-sm">Choose a conversation from the list to view its messages</p>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {conversationToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm rounded-2xl shadow-xl overflow-hidden ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-white'
              }`}
            >
              <div className="p-5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                    theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                  }`}
                >
                  <FiTrash2 className="w-5 h-5" />
                </div>
                <h3
                  className={`text-lg font-bold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  Delete Conversation?
                </h3>
                <p
                  className={`text-sm mb-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
                >
                  Are you sure you want to delete "{conversationToDelete.title}"? This action cannot
                  be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setConversationToDelete(null)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-500/30"
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConversationHistory;
