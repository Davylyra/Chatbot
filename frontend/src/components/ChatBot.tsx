import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiImage, FiFile, FiCamera, FiShoppingCart, FiX, FiUsers, FiSearch, FiStar } from 'react-icons/fi';
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
  resumeConversationId?: string;
  resumeConversationTitle?: string;
  forceCoachMode?: boolean;
}

const ChatBot: React.FC<ChatBotProps> = memo(({ universityContext: propUniversityContext, assessmentData: propAssessmentData, initialMessage: propInitialMessage, forceNewConversation = false, resumeConversationId, resumeConversationTitle, forceCoachMode = false }) => {
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
  
  const rawUniversityContext = location.state?.universityContext || propUniversityContext;
  const rawAssessmentData = location.state?.assessmentData || propAssessmentData;
  const rawInitialMessage = location.state?.initialMessage || propInitialMessage;
  const locationForceNewConversation = location.state?.forceNewConversation || forceNewConversation;

  const [suppressContext, setSuppressContext] = useState(false);

  // Effective context used by this component
  const universityContext = suppressContext ? undefined : rawUniversityContext;
  const assessmentData = suppressContext ? undefined : rawAssessmentData;
  const initialMessage = suppressContext ? undefined : rawInitialMessage;

  const stableAddMessage = useCallback(addMessage, [addMessage]);
  const stableCreateConversation = useCallback(createConversation, [createConversation]);
  const stableSetCurrentConversation = useCallback(setCurrentConversation, [setCurrentConversation]);
  const stableSaveCurrentConversation = useCallback(saveCurrentConversation, [saveCurrentConversation]);
  const stableSendChatMessage = useCallback(sendChatMessage, [sendChatMessage]);

  const [processedMessages, setProcessedMessages] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
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
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        if (!API_BASE_URL) {
          console.error('API_BASE_URL is not configured');
          return;
        }

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
          const existingMessages = useAppStore.getState().messages.filter(
            m => m.conversationId === resumeConversationId
          );
          const existingIds = new Set(existingMessages.map(m => m.id));
          
          data.messages.forEach((msg: any) => {
            const messageId = msg.id || `${Date.now()}-${Math.random()}`;
            if (existingIds.has(messageId)) {
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
    
    const { greeting } = getPersonalizedGreeting(user?.name);

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
    
    const conversationTitle = 'New Conversation';
    const newConversationId = stableCreateConversation(conversationTitle);
    
    const newConversation = useAppStore.getState().conversations.find(c => c.id === newConversationId);
    if (newConversation) {

      if (universityContext) {
        newConversation.universityContext = universityContext.name;
      }
      stableSetCurrentConversation(newConversation);
    }

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
  }, [locationForceNewConversation]);
  
  // 3. Handle initial messages (assessment or university) with duplicate prevention
  useEffect(() => {
    if (!initialMessage || !currentConversation || !isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      const messageKey = `${currentConversation.id}-${initialMessage}`;
      if (processedMessages.has(messageKey)) {
        return;
      }

      setProcessedMessages(prev => new Set(prev).add(messageKey));

      const isFirstUserMessage = useAppStore.getState().messages.filter(
        m => m.conversationId === currentConversation.id && m.isUser
      ).length === 0;

      const userMessage = {
        id: `user-${Date.now()}`,
        text: initialMessage,
        isUser: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationId: currentConversation.id,
      };
      stableAddMessage(userMessage);

      if (isFirstUserMessage && shouldUpdateConversationTitle(currentConversation.title, initialMessage)) {
        const newTitle = generateConversationTitle(initialMessage, universityContext?.name, assessmentData);
        useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
      }

      handleInitialMessageResponse(initialMessage, currentConversation.id);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [initialMessage, currentConversation?.id, isInitialized]);

  
  useEffect(() => {
    if (!universityContext || !currentConversation || !isInitialized) return;
    
    const contextChanged = currentConversation.universityContext !== universityContext.name;
    if (contextChanged) {
      const updatedConversation = {
        ...currentConversation,
        universityContext: universityContext.name,
        title: `${universityContext.name} Chat`
      };
      stableSetCurrentConversation(updatedConversation);
    }
  }, [universityContext?.name, currentConversation?.universityContext]);

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

  const handleInitialMessageResponse = useCallback(async (message: string, conversationId: string) => {
    setIsTyping(true);
    try {
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
        preferred_location: assessmentData?.preferredLocation,
        is_coach_mode: forceCoachMode
      } : {
        context_switch: true,
        university_info_request: true,
        session_context: {
          message_count: currentMessages.length,
          has_university_preference: !!universityContext,
          timestamp: new Date().toISOString()
        },
        is_coach_mode: forceCoachMode
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
      }
    } catch (error) {
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

  // quickActions removed due to TS6133

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
      const latestMessage = currentMessages[currentMessages.length - 1];
      const isUserMessage = latestMessage?.isUser === true;
      
      if (isUserMessage && isUserAtBottom) {
        const timer = setTimeout(() => scrollToBottom(), 150);
        lastMessageCountRef.current = currentMessages.length;
        return () => clearTimeout(timer);
      }
    }
    
    lastMessageCountRef.current = currentMessages.length;
  }, [currentMessages.length, isUserAtBottom, scrollToBottom, currentMessages]);

  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && attachedFiles.length === 0) || !currentConversation) return;

    if (!isAuthenticated && !isGuest && attachedFiles.length > 0) {
      setShowAuthModal(true);
      return;
    }

    const messageText = inputMessage.trim();
    const filesToSend = [...attachedFiles];
    
    const isFirstUserMessage = currentMessages.filter(m => m.isUser).length === 0;
    
    // Clear input and attachments immediately
    setInputMessage('');
    setAttachedFiles([]);
    setIsTyping(true);
    setError(null);

    const newMessage = {
      id: Date.now().toString(),
      text: messageText || `Sent ${filesToSend.length} file(s)`,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: currentConversation.id,
      attachments: filesToSend.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
      }))
    };

    stableAddMessage(newMessage);
    
    if (isFirstUserMessage && messageText && shouldUpdateConversationTitle(currentConversation.title, messageText)) {
      const newTitle = generateConversationTitle(messageText, universityContext?.name, assessmentData);
      useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
    }
    
    setTimeout(() => scrollToBottom(), 50);

    try {
      let response;

      if (filesToSend.length > 0) {
        response = await sendMessageWithFiles(messageText, filesToSend, currentConversation.id, universityContext?.name);
      } else {
        response = await stableSendChatMessage(
          messageText, 
          currentConversation.id,
          universityContext?.name,
          {
            session_context: {
              message_count: currentMessages.length,
              has_university_preference: !!universityContext,
              timestamp: new Date().toISOString()
            },
            is_coach_mode: forceCoachMode
          }
        );
      }

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
        
        if (response.conversation_title && 
            response.conversation_title !== currentConversation.id &&
            !response.conversation_title.startsWith('conv_') &&
            response.conversation_title !== 'New Conversation' &&
            response.conversation_title !== 'Untitled' &&
            response.conversation_title.trim().length > 0) {
          useAppStore.getState().updateConversation(currentConversation.id, { 
            title: response.conversation_title 
          });
        }
        
        if (isFirstUserMessage && currentMessages.length <= 2) {
          setTimeout(() => {
            stableSaveCurrentConversation().catch(err => {
              console.warn('Failed to auto-save for title generation:', err);
            });
          }, 1000);
        }
      } else if (response && (response as any).error === 'AUTHENTICATION_REQUIRED') {
        setShowAuthModal(true);
        setError(null);
      } else if (response && !response.success) {
        const errorMsg = response.message || 'Unable to get response. Please try again.';
        setError(errorMsg);
        
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
        const fallbackError = 'Unable to get response. Please try again.';
        setError(fallbackError);
        
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
      const errorMsg = filesToSend.length > 0 
        ? 'Failed to send files. Please try again.' 
        : error instanceof Error && error.message 
          ? error.message 
          : 'Unable to get response. Please try again.';
      
      setError(errorMsg);
      
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
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessageWithFiles = async (message: string, files: File[], conversationId: string, universityName?: string): Promise<EnhancedChatResponse> => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      if (!API_BASE_URL) {
        console.error('API_BASE_URL is not configured');
        throw new Error('API configuration is missing');
      }
      
      const maxFileSize = 10 * 1024 * 1024;
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
      
      files.forEach((file) => {
        formData.append('files', file, file.name);
      });

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/chat/upload`, {
        method: 'POST',
        headers,
        body: formData
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

      return {
        success: true,
        message: data.reply || data.message || 'Files processed successfully',
        conversation_title: data.conversation_title,
        sources: data.sources || [],
        confidence: data.confidence || 0.0,
        metadata: data.metadata || {}
      };

    } catch (error: any) {
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


  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (!isAuthenticated && !isGuest) {
      setShowAuthModal(true);
      return;
    }

    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const maxSize = 10 * 1024 * 1024;
      
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

    setAttachedFiles(prev => [...prev, ...validFiles]);
    setShowAttachMenu(false);
    
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (!isAuthenticated && !isGuest) {
      setShowAuthModal(true);
      return;
    }

    const validImages = files.filter(file => {
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 10 * 1024 * 1024;
      
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

    setAttachedFiles(prev => [...prev, ...validImages]);
    setShowAttachMenu(false);
    
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleCameraCapture = () => {
    setShowAttachMenu(false);
    
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment';
    cameraInput.style.display = 'none';
    
    cameraInput.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setAttachedFiles(prev => [...prev, ...files]);
      }
    };
    
    document.body.appendChild(cameraInput);
    cameraInput.click();
    document.body.removeChild(cameraInput);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBuyForms = () => {
    setShowAttachMenu(false);
    window.location.href = '/forms';
  };

  const handleStartNewConversation = useCallback(() => {
    if (currentConversation && currentMessages.length > 0) {
      stableSaveCurrentConversation().catch(() => {});
    }

    setSuppressContext(true);

    setProcessedMessages(new Set());
    setInputMessage('');
    setAttachedFiles([]);
    setError(null);
    setIsTyping(false);
    setShowAttachMenu(false);

    useAppStore.setState({
      messages: [],
      loading: false,
      error: null,
    });

    const newConversationId = startNewConversation();

    setIsInitialized(true);

    const { greeting } = getPersonalizedGreeting(user?.name);
    const guestNote = isGuest ? " (You're in guest mode - some features may be limited)" : "";
    stableAddMessage({
      id: `welcome-${Date.now()}`,
      text: `${greeting}! This is a new chat. Ask me anything about Ghanaian universities.${guestNote}`,
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      conversationId: newConversationId,
    });
  }, [currentConversation, currentMessages.length, stableSaveCurrentConversation, startNewConversation, user?.name, isGuest, stableAddMessage]);

  useEffect(() => {
    const handleEvent = () => handleStartNewConversation();
    window.addEventListener('triggerNewChat', handleEvent);
    return () => window.removeEventListener('triggerNewChat', handleEvent);
  }, [handleStartNewConversation]);

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

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4 min-h-0 relative">
        <AnimatePresence mode="popLayout">
          {currentMessages.length <= 1 ? (
            <div className="flex flex-col items-center justify-center text-center w-full min-h-[60vh]">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
                Thinking about your future?, <span className="text-blue-500">{user?.name?.split(' ')[0] || 'Guest'}</span>
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-12 text-lg">Ask me anything about universities and admissions.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full px-4">
                {/* Explore Programs */}
                <button onClick={() => { setInputMessage("I want to explore university programs"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none transition-all duration-200">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-600/20 rounded-xl border border-blue-200 dark:border-blue-500/30 flex items-center justify-center mb-4">
                    <FiSearch className="text-blue-600 dark:text-blue-400 text-xl" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm text-center">Explore Programs</span>
                </button>
                {/* Admission Requirements */}
                <button onClick={() => { setInputMessage("What are the admission requirements?"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none transition-all duration-200">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-600/20 rounded-xl border border-blue-200 dark:border-blue-500/30 flex items-center justify-center mb-4">
                    <FiFile className="text-blue-600 dark:text-blue-400 text-xl" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm text-center">Admission Requirements</span>
                </button>
                {/* Compare Universities */}
                <button onClick={() => { setInputMessage("Compare KNUST and UG"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none transition-all duration-200">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-600/20 rounded-xl border border-blue-200 dark:border-blue-500/30 flex items-center justify-center mb-4">
                    <FiUsers className="text-blue-600 dark:text-blue-400 text-xl" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm text-center">Compare Schools</span>
                </button>
                {/* Career Coach */}
                <button onClick={() => { setInputMessage("I am confused about my career path and need help finding out what I'm good at."); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none transition-all duration-200">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-600/20 rounded-xl border border-blue-200 dark:border-blue-500/30 flex items-center justify-center mb-4">
                    <FiStar className="text-blue-600 dark:text-blue-400 text-xl" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm text-center">Career Coach</span>
                </button>
              </div>
            </div>
          ) : (
            currentMessages.map((message) => (
              <motion.div
                key={`message-${message.id}-${message.conversationId}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ChatBubble message={message} />
              </motion.div>
            ))
          )}
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
              <div className={`w-2 h-2 rounded-full animate-bounce animate-delay-100 ${
                theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'
              }`}></div>
              <div className={`w-2 h-2 rounded-full animate-bounce animate-delay-200 ${
                theme === 'dark' ? 'bg-gray-500' : 'bg-gray-400'
              }`}></div>
            </div>
            <span className="text-sm">CERKYL is typing...</span>
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

      {/* Quick actions removed to match new UI */}

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

      {/* Styled Input Area */}
      <div className={`p-4 transition-colors duration-200 flex flex-col items-center ${
        theme === 'dark' ? 'bg-[#0f1115] border-t border-gray-800' : 'bg-gray-50'
      }`}>
        <div className={`w-full max-w-4xl flex items-center space-x-3 rounded-full px-3 py-2 transition-all duration-200 ${
          theme === 'dark' ? 'bg-[#1e2329]' : 'bg-white shadow-lg border border-gray-200'
        }`}>
          {/* Attach Button (+) */}
          <div className="relative">
            <button 
              onClick={() => { if (!isGuest) setShowAttachMenu(!showAttachMenu); }}
              className={`p-1 rounded-full transition-all duration-200 ${
                theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border border-dashed ${
                theme === 'dark' ? 'border-gray-500' : 'border-gray-400'
              }`}>
                <span className="text-lg leading-none mb-0.5">+</span>
              </div>
            </button>
          </div>
          

          
          <div className="flex-1 relative flex items-center min-h-[40px] py-1">
            <textarea
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if ((inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest) {
                    handleSendMessage();
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                  }
                }
              }}
              placeholder="Message CERKYL..."
              rows={1}
              className={`w-full px-2 bg-transparent focus:outline-none transition-all duration-200 resize-none max-h-[120px] scrollbar-hide py-1 ${
                theme === 'dark' 
                  ? 'text-white placeholder-gray-500' 
                  : 'text-gray-900 placeholder-gray-400'
              } ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isTyping || isGuest}
              style={{ minHeight: '24px' }}
            />
          </div>
          
          <div className="flex items-center space-x-2 pr-1">

            <button
              onClick={handleSendMessage}
              disabled={!(inputMessage.trim() || attachedFiles.length > 0) || isTyping || isGuest}
              className={`p-2 rounded-full transition-all duration-200 ${
                (inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest
                  ? theme === 'dark' ? 'text-white bg-gray-700' : 'text-black bg-gray-200'
                  : theme === 'dark' ? 'text-gray-600' : 'text-gray-300'
              }`}
            >
              <FiSend className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <p className={`text-xs mt-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          CERKYL can make mistakes. Please verify important information.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {showAttachMenu && !isGuest && (
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
