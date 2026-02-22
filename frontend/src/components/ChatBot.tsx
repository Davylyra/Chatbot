import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiPaperclip, FiImage, FiFile, FiCamera, FiShoppingCart, FiX, FiUsers, FiMessageCircle } from 'react-icons/fi';
import ChatBubble from './ChatBubble';
import AuthenticationModal from './AuthenticationModal';
import { useAppStore } from '../store';
import { useTheme } from '../contexts/ThemeContext';
import { useChat, type EnhancedChatResponse } from '../hooks/useChat';
import { useAuth } from '../contexts/AuthContext';
import { getPersonalizedGreeting } from '../utils/greetings';
import { generateConversationTitle, shouldUpdateConversationTitle } from '../utils/conversationTitles';

interface ChatBotProps {
  universityContext?: {
    name: string;
    fullName: string;
    logo?: string;
  };
  assessmentData?: {
    bestSubject: string[];
    shsProgram: string;
    wassceGrade: string;
    interests: string[];
    careerGoals: string;
    preferredLocation: string;
  };
  initialMessage?: string;
  forceNewConversation?: boolean;
  userContext?: {
    is_assessment_result?: boolean;
    assessment_data?: any;
  };
  // resume an existing conversation
  resumeConversationId?: string;
  resumeConversationTitle?: string;
}

