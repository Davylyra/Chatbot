/**
 * Zustand Store - Global State Management
 *
 * This is the central state management system for the Glinax Chatbot application.
 * It uses Zustand for lightweight, type-safe state management with persistence.
 *
 * Features:
 * - User authentication state
 * - Chat conversations and messages
 * - University data management
 * - Forms and transactions
 * - Theme and configuration
 * - Local storage persistence
 * - DevTools integration
 *
 * Integration Notes:
 * - Ready for backend API integration
 * - Mock data can be replaced with real API calls
 * - Persistent storage for user sessions
 * - Type-safe state management
 *
 * Backend Integration Points:
 * - Replace mock data with real API calls
 * - Add real-time data synchronization
 * - Implement optimistic updates
 * - Add error handling and retry logic
 * - Integrate with WebSocket for real-time chat
 *
 * Store Structure:
 * - User: Authentication and profile data
 * - Chat: Messages and conversations
 * - Universities: University data and search
 * - Forms: Application forms and purchases
 * - Transactions: Payment and purchase history
 * - UI: Theme, loading states, and configuration
 *
 * Dependencies:
 * - Zustand: State management library
 * - DevTools: Development debugging
 * - Persist: Local storage persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { UNIVERSITIES_DATA, MOCK_TRANSACTIONS } from '../data/constants';
import type { Notification } from '../types';

// Type definitions for the application state
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  createdAt: string;
  location?: string;
  bio?: string;
  interests?: string[];
  preferredUniversities?: string[];
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  conversationId: string;
  universityContext?: string;
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
  }>;
  sources?: any[];
  confidence?: number;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  universityContext?: string;
  unreadCount: number;
}

export interface UniversityForm {
  id: string;
  universityName: string;
  fullName: string;
  formPrice: number | string; // Support both for backward compatibility
  buyPrice?: string; // Optional for backward compatibility
  currency?: string;
  deadline: string;
  isAvailable: boolean;
  logo?: string;
  description?: string;
  // New dynamic fields
  status?: 'available' | 'expired' | 'not_yet_open' | 'sold_out';
  daysUntilDeadline?: number;
  lastUpdated?: string;
}

export interface Transaction {
  id: string;
  universityName: string;
  fullName: string;
  type: string;
  date: string;
  time: string;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: string;
  amount: string;
  currency: string;
  reference: string;
}

// Application state interface
interface AppState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  
  // Chat state
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: ChatMessage[];
  
  // Forms state
  forms: UniversityForm[];
  purchasedForms: UniversityForm[];
  
  // Transactions state
  transactions: Transaction[];
  
  // Notifications state
  notifications: Notification[];
  
  // UI state
  sidebarOpen: boolean;
  loading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setGuest: (isGuest: boolean) => void;
  
  // Chat actions
  addConversation: (conversation: Conversation) => void;
  createConversation: (title: string) => string;
  setCurrentConversation: (conversation: Conversation | null) => void;
  addMessage: (message: ChatMessage) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  getConversationMessages: (conversationId: string) => ChatMessage[];
  saveCurrentConversation: () => Promise<void>;
  startNewConversation: (title?: string) => string;
  clearCurrentMessages: () => void;
  
  // Forms actions
  loadForms: () => void;
  purchaseForm: (formId: string) => Promise<void>;
  loadPurchasedForms: (userId: string) => void;
  
  // Transactions actions
  loadTransactions: (userId: string) => void;
  addTransaction: (transaction: Transaction) => void;
  
  // Notifications actions
  loadNotifications: (userId: string) => void;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: (userId: string) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  
  // UI actions
  setSidebarOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Utility actions
  clearError: () => void;
  reset: () => void;
}

// Create the Zustand store with persistence and devtools
export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        isAuthenticated: false,
        isGuest: false,
        conversations: [],
        currentConversation: null,
        messages: [],
        forms: [],
        purchasedForms: [],
        transactions: [],
        notifications: [],
        sidebarOpen: false,
        loading: false,
        error: null,

        // User actions
        setUser: (user) => set({ 
          user, 
          isAuthenticated: !!user,
          // Don't reset guest mode here - let setGuest handle it
        }, false, 'setUser'),
        setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }, false, 'setAuthenticated'),
        setGuest: (isGuest) => set({ isGuest }, false, 'setGuest'),

        // Chat actions
        addConversation: (conversation) => 
          set((state) => ({ 
            conversations: [conversation, ...state.conversations] 
          }), false, 'addConversation'),

        createConversation: (title) => {
          const conversationId = `conv_${Date.now()}`;
          const newConversation: Conversation = {
            id: conversationId,
            title,
            lastMessage: '',
            timestamp: new Date().toISOString(),
            messageCount: 0,
            unreadCount: 0
          };
          
          set((state) => ({ 
            conversations: [newConversation, ...state.conversations] 
          }), false, 'createConversation');
          
          return conversationId;
        },

        setCurrentConversation: (conversation) => 
          set({ currentConversation: conversation }, false, 'setCurrentConversation'),

        addMessage: (message) => 
          set((state) => ({ 
            messages: [...state.messages, message] 
          }), false, 'addMessage'),

        updateConversation: (id, updates) =>
          set((state) => ({
            conversations: state.conversations.map(conv =>
              conv.id === id ? { ...conv, ...updates } : conv
            )
          }), false, 'updateConversation'),

        deleteConversation: (id) =>
          set((state) => ({
            conversations: state.conversations.filter(conv => conv.id !== id),
            currentConversation: state.currentConversation?.id === id ? null : state.currentConversation
          }), false, 'deleteConversation'),

        getConversationMessages: (conversationId) => {
          const state = get();
          return state.messages.filter(msg => msg.conversationId === conversationId);
        },

        saveCurrentConversation: async () => {
          const state = get();
          if (!state.currentConversation) return;

          try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const conversationMessages = state.messages.filter(
              msg => msg.conversationId === state.currentConversation!.id
            );

            // Only save if there are messages
            if (conversationMessages.length === 0) return;

            // Update conversation with last message
            const lastMessage = conversationMessages[conversationMessages.length - 1];
            const updatedConversation = {
              ...state.currentConversation,
              lastMessage: lastMessage.text,
              messageCount: conversationMessages.length,
              timestamp: new Date().toISOString()
            };

            // FIXED: Get user ID from localStorage or use demo_user
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const userId = user?.id || 'demo_user';
            
            // FIXED: Get token (optional for save endpoint)
            const token = localStorage.getItem('token');
            
            // FIXED: Build headers with optional auth
            const headers: HeadersInit = {
              'Content-Type': 'application/json'
            };
            
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }

            // Save conversation and messages to backend
            const response = await fetch(`${API_BASE_URL}/chat/save-conversation`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                conversation: updatedConversation,
                messages: conversationMessages,
                userId: userId
              })
            });

            if (response.ok) {
              const result = await response.json();
              console.log('✅ FIXED: Conversation saved to MongoDB');
              
              // Update conversation with LLM-generated title from backend
              if (result.title && result.title !== updatedConversation.title) {
                console.log(`🏷️ Updating conversation title: "${updatedConversation.title}" → "${result.title}" (method: ${result.title_method})`);
                updatedConversation.title = result.title;
              }
              
              // Update local conversation
              set((state) => ({
                conversations: state.conversations.map(conv =>
                  conv.id === updatedConversation.id ? updatedConversation : conv
                )
              }), false, 'updateSavedConversation');
            } else {
              console.warn('⚠️ FIXED: Failed to save to backend, keeping local copy');
            }
          } catch (error) {
            console.warn('⚠️ FIXED: Backend unavailable, conversation kept locally:', error);
          }
        },

        startNewConversation: () => {
          const state = get();
          
          console.log('🧹 STORE: Starting new conversation - saving and clearing ALL messages');
          
          // Save current conversation if it has messages (but don't block)
          if (state.currentConversation && state.messages.some(m => m.conversationId === state.currentConversation!.id)) {
            console.log('💾 STORE: Saving current conversation before creating new one');
            state.saveCurrentConversation().catch(err => console.warn('Failed to save conversation:', err));
          }

          // Create new conversation with unique ID
          const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Use simple placeholder - LLM will generate proper title on save
          const newConversation: Conversation = {
            id: conversationId,
            title: 'New Conversation', // Simple placeholder, will be replaced by LLM on save
            lastMessage: '',
            timestamp: new Date().toISOString(),
            messageCount: 0,
            unreadCount: 0
          };

          // ABSOLUTE CRITICAL FIX: Force complete message clearing - NO message leakage
          // This COMPLETELY resets the messages array, ensuring NO assessment/university messages carry over
          set(() => ({
            messages: [], // ABSOLUTE CLEAR - removes ALL messages from ALL conversations
            conversations: [newConversation, ...state.conversations],
            currentConversation: newConversation,
            loading: false,
            error: null
          }), false, 'startNewConversation_ABSOLUTE_CLEAR');
          
          console.log('✅ STORE: New conversation created with ABSOLUTELY CLEARED state', conversationId);
          console.log('🧹 STORE: All previous messages cleared - assessment/university messages will NOT leak');
          
          return conversationId;
        },

        clearCurrentMessages: () => {
          const state = get();
          if (state.currentConversation) {
            set((prevState) => ({
              messages: prevState.messages.filter(msg => msg.conversationId !== state.currentConversation!.id)
            }), false, 'clearCurrentMessages');
          }
        },

        // Forms actions - Load instantly
        loadForms: async () => {
          try {
            // Try to get cached data first for immediate display
            const cachedForms = localStorage.getItem('glinax-forms-cache');
            if (cachedForms) {
              const { data } = JSON.parse(cachedForms);
              set({ forms: data }, false, 'loadForms/cached');
            }
            
            // Import and use the new Forms API
            const { FormsApiService } = await import('../services/formsApi');
            const response = await FormsApiService.getForms();
            
            if (response.success && response.data) {
              set({ 
                forms: response.data
              }, false, 'loadForms/success');
            } else {
              throw new Error('Failed to load forms');
            }
          } catch {
            // Failed to load forms - using fallback data
            // Fallback to static data
            set({ 
              forms: UNIVERSITIES_DATA
            }, false, 'loadForms/error');
          }
        },

        purchaseForm: async (formId) => {
          try {
            // TODO: Replace with real API call from services/api.ts
            // const response = await formsApi.purchaseForm(formId, paymentData);
            
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const form = get().forms.find(f => f.id === formId);
            if (form) {
              set((state) => ({
                purchasedForms: [...state.purchasedForms, form]
              }), false, 'purchaseForm/success');
            }
          } catch {
            set({ 
              error: 'Failed to purchase form. Please try again.' 
            }, false, 'purchaseForm/error');
          }
        },

        loadPurchasedForms: (_userId) => {
          // TODO: Replace with real API call from services/api.ts
          // const response = await formsApi.getUserForms(userId);
          
          // Mock data for now
          const mockPurchasedForms = UNIVERSITIES_DATA.slice(0, 2);
          set({ purchasedForms: mockPurchasedForms }, false, 'loadPurchasedForms');
        },

        // Transactions actions
        loadTransactions: (_userId) => {
          // TODO: Replace with real API call from services/api.ts
          // const response = await formsApi.getPaymentHistory(userId);
          
          set({ transactions: MOCK_TRANSACTIONS }, false, 'loadTransactions');
        },

        addTransaction: (transaction) =>
          set((state) => ({
            transactions: [transaction, ...state.transactions]
          }), false, 'addTransaction'),

        // Notifications actions - FIXED: Real API integration with proper date handling
        loadNotifications: async (_userId) => {
          try {
            // VITE_API_BASE_URL already includes /api at the end
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const token = localStorage.getItem('token');
            
            if (!token) {
              console.log('⚠️ No token found, showing empty notifications for demo');
              // Empty notifications for guest users - no mock data
              set({ notifications: [] }, false, 'loadNotifications/guest');
              return;
            }
            
            console.log('🔔 Loading real notifications from API at:', `${API_BASE_URL}/notifications`);
            const response = await fetch(`${API_BASE_URL}/notifications`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                // Token expired, clear it
                localStorage.removeItem('token');
                throw new Error('Authentication expired');
              }
              const errorText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            
            if (data.success && Array.isArray(data.notifications)) {
              const notifications = data.notifications.map((notif: any) => ({
                id: notif.id || notif._id?.toString() || `notif_${Date.now()}`,
                type: notif.type || 'info',
                title: notif.title || '',
                message: notif.message || '',
                // Use createdAt from backend (the actual fetch date), not current date
                timestamp: notif.createdAt || notif.createdAt || new Date().toISOString(),
                isRead: notif.isRead || notif.is_read || false,
                // Support clickable links from backend
                link: notif.link || notif.actionUrl || undefined,
                linkText: notif.linkText || 'Learn more'
              }));
              
              set({ notifications }, false, 'loadNotifications/success');
              console.log(`✅ Loaded ${notifications.length} notifications from API`);
            } else {
              console.error('❌ Invalid response format:', data);
              throw new Error(`Invalid notification data: ${JSON.stringify(data)}`);
            }
          } catch (error) {
            console.error('❌ Failed to load notifications:', error instanceof Error ? error.message : error);
            // On error, show empty notifications - no fallback to mock data
            set({ notifications: [] }, false, 'loadNotifications/error');
          }
        },

        markNotificationAsRead: async (id) => {
          // Optimistically update local state
          set((state) => ({
            notifications: state.notifications.map(notif =>
              notif.id === id ? { ...notif, isRead: true } : notif
            )
          }), false, 'markNotificationAsRead');
          
          try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const token = localStorage.getItem('token');
            
            if (!token) {
              console.log('⚠️ No token, notification will only be marked locally');
              return;
            }
            
            // Call backend to mark as read and trigger replacement
            const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log(`✅ Notification ${id} marked as read on backend`);
            
            // Backend will delete after 2 seconds and emit socket event
            // Frontend socket listener will handle removal and replacement
          } catch (error) {
            console.error('❌ Failed to mark notification as read on backend:', error);
            // Keep local optimistic update even if API fails
          }
        },

        markAllNotificationsAsRead: async (_userId) => {
          try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const token = localStorage.getItem('token');
            
            if (!token) {
              console.log('⚠️ No token, skipping notification API call');
              // Just update local state for guest users
              set((state) => ({
                notifications: state.notifications.map(notif => ({ ...notif, isRead: true }))
              }), false, 'markAllNotificationsAsRead/guest');
              return;
            }
            
            console.log('📝 Marking all notifications as read via API...');
            const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Update local state
            set((state) => ({
              notifications: state.notifications.map(notif => ({ ...notif, isRead: true }))
            }), false, 'markAllNotificationsAsRead/success');
            
            console.log('✅ All notifications marked as read');
          } catch (error) {
            console.error('❌ Failed to mark notifications as read:', error);
            // Still update local state even if API fails
            set((state) => ({
              notifications: state.notifications.map(notif => ({ ...notif, isRead: true }))
            }), false, 'markAllNotificationsAsRead/fallback');
          }
        },

        addNotification: (notification) => {
          const newNotification: Notification = {
            ...notification,
            id: `notif_${Date.now()}`
          };
          
          set((state) => ({
            notifications: [newNotification, ...state.notifications]
          }), false, 'addNotification');
        },

        // UI actions
        setSidebarOpen: (open) => set({ sidebarOpen: open }, false, 'setSidebarOpen'),
        setLoading: (loading) => set({ loading }, false, 'setLoading'),
        setError: (error) => set({ error }, false, 'setError'),

        // Utility actions
        clearError: () => set({ error: null }, false, 'clearError'),
        
        reset: () => set({
          user: null,
          isAuthenticated: false,
          isGuest: false,
          conversations: [],
          currentConversation: null,
          messages: [],
          forms: [],
          purchasedForms: [],
          transactions: [],
          notifications: [],
          sidebarOpen: false,
          loading: false,
          error: null
        }, false, 'reset')
      }),
      {
        name: 'glinax-store', // Local storage key
        partialize: (state) => ({
          // Only persist essential data
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          isGuest: state.isGuest,
          conversations: state.conversations,
          purchasedForms: state.purchasedForms,
          transactions: state.transactions
        })
      }
    ),
    {
      name: 'glinax-store' // DevTools name
    }
  )
);

// Selectors for optimized re-renders
export const useUser = () => useAppStore(state => state.user);
export const useIsAuthenticated = () => useAppStore(state => state.isAuthenticated);
export const useIsGuest = () => useAppStore(state => state.isGuest);
export const useConversations = () => useAppStore(state => state.conversations);
export const useCurrentConversation = () => useAppStore(state => state.currentConversation);
export const useMessages = () => useAppStore(state => state.messages);
export const useForms = () => useAppStore(state => state.forms);
export const usePurchasedForms = () => useAppStore(state => state.purchasedForms);
export const useTransactions = () => useAppStore(state => state.transactions);
export const useNotifications = () => useAppStore(state => state.notifications);
export const useSidebarOpen = () => useAppStore(state => state.sidebarOpen);
export const useLoading = () => useAppStore(state => state.loading);
export const useError = () => useAppStore(state => state.error);