const ChatBot: React.FC<ChatBotProps> = memo(({ universityContext: propUniversityContext, assessmentData: propAssessmentData, initialMessage: propInitialMessage, forceNewConversation = false, resumeConversationId, resumeConversationTitle }) => {
  const {
    currentConversation,
    addMessage,
    addConversation,
    createConversation,
    setCurrentConversation,
    startNewConversation,
    saveCurrentConversation
  } = useAppStore();
  const { sendMessage: sendChatMessage } = useChat();
  const { user, isGuest, isAuthenticated } = useAuth();
  const location = useLocation();
  
  // Raw data from location/props
  const rawUniversityContext = location.state?.universityContext || propUniversityContext;
  const rawAssessmentData = location.state?.assessmentData || propAssessmentData;
  const rawInitialMessage = location.state?.initialMessage || propInitialMessage;
  const locationForceNewConversation = location.state?.forceNewConversation || forceNewConversation;

  // Session context suppression to prevent leakage into new chats
  const [suppressContext, setSuppressContext] = useState(false);

  // Effective context used by this component
  const universityContext = suppressContext ? undefined : rawUniversityContext;
  const assessmentData = suppressContext ? undefined : rawAssessmentData;
  const initialMessage = suppressContext ? undefined : rawInitialMessage;

  // Stabilize functions to prevent infinite re-renders
  const stableAddMessage = useCallback(addMessage, [addMessage]);
  const stableCreateConversation = useCallback(createConversation, [createConversation]);
  const stableSetCurrentConversation = useCallback(setCurrentConversation, [setCurrentConversation]);
  const stableSaveCurrentConversation = useCallback(saveCurrentConversation, [saveCurrentConversation]);
  const stableSendChatMessage = useCallback(sendChatMessage, [sendChatMessage]);

  // Add state to prevent duplicate message processing
  const [processedMessages, setProcessedMessages] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showUniversityModal, setShowUniversityModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();


  // 0. Resume existing conversation if passed from navigation
  useEffect(() => {
    const doResume = async () => {
      if (!resumeConversationId) return;

      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        // Create or set the conversation in store immediately
        const conversationTitle = resumeConversationTitle || 'Conversation';
        const resumedConversation = {
          id: resumeConversationId,
          title: conversationTitle,
          lastMessage: '',
          timestamp: new Date().toISOString(),
          messageCount: 0,
          unreadCount: 0,
          universityContext: universityContext?.name,
        } as any;
        const existing = useAppStore.getState().conversations.find(c => c.id === resumeConversationId);
        if (!existing) {
          addConversation(resumedConversation);
        }
        stableSetCurrentConversation(resumedConversation);

        // Fetch messages from backend
        const headers: HeadersInit = { 'Accept': 'application/json' };
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch(`${API_BASE_URL}/chat/conversations/${resumeConversationId}/messages`, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        if (!resp.ok) {
          throw new Error(`Failed to load conversation messages (${resp.status})`);
        }
        const data = await resp.json();
        if (data.success && Array.isArray(data.messages)) {
          // DEDUPLICATION: Check existing messages to prevent duplicates
          const existingMessages = useAppStore.getState().messages.filter(
            m => m.conversationId === resumeConversationId
          );
          const existingIds = new Set(existingMessages.map(m => m.id));
          
          // Map and add only new messages to store
          data.messages.forEach((msg: any) => {
            const messageId = msg.id || `${Date.now()}-${Math.random()}`;
            // Skip if message already exists
            if (existingIds.has(messageId)) {
              console.log(`⏭️ Skipping duplicate message: ${messageId}`);
              return;
            }
            
            const mapped = {
              id: messageId,
              text: msg.text ?? msg.message ?? '',
              isUser: msg.isUser ?? !msg.is_bot,
              timestamp: msg.timestamp || new Date().toISOString(),
              conversationId: msg.conversationId || resumeConversationId,
              sources: msg.sources || [],
              confidence: msg.confidence || 0,
            };
            stableAddMessage(mapped);
          });
          console.log(`Loaded ${data.messages.length} messages, added ${data.messages.length - existingMessages.length} new ones`);
        }
        setIsInitialized(true);
      } catch (e) {
        console.error('Failed to resume conversation:', e);
        // Fall back to normal init
      }
    };

    doResume();
  }, [resumeConversationId, resumeConversationTitle]);
  
  // 1. Initialize conversation ONCE on mount
  useEffect(() => {
    if (isInitialized) return;
    // If resuming an existing conversation, skip auto-creation/welcome
    if (resumeConversationId) {
      return;
    }
    
    console.log('Initializing ChatBot...');
    const { greeting } = getPersonalizedGreeting(user?.name);
    const guestNote = isGuest ? " (You're in guest mode - some features may be limited)" : "";
    
    if (!currentConversation) {
      // Conversation title
      const conversationTitle = 'New Conversation';
      const newConversationId = stableCreateConversation(conversationTitle);
      
      const newConversation = useAppStore.getState().conversations.find(c => c.id === newConversationId);
      if (newConversation) {
        newConversation.universityContext = universityContext?.name;
        stableSetCurrentConversation(newConversation);
      }
      
      // Add welcome message
      let welcomeText = '';
      if (assessmentData) {
        welcomeText = `${greeting}! I can see you've completed your assessment. I'm here to help you understand your results and discuss your university options.${guestNote}`;
      } else if (universityContext) {
        welcomeText = `${greeting}! I'm now focused on ${universityContext.name}. How can I help you with their admissions and information?${guestNote}`;
      } else {
        welcomeText = `${greeting}! I'm here to help you with university admissions in Ghana.${guestNote}`;
      }
      
      const welcomeMessage = {
        id: '1',
        text: welcomeText,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationId: newConversationId,
      };
      
      stableAddMessage(welcomeMessage);
    }
    
    setIsInitialized(true);
  }, []); // Empty dependency array - run ONCE on mount
  
  // 2. Handle force new conversation separately
  useEffect(() => {
    if (!locationForceNewConversation || !isInitialized) return;
    
    console.log('Forcing new conversation from homepage');
    const { greeting } = getPersonalizedGreeting(user?.name);
    
    // Save current conversation if it has messages
    if (currentConversation && currentMessages.length > 0) {
      stableSaveCurrentConversation();
    }
    
    // Clear current messages from UI immediately
    const state = useAppStore.getState();
    if (state.currentConversation) {
      useAppStore.setState((prevState) => ({
        messages: prevState.messages.filter(msg => msg.conversationId !== state.currentConversation!.id)
      }));
    }
    
    // Generate professional title based on context
    const conversationTitle = 'New Conversation';
    const newConversationId = stableCreateConversation(conversationTitle);
    
    const newConversation = useAppStore.getState().conversations.find(c => c.id === newConversationId);
    if (newConversation) {
      // Set university context if provided
      if (universityContext) {
        newConversation.universityContext = universityContext.name;
      }
      stableSetCurrentConversation(newConversation);
    }
    
    // Create appropriate welcome message
    let welcomeText = '';
    if (universityContext) {
      welcomeText = `${greeting}! I'm now focused on ${universityContext.name}. How can I help you with their admissions and information?`;
    } else {
      welcomeText = `${greeting}! I'm here to help you with university admissions in Ghana. What would you like to know?`;
    }
    
    const welcomeMessage = {
      id: '1',
      text: welcomeText,
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: newConversationId,
    };
    stableAddMessage(welcomeMessage);
  }, [locationForceNewConversation]); // ✅ Only runs when forceNewConversation changes
  
  // 3. Handle initial messages (assessment or university) with duplicate prevention
  useEffect(() => {
    if (!initialMessage || !currentConversation || !isInitialized) return;
    
    // Wait a bit for conversation to be properly set up
    const timeoutId = setTimeout(() => {
      // ✅ DUPLICATE PREVENTION: Check if we've already processed this message
      const messageKey = `${currentConversation.id}-${initialMessage}`;
      if (processedMessages.has(messageKey)) {
        console.log('🚫 Skipping duplicate initial message');
        return;
      }
      
      console.log('📝 Processing initial message:', initialMessage.substring(0, 50));
      
      // Mark as processed IMMEDIATELY to prevent duplicates
      setProcessedMessages(prev => new Set(prev).add(messageKey));
      
      // Check if this is the first user message BEFORE adding
      const isFirstUserMessage = useAppStore.getState().messages.filter(
        m => m.conversationId === currentConversation.id && m.isUser
      ).length === 0;
      
      // Add user message
      const userMessage = {
        id: `user-${Date.now()}`,
        text: initialMessage,
        isUser: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationId: currentConversation.id,
      };
      stableAddMessage(userMessage);

      // Update conversation title with initial message if it's the first user message
      if (isFirstUserMessage && shouldUpdateConversationTitle(currentConversation.title, initialMessage)) {
        const newTitle = generateConversationTitle(initialMessage, universityContext?.name, assessmentData);
        useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
        console.log(`📝 Updated conversation title from initial message: "${newTitle}"`);
      }

      // Get AI response immediately
      handleInitialMessageResponse(initialMessage, currentConversation.id);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [initialMessage, currentConversation?.id, isInitialized]); // ✅ Only essential dependencies

  
  // 4. Handle university context changes (simplified)
  useEffect(() => {
    if (!universityContext || !currentConversation || !isInitialized) return;
    
    const contextChanged = currentConversation.universityContext !== universityContext.name;
    if (contextChanged) {
      console.log('🏫 University context changed to:', universityContext.name);
      
      // Update conversation context
      const updatedConversation = {
        ...currentConversation,
        universityContext: universityContext.name,
        title: `${universityContext.name} Chat`
      };
      stableSetCurrentConversation(updatedConversation);
    }
  }, [universityContext?.name, currentConversation?.universityContext]); // ✅ Specific dependencies

  // CRITICAL FIX: Get current conversation messages with forced refresh and proper chronological ordering
  const { messages: allMessages } = useAppStore();
  const currentMessages = currentConversation
    ? allMessages
        .filter(msg => msg.conversationId === currentConversation.id)
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeA - timeB; // Oldest first for proper chat flow
        })
    : [];
  
  // Handle initial message response function
  const handleInitialMessageResponse = useCallback(async (message: string, conversationId: string) => {
    setIsTyping(true);
    try {
      console.log('🤖 Generating AI response for initial message...');
      
      // Determine context based on whether this is assessment or university
      const context = assessmentData ? {
        assessment_data: assessmentData,
        is_assessment_result: true,
        context_switch: true,
        bestSubject: assessmentData?.bestSubject,
        shs_program: assessmentData?.shsProgram,
        wassce_grade: assessmentData?.wassceGrade,
        interests: assessmentData?.interests,
        career_goals: assessmentData?.careerGoals,
        preferred_location: assessmentData?.preferredLocation
      } : {
        context_switch: true,
        university_info_request: true,
        session_context: {
          message_count: currentMessages.length,
          has_university_preference: !!universityContext,
          timestamp: new Date().toISOString()
        }
      };
      
      const response = await stableSendChatMessage(
        message, 
        conversationId,
        universityContext?.name,
        context
      );
      
      if (response && response.success && response.message) {
        const botMessage = {
          id: `bot-${Date.now()}`,
          text: response.message,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: conversationId,
          sources: response.sources || [],
          confidence: response.confidence || 0.0
        };
        stableAddMessage(botMessage);
        console.log('✅ Initial message response added successfully');
        
       
      }
    } catch (error) {
      console.error('❌ Initial message response error:', error);
      const errorMessage = {
        id: `error-${Date.now()}`,
        text: assessmentData 
          ? `I received your assessment data. Let me help you with university recommendations based on your profile.`
          : universityContext 
            ? `I'm here to help you with ${universityContext.name}! Feel free to ask about their programs, admission requirements, or any other questions.`
            : `I'm here to help you with university admissions in Ghana. What would you like to know?`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationId: conversationId,
      };
      stableAddMessage(errorMessage);
    } finally {
      setIsTyping(false);
    }
  }, [assessmentData, universityContext, stableSendChatMessage, stableAddMessage, currentMessages.length]);

  const quickActions = assessmentData ? [
    "Explain my assessment results",
    "Compare recommended programs",
    "Application requirements",
    "Scholarship opportunities",
    "Next steps for admission"
  ] : [
    "Admission requirements",
    "Application deadlines", 
    "Fees & scholarships",
    "Program options",
    "Cut-off points"
  ];

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }
  }, []);

  // Smart auto-scroll - only when user is at bottom
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef<number>(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // Detect if user is scrolled to bottom
  const checkScrollPosition = useCallback(() => {
    if (!messagesContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100; // 100px threshold
    
    setIsUserAtBottom(isAtBottom);
    setShowJumpToLatest(!isAtBottom && currentMessages.length > 0);
  }, [currentMessages.length]);

  // Monitor scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', checkScrollPosition);
    return () => container.removeEventListener('scroll', checkScrollPosition);
  }, [checkScrollPosition]);

  // Auto-scroll only when USER messages are added and user is at bottom
  // Bot messages will NOT trigger auto-scroll to respect user's reading position
  useEffect(() => {
    const hasNewMessages = currentMessages.length > lastMessageCountRef.current;
    
    if (hasNewMessages) {
      // Check if the new message is from the user (user's message triggers scroll only)
      const latestMessage = currentMessages[currentMessages.length - 1];
      const isUserMessage = latestMessage?.isUser === true;
      
      // Only auto-scroll if: user is at bottom AND new message is from user
      if (isUserMessage && isUserAtBottom) {
        const timer = setTimeout(() => scrollToBottom(), 150);
        lastMessageCountRef.current = currentMessages.length;
        return () => clearTimeout(timer);
      }
    }
    
    lastMessageCountRef.current = currentMessages.length;
  }, [currentMessages.length, isUserAtBottom, scrollToBottom, currentMessages]);

  // Handle sending messages with file attachments - FIXED
  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && attachedFiles.length === 0) || !currentConversation) return;

    console.log('🚀 [CHATBOT] handleSendMessage called:', {
      inputLength: inputMessage.trim().length,
      hasFiles: attachedFiles.length > 0,
      conversationId: currentConversation?.id,
      isAuthenticated,
      isGuest
    });

    // FIXED: Check authentication for protected features
    if (!isAuthenticated && !isGuest && attachedFiles.length > 0) {
      console.log('🔒 [CHATBOT] Authentication required for file upload');
      setShowAuthModal(true);
      return;
    }

    const messageText = inputMessage.trim();
    const filesToSend = [...attachedFiles];
    
    // CRITICAL: Check if this is first user message BEFORE adding to store
    const isFirstUserMessage = currentMessages.filter(m => m.isUser).length === 0;
    
    // Clear input and attachments immediately
    setInputMessage('');
    setAttachedFiles([]);
    setIsTyping(true);
    setError(null);

    // Create user message object with attachment info
    const newMessage = {
      id: Date.now().toString(),
      text: messageText || `📎 Sent ${filesToSend.length} file(s)`,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: currentConversation.id,
      attachments: filesToSend.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
      }))
    };

    // Add user message to conversation
    stableAddMessage(newMessage);
    
    // Update conversation title with first user message if needed
    if (isFirstUserMessage && messageText && shouldUpdateConversationTitle(currentConversation.title, messageText)) {
      const newTitle = generateConversationTitle(messageText, universityContext?.name, assessmentData);
      useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
      console.log(`📝 Updated conversation title to: "${newTitle}"`);
    }
    
    // Scroll to bottom after adding message
    setTimeout(() => scrollToBottom(), 50);

    try {
      let response;
      
      console.log('📞 [CHATBOT] About to call sendChatMessage:', {
        messageText: messageText.substring(0, 50),
        conversationId: currentConversation.id,
        universityName: universityContext?.name,
        hasFiles: filesToSend.length > 0
      });
      
      // FIXED: Handle file uploads properly with enhanced validation
      if (filesToSend.length > 0) {
        console.log('📎 Sending files:', filesToSend.map(f => f.name));
        response = await sendMessageWithFiles(messageText, filesToSend, currentConversation.id, universityContext?.name);
      } else {
        // Regular text message
        response = await stableSendChatMessage(
          messageText, 
          currentConversation.id,
          universityContext?.name,
          {
            session_context: {
              message_count: currentMessages.length,
              has_university_preference: !!universityContext,
              timestamp: new Date().toISOString()
            }
          }
        );
      }
      
      console.log('📥 [CHATBOT] Received response from sendChatMessage:', {
        success: response?.success,
        hasMessage: !!response?.message,
        messageLength: response?.message?.length || 0,
        hasError: !!(response && 'error' in response && response.error)
      });
      
      // ✅ FIXED: Enhanced response handling with better error checking
      if (response && response.success && response.message) {
        console.log('✅ Received successful response from bot:', {
          messageLength: response.message.length,
          confidence: response.confidence,
          sourcesCount: response.sources?.length || 0,
          fallbackMode: response.metadata?.fallback_mode || false
        });

        const botMessage = {
          id: (Date.now() + 1).toString(),
          text: response.message,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: currentConversation.id,
          sources: response.sources || [],
          confidence: response.confidence || 0.0
        };
        
        stableAddMessage(botMessage);
        
        // 🏷️ Update conversation title if backend provided one
        // Check if it's a real title (not a conversation ID or generic placeholder)
        if (response.conversation_title && 
            response.conversation_title !== currentConversation.id &&
            !response.conversation_title.startsWith('conv_') &&
            response.conversation_title !== 'New Conversation' &&
            response.conversation_title !== 'Untitled' &&
            response.conversation_title.trim().length > 0) {
          console.log(`🏷️ Updating conversation title from backend: \"${response.conversation_title}\"`);
          useAppStore.getState().updateConversation(currentConversation.id, { 
            title: response.conversation_title 
          });
        } else {
          console.log(`⚠️ Backend title not suitable for update: \"${response.conversation_title}\"`);
        }
        
        // 🏷️ Auto-save conversation after first exchange to trigger LLM title generation
        if (isFirstUserMessage && currentMessages.length <= 2) {
          console.log('💾 Auto-saving conversation after first exchange to generate LLM title...');
          setTimeout(() => {
            stableSaveCurrentConversation().catch(err => {
              console.warn('Failed to auto-save for title generation:', err);
            });
          }, 1000); // Delay to ensure messages are added to store
        }
        
        // Auto-scroll disabled - user can scroll manually if needed

        // Show confidence feedback
        if (response.confidence && response.confidence > 0.9) {
          console.log('✅ High confidence response:', response.confidence);
        } else if (response.metadata?.response_type === 'hybrid_search') {
          console.log('🌐 Web search enhanced response');
        } else if (response.metadata?.fallback_mode) {
          console.log('⚠️ Fallback mode response provided');
        }
      } else if (response && (response as any).error === 'AUTHENTICATION_REQUIRED') {
        // FIXED: Show authentication modal when required
        console.log('🔒 Authentication required, showing modal');
        setShowAuthModal(true);
        setError(null); // Clear error since we're showing auth modal
      } else if (response && !response.success) {
        // ✅ FIXED: Handle unsuccessful response with error message
        const errorMsg = response.message || 'Unable to get response. Please try again.';
        console.error('❌ Response unsuccessful:', errorMsg);
        setError(errorMsg);
        
        // Show error message as a bot message for better UX
        const errorBotMessage = {
          id: (Date.now() + 1).toString(),
          text: errorMsg,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: currentConversation.id,
          sources: [],
          confidence: 0.0
        };
        stableAddMessage(errorBotMessage);
      } else {
        // ✅ FIXED: Fallback for unexpected response format
        console.error('❌ Unexpected response format:', response);
        const fallbackError = 'Unable to get response. Please try again.';
        setError(fallbackError);
        
        // Show error as bot message
        const errorBotMessage = {
          id: (Date.now() + 1).toString(),
          text: fallbackError,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: currentConversation.id,
          sources: [],
          confidence: 0.0
        };
        stableAddMessage(errorBotMessage);
      }
    } catch (error) {
      // ✅ FIXED: Enhanced catch block with detailed logging
      console.error('❌ Chat error with details:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      const errorMsg = filesToSend.length > 0 
        ? 'Failed to send files. Please try again.' 
        : error instanceof Error && error.message 
          ? error.message 
          : 'Unable to get response. Please try again.';
      
      setError(errorMsg);
      
      // ✅ FIXED: Show error as bot message so user sees it immediately
      const errorBotMessage = {
        id: (Date.now() + 1).toString(),
        text: `⚠️ ${errorMsg}`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationId: currentConversation.id,
        sources: [],
        confidence: 0.0
      };
      stableAddMessage(errorBotMessage);
    } finally {
      setIsTyping(false);
    }
  };

  // FIXED: Enhanced file upload with proper validation and error handling
  const sendMessageWithFiles = async (message: string, files: File[], conversationId: string, universityName?: string): Promise<EnhancedChatResponse> => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      
      // Enhanced file validation
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      
      for (const file of files) {
        if (file.size > maxFileSize) {
          throw new Error(`File "${file.name}" is too large. Maximum size is 10MB.`);
        }
        if (!allowedTypes.includes(file.type)) {
          throw new Error(`File type "${file.type}" is not supported. Please use images, PDFs, Word documents, Excel files, or text files.`);
        }
      }
      
      const formData = new FormData();
      formData.append('message', message || '');
      formData.append('conversation_id', conversationId);
      formData.append('university_name', universityName || '');
      
      // Add each file with proper key name expected by backend
      files.forEach((file) => {
        formData.append('files', file, file.name);
      });

      console.log('📎 FIXED: Sending validated files to backend:', {
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        fileTypes: files.map(f => f.type),
        fileNames: files.map(f => f.name),
        message: message?.substring(0, 50) || 'No text message',
        conversationId
      });

      // Get token for authentication
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/chat/upload`, {
        method: 'POST',
        headers,
        body: formData
        // Note: timeout not supported in fetch API, using AbortController if needed
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: `Server error: ${response.status}` };
        }
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ FIXED: Files uploaded successfully:', {
        filesProcessed: data.files_processed || files.length,
        responseLength: data.message?.length || data.reply?.length || 0,
        confidence: data.confidence
      });

      return {
        success: true,
        message: data.reply || data.message || 'Files processed successfully',
        conversation_title: data.conversation_title,
        sources: data.sources || [],
        confidence: data.confidence || 0.0,
        metadata: data.metadata || {}
      };

    } catch (error: any) {
      console.error('❌ FIXED: File upload error with details:', error);

      // Provide user-friendly error messages
      if (error?.message?.includes('too large')) {
        throw new Error('One or more files are too large. Please use files under 10MB.');
      } else if (error?.message?.includes('not supported')) {
        throw new Error('Please use supported file types: images, PDFs, Word documents, Excel files, or text files.');
      } else if (error?.message?.includes('Network') || error?.message?.includes('fetch')) {
        throw new Error('Network error. Please check your connection and try again.');
      } else {
        throw new Error('Failed to upload files. Please try again or contact support.');
      }
    }
  };

  const handleQuickAction = async (action: string) => {
    if (!currentConversation) return;

    // CRITICAL: Check if this is first user message BEFORE adding to store
    const isFirstUserMessage = currentMessages.filter(m => m.isUser).length === 0;

    const newMessage = {
      id: Date.now().toString(),
      text: action,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: currentConversation.id,
    };

    stableAddMessage(newMessage);
    
    // Update conversation title with quick action if it's the first user message
    if (isFirstUserMessage && shouldUpdateConversationTitle(currentConversation.title, action)) {
      const newTitle = generateConversationTitle(action, universityContext?.name, assessmentData);
      useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
      console.log(`📝 Updated conversation title from quick action: "${newTitle}"`);
    }
    
    setIsTyping(true);
    setError(null);
    
    // Scroll to bottom after adding quick action message
    setTimeout(() => scrollToBottom(), 50);

    try {
      // Use real RAG service for quick actions too
      const response = await stableSendChatMessage(
        action, 
        currentConversation.id,
        universityContext?.name,
        {
          session_context: {
            message_count: currentMessages.length,
            is_quick_action: true,
            timestamp: new Date().toISOString()
          }
        }
      );
      
      if (response && response.success && response.message) {
        const botMessage = {
          id: (Date.now() + 1).toString(),
          text: response.message,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: currentConversation.id,
          sources: response.sources || [],
          confidence: response.confidence || 0.0
        };
        
        stableAddMessage(botMessage);
        
        // 🏷️ Auto-save conversation after first exchange to trigger LLM title generation
        if (isFirstUserMessage && currentMessages.length <= 2) {
          console.log('💾 Auto-saving conversation after first quick action to generate LLM title...');
          setTimeout(() => {
            stableSaveCurrentConversation().catch(err => {
              console.warn('Failed to auto-save for title generation:', err);
            });
          }, 1000);
        }
        
        // Auto-scroll disabled - user can scroll manually if needed
      } else if (response && response.error === 'AUTHENTICATION_REQUIRED') {
        // FIXED: Show authentication modal for quick actions too
        setShowAuthModal(true);
        setError(null);
      } else {
        setError('Unable to get response. Please try again.');
      }
    } catch (error) {
      console.error('❌ Quick action error:', error);
      setError('Unable to get response. Please try again.');
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // FIXED: File handling functions with proper multiple file support
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // FIXED: Check authentication for file uploads
    if (!isAuthenticated && !isGuest) {
      setShowAuthModal(true);
      return;
    }

    // FIXED: Validate file types and sizes
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (!validTypes.includes(file.type)) {
        setError(`File type ${file.type} is not supported`);
        return false;
      }
      if (file.size > maxSize) {
        setError(`File ${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    // FIXED: Support multiple files properly
    setAttachedFiles(prev => [...prev, ...validFiles]);
    setShowAttachMenu(false);
    
    // Reset file input to allow selecting the same files again
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // FIXED: Check authentication for image uploads
    if (!isAuthenticated && !isGuest) {
      setShowAuthModal(true);
      return;
    }

    // FIXED: Validate image files
    const validImages = files.filter(file => {
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (!validImageTypes.includes(file.type)) {
        setError(`Image type ${file.type} is not supported`);
        return false;
      }
      if (file.size > maxSize) {
        setError(`Image ${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    // FIXED: Support multiple images properly
    setAttachedFiles(prev => [...prev, ...validImages]);
    setShowAttachMenu(false);
    
    // Reset file input
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleCameraCapture = () => {
    setShowAttachMenu(false);
    
    // Create a dedicated camera input element
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment'; // Use back camera if available
    cameraInput.style.display = 'none';
    
    cameraInput.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setAttachedFiles(prev => [...prev, ...files]);
      }
    };
    
    // Add to DOM, trigger click, then remove
    document.body.appendChild(cameraInput);
    cameraInput.click();
    document.body.removeChild(cameraInput);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBuyForms = () => {
    setShowAttachMenu(false);
    // Navigate to forms page or open forms modal
    window.location.href = '/forms';
  };

  const handleViewUniversitySession = () => {
    setShowAttachMenu(false);
    setShowUniversityModal(true);
  };

  const handleUniversitySelect = (university: { name: string; fullName: string; logo?: string }) => {
    setShowUniversityModal(false);
    
    // Create a new conversation for the selected university with professional title
    const conversationTitle = 'New Conversation';
    const newConversationId = stableCreateConversation(conversationTitle);
    
    // Find the created conversation and set it as current
    const newConversation = useAppStore.getState().conversations.find(c => c.id === newConversationId);
    stableSetCurrentConversation(newConversation || null);
    
    // Add personalized welcome message
    const { greeting } = getPersonalizedGreeting(user?.name);
    const guestNote = isGuest ? " (You're in guest mode - some features may be limited)" : "";
    const welcomeText = `${greeting}! I'm here to help you with ${university.name} admissions and information.${guestNote}`;
    
    const welcomeMessage = {
      id: '1',
      text: welcomeText,
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: newConversationId,
    };
    
    stableAddMessage(welcomeMessage);
  };

  const handleStartNewConversation = () => {
    console.log('🧹 New Chat: clearing state and preventing context leakage...');

    // Save current conversation if needed
    if (currentConversation && currentMessages.length > 0) {
      stableSaveCurrentConversation().catch(() => {});
    }

    // Strictly suppress any preloaded context for the next session
    setSuppressContext(true);

    // Clear local UI state
    setProcessedMessages(new Set());
    setInputMessage('');
    setAttachedFiles([]);
    setError(null);
    setIsTyping(false);
    setShowAttachMenu(false);

    // Clear global chat state for messages only; do not carry over any triggers
    useAppStore.setState({
      messages: [],
      loading: false,
      error: null,
    });

    // Create a brand new, blank conversation without auto prompts
    const newConversationId = startNewConversation();

    // Ensure no automatic initialMessage is sent in this fresh session
    setIsInitialized(true);

    // Minimal neutral welcome only; no assessment/university prompts
    const { greeting } = getPersonalizedGreeting(user?.name);
    const guestNote = isGuest ? " (You're in guest mode - some features may be limited)" : "";
    stableAddMessage({
      id: `welcome-${Date.now()}`,
      text: `${greeting}! This is a new chat. Ask me anything about Ghanaian universities.${guestNote}`,
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: newConversationId,
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Header with New Conversation Button */}
      {currentMessages.length > 1 && (
        <div className={`p-4 border-b transition-colors duration-200 ${
          theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className={`text-sm font-medium transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {universityContext ? `${universityContext.name} Chat` : 'Active Chat'}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartNewConversation}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                theme === 'dark' 
                  ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              }`}
              title="Save current chat and start new conversation"
            >
              + New Chat
            </motion.button>
          </div>
        </div>
      )}

      {/* Messages Container - FIXED: AnimatePresence with mode */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4 min-h-0 relative">
        <AnimatePresence mode="popLayout">
          {currentMessages.map((message) => (
            <motion.div
              key={`message-${message.id}-${message.conversationId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ChatBubble message={message} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center space-x-2 transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            <div className="flex space-x-1">
              <div className={`w-2 h-2 rounded-full animate-bounce ${
                theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'
              }`}></div>
              <div className={`w-2 h-2 rounded-full animate-bounce ${
                theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'
              }`} style={{ animationDelay: '0.1s' }}></div>
              <div className={`w-2 h-2 rounded-full animate-bounce ${
                theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'
              }`} style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm">Glinax is typing...</span>
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
              theme === 'dark' 
                ? 'bg-yellow-900/50 border border-yellow-700 text-yellow-300' 
                : 'bg-yellow-100 border border-yellow-300 text-yellow-800'
            }`}
          >
            {error}
          </motion.div>
        )}

        <div ref={messagesEndRef} />

        {/* Jump to Latest Button */}
        <AnimatePresence>
          {showJumpToLatest && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={() => {
                scrollToBottom();
                setIsUserAtBottom(true);
                setShowJumpToLatest(false);
              }}
              className={`fixed bottom-24 right-8 z-10 px-4 py-2 rounded-full shadow-lg transition-all duration-200 flex items-center gap-2 ${
                theme === 'dark'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              title="Jump to latest message"
            >
              <span className="text-sm font-medium">↓ New messages</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Actions */}
      {currentMessages.length <= 2 && (
        <div className={`p-4 border-t transition-colors duration-200 ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, index) => (
              <motion.button
                key={action}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleQuickAction(action)}
                className={`px-3 py-2 rounded-full text-sm transition-colors duration-200 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {action}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Attached Files Display */}
      {attachedFiles.length > 0 && (
        <div className={`px-4 py-2 border-t transition-colors duration-200 ${
          theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors duration-200 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-gray-300' 
                    : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                <FiFile className="w-4 h-4" />
                <span className="text-sm truncate max-w-32">{file.name}</span>
                <button
                  onClick={() => removeAttachedFile(index)}
                  title="Remove file"
                  className={`p-1 rounded-full transition-colors duration-200 ${
                    theme === 'dark' 
                      ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-300' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FiX className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`p-4 border-t transition-colors duration-200 ${
        theme === 'dark' 
          ? 'border-gray-700 bg-gray-800' 
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center space-x-3">
          {/* Attach Button with Dropdown */}
          <div className="relative">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
              onClick={() => setShowAttachMenu(!showAttachMenu)}
            className={`p-2.5 rounded-full transition-all duration-200 ${
                showAttachMenu
                  ? theme === 'dark' 
                    ? 'text-primary-400 bg-primary-500/20' 
                    : 'text-primary-600 bg-primary-100'
                  : theme === 'dark' 
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title="Attach file or document"
          >
            <FiPaperclip className="w-5 h-5" />
          </motion.button>

          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message Glinax Assistant..."
              className={`w-full px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 ${
                theme === 'dark' 
                  ? 'glass-unified-dark text-white placeholder-gray-400' 
                  : 'glass-unified text-gray-900 placeholder-gray-500'
              }`}
              disabled={isTyping}
            />
          </div>
          <motion.button
            whileHover={{ scale: (inputMessage.trim() || attachedFiles.length > 0) && !isTyping ? 1.05 : 1 }}
            whileTap={{ scale: (inputMessage.trim() || attachedFiles.length > 0) && !isTyping ? 0.95 : 1 }}
            onClick={handleSendMessage}
            disabled={!(inputMessage.trim() || attachedFiles.length > 0) || isTyping}
            className={`p-3 rounded-full transition-all duration-200 ${
              (inputMessage.trim() || attachedFiles.length > 0) && !isTyping
                ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-300 text-gray-400 cursor-not-allowed'
            }`}
            title={(inputMessage.trim() || attachedFiles.length > 0) ? "Send message" : "Type a message or attach files"}
          >
            <FiSend className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* FIXED: Attach Menu Overlay with proper mode */}
      <AnimatePresence mode="wait">
        {showAttachMenu && (
          <>
            {/* Backdrop */}
            <motion.div
              key="attach-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAttachMenu(false)}
              className={`fixed inset-0 backdrop-blur-sm z-40 ${
                theme === 'dark' ? 'bg-black/60' : 'bg-black/50'
              }`}
            />
            
            {/* Attach Menu - Bottom Sheet Style */}
            <motion.div
              key="attach-menu"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl ${
                theme === 'dark' 
                  ? 'bg-gray-800 border-t border-gray-700' 
                  : 'bg-white border-t border-gray-200'
              }`}
            >
              {/* Handle Bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className={`w-12 h-1 rounded-full ${
                  theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`} />
              </div>
              
              
              {/* Menu Options */}
              <div className="px-8 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Images */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => imageInputRef.current?.click()}
                    className={`flex flex-col items-center p-2.5 rounded-3xl transition-all duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className={`p-2 rounded-full mb-1.5 ${
                      theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'
                    }`}>
                      <FiImage className={`w-4 h-4 ${
                        theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                      }`} />
                    </div>
                    <span className="text-xs font-medium">Images</span>
                  </motion.button>

                  {/* Files */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center p-2.5 rounded-3xl transition-all duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className={`p-2 rounded-full mb-1.5 ${
                      theme === 'dark' ? 'bg-green-500/20' : 'bg-green-100'
                    }`}>
                      <FiFile className={`w-4 h-4 ${
                        theme === 'dark' ? 'text-green-400' : 'text-green-600'
                      }`} />
                    </div>
                    <span className="text-xs font-medium">Files</span>
                  </motion.button>

                  {/* Camera */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCameraCapture}
                    className={`flex flex-col items-center p-2.5 rounded-3xl transition-all duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className={`p-2 rounded-full mb-1.5 ${
                      theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'
                    }`}>
                      <FiCamera className={`w-4 h-4 ${
                        theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                      }`} />
                    </div>
                    <span className="text-xs font-medium">Camera</span>
                  </motion.button>

                  {/* Buy University Forms */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleBuyForms}
                    className={`flex flex-col items-center p-2.5 rounded-3xl transition-all duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className={`p-2 rounded-full mb-1.5 ${
                      theme === 'dark' ? 'bg-orange-500/20' : 'bg-orange-100'
                    }`}>
                      <FiShoppingCart className={`w-4 h-4 ${
                        theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
                      }`} />
                    </div>
                    <span className="text-xs font-medium">Buy University Forms</span>
                  </motion.button>
                </div>
                
                {/* View University Session - Full Width */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleViewUniversitySession}
                  className={`w-full flex items-center justify-center p-2 rounded-3xl transition-all duration-200 mt-2 ${
                    theme === 'dark' 
                      ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className={`p-1.5 rounded-full mr-2.5 ${
                    theme === 'dark' ? 'bg-indigo-500/20' : 'bg-indigo-100'
                  }`}>
                    <FiUsers className={`w-3.5 h-3.5 ${
                      theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'
                    }`} />
                  </div>
                  <span className="text-xs font-medium">View University Session</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FIXED: University Selection Modal with proper keys */}
      <AnimatePresence mode="wait">
        {showUniversityModal && (
          <>
            {/* Backdrop */}
            <motion.div
              key="university-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUniversityModal(false)}
              className={`fixed inset-0 backdrop-blur-sm z-50 ${
                theme === 'dark' ? 'bg-black/60' : 'bg-black/50'
              }`}
            />
            
            {/* University Selection Modal */}
            <motion.div
              key="university-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className={`fixed inset-x-4 top-1/2 -translate-y-1/2 max-h-[80vh] overflow-y-auto scrollbar-hide rounded-3xl shadow-2xl border z-50 ${
                theme === 'dark' 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200'
              }`}
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xl font-bold transition-colors duration-200 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>
                    Select University
                  </h3>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowUniversityModal(false)}
                    className={`p-2 rounded-full transition-colors duration-200 ${
                      theme === 'dark' 
                        ? 'bg-gray-700 hover:bg-gray-600' 
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <FiX className={`w-5 h-5 transition-colors duration-200 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`} />
                  </motion.button>
                </div>
                <p className={`text-sm mt-2 transition-colors duration-200 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Choose a university to start a chat session
                </p>
              </div>
              
              {/* Universities List */}
              <div className="p-6">
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { name: 'KNUST', fullName: 'Kwame Nkrumah University of Science and Technology' },
                    { name: 'UG', fullName: 'University of Ghana' },
                    { name: 'UCC', fullName: 'University of Cape Coast' },
                    { name: 'UENR', fullName: 'University of Energy and Natural Resources' },
                    { name: 'UMaT', fullName: 'University of Mines and Technology' },
                    { name: 'UDS', fullName: 'University for Development Studies' },
                    { name: 'UEW', fullName: 'University of Education, Winneba' },
                    { name: 'UPSA', fullName: 'University of Professional Studies' }
                  ].map((university, index) => (
                    <motion.button
                      key={university.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleUniversitySelect(university)}
                      className={`flex items-center space-x-3 p-4 rounded-2xl transition-all duration-200 ${
                        theme === 'dark' 
                          ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {university.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 text-left">
                        <h4 className={`font-semibold transition-colors duration-200 ${
                          theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>
                          {university.name}
                        </h4>
                        <p className={`text-sm transition-colors duration-200 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {university.fullName}
                        </p>
                      </div>
                      <FiMessageCircle className={`w-5 h-5 transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`} />
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Authentication Modal */}
      <AuthenticationModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        initialMode="login"
      />

      {/* Hidden File Inputs - FIXED: Better file type support */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload files"
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={handleImageSelect}
        className="hidden"
        aria-label="Upload images"
      />
    </div>
  );
});

ChatBot.displayName = 'ChatBot';

export default ChatBot;
