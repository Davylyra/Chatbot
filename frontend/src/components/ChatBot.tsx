import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSend,
  FiImage,
  FiFile,
  FiCamera,
  FiShoppingCart,
  FiX,
  FiUsers,
  FiSearch,
  FiStar,
  FiRefreshCw,
  FiSquare,
} from 'react-icons/fi';
import ChatBubble, { CerkylAvatar, TypingDots } from './ChatBubble';
import AuthenticationModal from './AuthenticationModal';
import { useAppStore } from '../store';
import { useTheme } from '../contexts/ThemeContext';
import { useChat, type EnhancedChatResponse, type StreamCallbacks } from '../hooks/useChat';
import { useAuth } from '../contexts/AuthContext';
import {
  generateConversationTitle,
  shouldUpdateConversationTitle,
} from '../utils/conversationTitles';

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

interface ReplyRequest {
  text: string;
  files: File[];
  conversationId: string;
  isFirstUserMessage: boolean;
  context?: any;
  // The student's message in the chat, removed again if they press Stop.
  userMessageId?: string;
}

// Career Coach opens with Cerkyl asking the first question instead of
// sending a message on the student's behalf.
const COACH_OPENING =
  "Let's work out what suits you. I'll ask you a few quick questions, and you can answer in your own words.\n\n" +
  '**To start: which subjects do you enjoy most at school, and which ones come easily to you?**';

// When the AI service has been idle it takes a while to wake up, so a
// failed send is retried automatically this many times before giving up.
const MAX_WAKE_RETRIES = 3;
const WAKE_RETRY_DELAY_MS = 5000;

const ChatBot: React.FC<ChatBotProps> = memo(
  ({
    universityContext: propUniversityContext,
    assessmentData: propAssessmentData,
    initialMessage: propInitialMessage,
    forceNewConversation = false,
    resumeConversationId,
    resumeConversationTitle,
    forceCoachMode = false,
  }) => {
    const {
      currentConversation,
      addMessage,
      updateMessage,
      addConversation,
      createConversation,
      setCurrentConversation,
      startNewConversation,
      saveCurrentConversation,
    } = useAppStore();
    const { sendMessageStream: sendChatMessageStream } = useChat();
    const { user, isGuest, isAuthenticated } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const rawUniversityContext = location.state?.universityContext || propUniversityContext;
    const rawAssessmentData = location.state?.assessmentData || propAssessmentData;
    const rawInitialMessage = location.state?.initialMessage || propInitialMessage;
    const locationForceNewConversation =
      location.state?.forceNewConversation || forceNewConversation;

    const [suppressContext, setSuppressContext] = useState(false);

    // Effective context used by this component
    const universityContext = suppressContext ? undefined : rawUniversityContext;
    const assessmentData = suppressContext ? undefined : rawAssessmentData;
    const initialMessage = suppressContext ? undefined : rawInitialMessage;

    const stableAddMessage = useCallback(addMessage, [addMessage]);
    const stableUpdateMessage = useCallback(updateMessage, [updateMessage]);
    const stableCreateConversation = useCallback(createConversation, [createConversation]);
    const stableSetCurrentConversation = useCallback(setCurrentConversation, [
      setCurrentConversation,
    ]);
    const stableSaveCurrentConversation = useCallback(saveCurrentConversation, [
      saveCurrentConversation,
    ]);
    const stableSendChatMessageStream = useCallback(sendChatMessageStream, [
      sendChatMessageStream,
    ]);

    const [processedMessages, setProcessedMessages] = useState<Set<string>>(new Set());
    const [isInitialized, setIsInitialized] = useState(false);

    const [inputMessage, setInputMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isStreamingContent, setIsStreamingContent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // A message whose reply failed, kept so the Retry button can resend it.
    const [failedSend, setFailedSend] = useState<ReplyRequest | null>(null);
    const [statusNote, setStatusNote] = useState<string | null>(null);
    // The request waiting for a reply, so the Stop button can cancel it.
    const activeRequestRef = useRef<AbortController | null>(null);
    const initRanRef = useRef(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const { theme } = useTheme();

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
          const existing = useAppStore
            .getState()
            .conversations.find((c) => c.id === resumeConversationId);
          if (!existing) {
            addConversation(resumedConversation);
          }
          stableSetCurrentConversation(resumedConversation);

          const headers: HeadersInit = { Accept: 'application/json' };
          const token = localStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const resp = await fetch(
            `${API_BASE_URL}/chat/conversations/${resumeConversationId}/messages`,
            {
              method: 'GET',
              headers,
              credentials: 'include',
            }
          );
          if (!resp.ok) {
            throw new Error(`Failed to load conversation messages (${resp.status})`);
          }
          const messagesPayload = await resp.json();
          if (messagesPayload.success && Array.isArray(messagesPayload.messages)) {
            const existingMessages = useAppStore
              .getState()
              .messages.filter((m) => m.conversationId === resumeConversationId);
            const existingIds = new Set(existingMessages.map((m) => m.id));

            messagesPayload.messages.forEach((msg: any) => {
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

    // Set up the chat once when the page opens. Start a new conversation when
    // one is asked for (New Chat, Career Coach, a university or assessment
    // button) or when there isn't one yet. No greeting message: the empty
    // chat screen does that job. Resuming a saved chat is handled above.
    useEffect(() => {
      if (initRanRef.current) return;
      initRanRef.current = true;
      if (resumeConversationId) return;

      const state = useAppStore.getState();
      const needsNewConversation =
        !state.currentConversation ||
        !!locationForceNewConversation ||
        !!initialMessage ||
        forceCoachMode;

      if (needsNewConversation) {
        const previous = state.currentConversation;
        if (previous && state.messages.some((m) => m.conversationId === previous.id)) {
          state.saveCurrentConversation().catch(() => {});
        }

        const newConversationId = stableCreateConversation('New Conversation');
        const created = useAppStore
          .getState()
          .conversations.find((c) => c.id === newConversationId);
        if (created) {
          stableSetCurrentConversation({ ...created, universityContext: universityContext?.name });
        }

        if (forceCoachMode) {
          stableAddMessage({
            id: `coach-${Date.now()}`,
            text: COACH_OPENING,
            isUser: false,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            conversationId: newConversationId,
          });
        }
      }

      setIsInitialized(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 3. Handle initial messages (assessment or university) with duplicate prevention
    useEffect(() => {
      if (!initialMessage || !currentConversation || !isInitialized) return;

      const timeoutId = setTimeout(() => {
        const messageKey = `${currentConversation.id}-${initialMessage}`;
        if (processedMessages.has(messageKey)) {
          return;
        }

        setProcessedMessages((prev) => new Set(prev).add(messageKey));

        const isFirstUserMessage =
          useAppStore
            .getState()
            .messages.filter((m) => m.conversationId === currentConversation.id && m.isUser)
            .length === 0;

        const userMessage = {
          id: `user-${Date.now()}`,
          text: initialMessage,
          isUser: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          conversationId: currentConversation.id,
        };
        stableAddMessage(userMessage);

        if (
          isFirstUserMessage &&
          shouldUpdateConversationTitle(currentConversation.title, initialMessage)
        ) {
          const newTitle = generateConversationTitle(
            initialMessage,
            universityContext?.name,
            assessmentData
          );
          useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
        }

        const context = assessmentData
          ? {
              assessment_data: assessmentData,
              is_assessment_result: true,
              context_switch: true,
              bestSubject: assessmentData?.bestSubject,
              shs_program: assessmentData?.shsProgram,
              wassce_grade: assessmentData?.wassceGrade,
              interests: assessmentData?.interests,
              career_goals: assessmentData?.careerGoals,
              preferred_location: assessmentData?.preferredLocation,
              is_coach_mode: forceCoachMode,
            }
          : {
              context_switch: true,
              university_info_request: true,
              is_coach_mode: forceCoachMode,
            };

        deliverReply({
          text: initialMessage,
          files: [],
          conversationId: currentConversation.id,
          isFirstUserMessage,
          context,
          userMessageId: userMessage.id,
        });
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
          title: `${universityContext.name} Chat`,
        };
        stableSetCurrentConversation(updatedConversation);
      }
    }, [universityContext?.name, currentConversation?.universityContext]);

    const { messages: allMessages } = useAppStore();
    const currentMessages = currentConversation
      ? allMessages
          .filter((msg) => msg.conversationId === currentConversation.id)
          .sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB; // Oldest first for proper chat flow
          })
      : [];

    // The sidebar's "Recent Activity" list reads conversations straight from
    // the backend and has no other way of knowing when a title changes there.
    // The backend generates a title asynchronously right after the first
    // exchange in a conversation, so we wait a beat before asking the
    // sidebar to refetch — matches the existing 1s delay used below for
    // stableSaveCurrentConversation, which exists for the same reason.
    const notifySidebarRefresh = useCallback(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('conversationsUpdated'));
      }, 1200);
    }, []);

    // Sends a message, retrying with a visible note while the AI service
    // wakes up after being idle.
    const sendWithWakeRetry = async (
      text: string,
      conversationId: string,
      context: any,
      signal?: AbortSignal,
      callbacks?: StreamCallbacks
    ): Promise<EnhancedChatResponse> => {
      const cancelled: EnhancedChatResponse = { success: false, message: 'Cancelled', error: 'CANCELLED' };
      for (let attempt = 0; ; attempt++) {
        const response = await stableSendChatMessageStream(
          text,
          conversationId,
          universityContext?.name,
          context,
          signal,
          callbacks
        );
        if (signal?.aborted) return cancelled;
        const wakingUp =
          !response.success &&
          response.retryable &&
          ['AI_WAKING_UP', 'NETWORK_ERROR', 'TIMEOUT_ERROR'].includes(response.error || '');
        if (!wakingUp || attempt >= MAX_WAKE_RETRIES) {
          setStatusNote(null);
          return response;
        }
        setStatusNote(
          'Cerkyl is waking up after being idle. This can take up to a minute, please hold on...'
        );
        // Wait before retrying, but stop at once if the student presses Stop.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, WAKE_RETRY_DELAY_MS);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (signal?.aborted) return cancelled;
      }
    };

    // quickActions removed due to TS6133

    const scrollToBottom = useCallback(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
          inline: 'nearest',
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

    // `overrideText` lets the suggestion cards send their prompt directly;
    // setting the input state first wouldn't apply until the next render.
    const handleSendMessage = async (overrideText?: unknown) => {
      const typedText = typeof overrideText === 'string' ? overrideText : inputMessage;
      if ((!typedText.trim() && attachedFiles.length === 0) || !currentConversation) return;

      if (!isAuthenticated && !isGuest && attachedFiles.length > 0) {
        setShowAuthModal(true);
        return;
      }

      const messageText = typedText.trim();
      const filesToSend = [...attachedFiles];

      const isFirstUserMessage = currentMessages.filter((m) => m.isUser).length === 0;

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
        attachments: filesToSend.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      };

      stableAddMessage(newMessage);

      if (
        isFirstUserMessage &&
        messageText &&
        shouldUpdateConversationTitle(currentConversation.title, messageText)
      ) {
        const newTitle = generateConversationTitle(
          messageText,
          universityContext?.name,
          assessmentData
        );
        useAppStore.getState().updateConversation(currentConversation.id, { title: newTitle });
      }

      setTimeout(() => scrollToBottom(), 50);

      await deliverReply({
        text: messageText,
        files: filesToSend,
        conversationId: currentConversation.id,
        isFirstUserMessage,
        userMessageId: newMessage.id,
        context: {
          session_context: {
            message_count: currentMessages.length,
            has_university_preference: !!universityContext,
            timestamp: new Date().toISOString(),
          },
          is_coach_mode: forceCoachMode,
          // Cerkyl's coach question isn't saved yet on the first reply, so
          // send it along for the AI to see what the student is answering.
          ...(forceCoachMode && isFirstUserMessage && { coach_opening: COACH_OPENING }),
        },
      });
    };

    // Gets the reply for a message that's already shown in the chat. Used for
    // new messages and by the Retry button.
    const deliverReply = async (request: ReplyRequest) => {
      const { text: messageText, files: filesToSend, conversationId, isFirstUserMessage } =
        request;
      setIsTyping(true);
      setIsStreamingContent(false);
      setError(null);
      setFailedSend(null);

      const controller = new AbortController();
      activeRequestRef.current = controller;

      let streamingBotId: string | null = null;
      let streamedText = '';
      let streamedSources: any[] = [];
      let streamedConfidence = 0.0;

      const removeStreamingPlaceholder = () => {
        if (streamingBotId) {
          const idToRemove = streamingBotId;
          streamingBotId = null;
          useAppStore.setState((state) => ({
            messages: state.messages.filter((m) => m.id !== idToRemove),
          }));
        }
      };

      const showFailure = (message: string) => {
        removeStreamingPlaceholder();
        setError(message);
        setFailedSend(request);
      };

      const streamCallbacks: StreamCallbacks = {
        onMeta: (meta) => {
          if (controller.signal.aborted) return;
          streamedSources = meta.sources || [];
          streamedConfidence = meta.confidence || 0.0;
          if (streamingBotId) {
            stableUpdateMessage(streamingBotId, {
              sources: streamedSources,
              confidence: streamedConfidence,
            });
          }
        },
        onDelta: (delta) => {
          if (controller.signal.aborted || !delta) return;
          streamedText += delta;
          if (!streamingBotId) {
            streamingBotId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            stableAddMessage({
              id: streamingBotId,
              text: streamedText,
              isUser: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              conversationId,
              sources: streamedSources,
              confidence: streamedConfidence,
            });
            setIsStreamingContent(true);
          } else {
            stableUpdateMessage(streamingBotId, { text: streamedText });
          }
        },
      };

      try {
        const response: EnhancedChatResponse =
          filesToSend.length > 0
            ? await sendMessageWithFiles(
                messageText,
                filesToSend,
                conversationId,
                universityContext?.name,
                controller.signal
              )
            : await sendWithWakeRetry(
                messageText,
                conversationId,
                request.context,
                controller.signal,
                streamCallbacks
              );

        if (controller.signal.aborted || response?.error === 'CANCELLED') {
          // Stopped: take the message (and any partial streamed reply) back out
          // of the chat and put the text back in the box so the student can edit
          // and resend it.
          removeStreamingPlaceholder();
          if (request.userMessageId) {
            useAppStore.setState((state) => ({
              messages: state.messages.filter((m) => m.id !== request.userMessageId),
            }));
          }
          setInputMessage((current) => (current.trim() ? current : messageText));
          if (filesToSend.length > 0) setAttachedFiles(filesToSend);
          return;
        }

        if (response && response.success && response.message) {
          if (streamingBotId) {
            stableUpdateMessage(streamingBotId, {
              text: response.message,
              sources: response.sources || streamedSources,
              confidence: response.confidence ?? streamedConfidence,
            });
          } else {
            const botMessage = {
              id: (Date.now() + 1).toString(),
              text: response.message,
              isUser: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              conversationId,
              sources: response.sources || [],
              confidence: response.confidence || 0.0,
            };

            stableAddMessage(botMessage);
          }

          if (
            response.conversation_title &&
            response.conversation_title !== conversationId &&
            !response.conversation_title.startsWith('conv_') &&
            response.conversation_title !== 'New Conversation' &&
            response.conversation_title !== 'Untitled' &&
            response.conversation_title.trim().length > 0
          ) {
            useAppStore.getState().updateConversation(conversationId, {
              title: response.conversation_title,
            });
          }

          if (isFirstUserMessage) {
            setTimeout(() => {
              stableSaveCurrentConversation()
                .then(() => {
                  window.dispatchEvent(new CustomEvent('conversationsUpdated'));
                })
                .catch((err) => {
                  console.warn('Failed to auto-save for title generation:', err);
                });
            }, 1000);
          } else {
            notifySidebarRefresh();
          }
        } else if (response && response.error === 'AUTHENTICATION_REQUIRED') {
          removeStreamingPlaceholder();
          setShowAuthModal(true);
          setError(null);
        } else {
          showFailure(
            (response && response.message) || "Your message couldn't be sent. Please try again."
          );
        }
      } catch (error) {
        showFailure(
          filesToSend.length > 0 && error instanceof Error && error.message
            ? error.message
            : "Your message couldn't be sent. Please try again."
        );
      } finally {
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
        setIsTyping(false);
        setIsStreamingContent(false);
        setStatusNote(null);
      }
    };

    const handleStop = () => {
      activeRequestRef.current?.abort();
    };

    // Cancel a pending request if the chat closes (new chat, leaving the page).
    useEffect(() => () => activeRequestRef.current?.abort(), []);

    const handleRetry = () => {
      if (!failedSend || isTyping) return;
      deliverReply(failedSend);
    };

    const sendMessageWithFiles = async (
      message: string,
      files: File[],
      conversationId: string,
      universityName?: string,
      signal?: AbortSignal
    ): Promise<EnhancedChatResponse> => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        if (!API_BASE_URL) {
          console.error('API_BASE_URL is not configured');
          throw new Error('API configuration is missing');
        }

        const maxFileSize = 10 * 1024 * 1024;
        const allowedTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        for (const file of files) {
          if (file.size > maxFileSize) {
            throw new Error(`File "${file.name}" is too large. Maximum size is 10MB.`);
          }
          if (!allowedTypes.includes(file.type)) {
            throw new Error(
              `File type "${file.type}" is not supported. Please use images, PDFs, Word documents, Excel files, or text files.`
            );
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
          body: formData,
          signal,
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

        const fileResponsePayload = await response.json();

        return {
          success: true,
          message: fileResponsePayload.reply || fileResponsePayload.message || 'Files processed successfully',
          conversation_title: fileResponsePayload.conversation_title,
          sources: fileResponsePayload.sources || [],
          confidence: fileResponsePayload.confidence || 0.0,
          metadata: fileResponsePayload.metadata || {},
        };
      } catch (error: any) {
        if (signal?.aborted) {
          return { success: false, message: 'Cancelled', error: 'CANCELLED' };
        }
        if (error?.message?.includes('too large')) {
          throw new Error('One or more files are too large. Please use files under 10MB.');
        } else if (error?.message?.includes('not supported')) {
          throw new Error(
            'Please use supported file types: images, PDFs, Word documents, Excel files, or text files.'
          );
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

      const validFiles = files.filter((file) => {
        const validTypes = [
          'application/pdf',
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
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

      setAttachedFiles((prev) => [...prev, ...validFiles]);
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

      const validImages = files.filter((file) => {
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

      setAttachedFiles((prev) => [...prev, ...validImages]);
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
          setAttachedFiles((prev) => [...prev, ...files]);
        }
      };

      document.body.appendChild(cameraInput);
      cameraInput.click();
      document.body.removeChild(cameraInput);
    };

    const removeAttachedFile = (index: number) => {
      setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleBuyForms = () => {
      setShowAttachMenu(false);
      window.location.href = '/forms';
    };

    const handleStartNewConversation = useCallback(() => {
      activeRequestRef.current?.abort();
      if (currentConversation && currentMessages.length > 0) {
        stableSaveCurrentConversation().catch(() => {});
      }

      setSuppressContext(true);

      setProcessedMessages(new Set());
      setInputMessage('');
      setAttachedFiles([]);
      setError(null);
      setFailedSend(null);
      setIsTyping(false);
      setShowAttachMenu(false);

      useAppStore.setState({
        messages: [],
        loading: false,
        error: null,
      });

      startNewConversation();

      setIsInitialized(true);

    }, [
      currentConversation,
      currentMessages.length,
      stableSaveCurrentConversation,
      startNewConversation,
    ]);

    useEffect(() => {
      const handleEvent = () => handleStartNewConversation();
      window.addEventListener('triggerNewChat', handleEvent);
      return () => window.removeEventListener('triggerNewChat', handleEvent);
    }, [handleStartNewConversation]);

    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {/* New chat bar, phones only: on larger screens the sidebar has it. */}
        {currentMessages.length > 0 && (
          <div
            className={`md:hidden px-4 py-2.5 border-b transition-colors duration-200 ${
              theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span
                  className={`text-sm font-medium transition-colors duration-200 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
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

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto scrollbar-hide min-h-0 relative"
        >
          {/* One centred column, like ChatGPT and Claude, so the eye doesn't
              travel across the whole screen. Shares its width with the input. */}
          <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-7">
          <AnimatePresence mode="popLayout">
            {currentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center w-full min-h-[60vh] py-8">
                <img src="/cerkyl.svg" alt="" className="w-12 h-12 mb-5 object-contain" />
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3 text-gray-900 dark:text-white">
                  Thinking about your future,{' '}
                  <span className="text-primary-600 dark:text-primary-400">
                    {user?.name?.split(' ')[0] || 'Guest'}
                  </span>
                  ?
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mb-10 text-base md:text-lg">
                  Ask me anything about universities and admissions in Ghana.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                  {[
                    {
                      icon: FiSearch,
                      title: 'Explore programmes',
                      subtitle: 'Find courses that match your interests',
                      prompt: 'I want to explore university programs',
                    },
                    {
                      icon: FiFile,
                      title: 'Admission requirements',
                      subtitle: 'Cut-off points, subjects and documents',
                      prompt: 'What are the admission requirements?',
                    },
                    {
                      icon: FiUsers,
                      title: 'Compare schools',
                      subtitle: 'KNUST and UG side by side',
                      prompt: 'Compare KNUST and UG',
                    },
                    {
                      icon: FiStar,
                      title: 'Career coach',
                      subtitle: "Work out what you're good at",
                      prompt: null,
                    },
                  ].map((card) => (
                    <button
                      key={card.title}
                      onClick={() =>
                        card.prompt
                          ? handleSendMessage(card.prompt)
                          : navigate('/chat', {
                              state: { forceNewConversation: true, forceCoachMode: true },
                            })
                      }
                      disabled={isTyping || isGuest}
                      className="group flex items-start gap-3 p-4 text-left rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="shrink-0 w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                        <card.icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {card.title}
                        </span>
                        <span className="block text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                          {card.subtitle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              currentMessages.map((message) => (
                <motion.div
                  key={`message-${message.id}-${message.conversationId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChatBubble message={message} />
                </motion.div>
              ))
            )}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isTyping && !isStreamingContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3"
            >
              <CerkylAvatar />
              <div className="pt-0.5">
                <TypingDots label={statusNote || undefined} />
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          {error && !isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="ml-11 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            >
              <span>{error}</span>
              {failedSend && failedSend.conversationId === currentConversation?.id && (
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg font-medium bg-white dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/70 transition-colors"
                >
                  <FiRefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </motion.div>
          )}

          <div ref={messagesEndRef} />
          </div>

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
                className="fixed bottom-32 right-8 z-10 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
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
          <div
            className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-2"
          >
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
        <div
          className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-2 pb-4 flex flex-col items-center"
        >
          <div
            className="w-full flex items-end gap-2 rounded-3xl px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm focus-within:border-primary-400 dark:focus-within:border-primary-600 focus-within:shadow-md transition-all duration-200"
          >
            {/* Attach Button (+) */}
            <div className="relative pb-0.5">
              <button
                aria-label="Attach files"
                onClick={() => {
                  if (!isGuest) setShowAttachMenu(!showAttachMenu);
                }}
                className={`p-1 rounded-full transition-all duration-200 ${
                  theme === 'dark'
                    ? 'text-gray-400 hover:text-white'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border border-dashed ${
                    theme === 'dark' ? 'border-gray-500' : 'border-gray-400'
                  }`}
                >
                  <span className="text-lg leading-none mb-0.5">+</span>
                </div>
              </button>
            </div>

            <div className="flex-1 relative flex items-center min-h-[40px] py-1.5">
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
                    if (
                      (inputMessage.trim() || attachedFiles.length > 0) &&
                      !isTyping &&
                      !isGuest
                    ) {
                      handleSendMessage();
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                    }
                  }
                }}
                placeholder={isGuest ? 'Log in to chat with CERKYL' : 'Message CERKYL...'}
                rows={1}
                className={`w-full px-2 bg-transparent focus:outline-none text-[15px] transition-all duration-200 resize-none max-h-[120px] scrollbar-hide py-1 ${
                  theme === 'dark'
                    ? 'text-white placeholder-gray-500'
                    : 'text-gray-900 placeholder-gray-400'
                } ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isGuest}
                style={{ minHeight: '24px' }}
              />
            </div>

            <div className="flex items-center pb-0.5">
              {isTyping ? (
                <button
                  onClick={handleStop}
                  aria-label="Stop"
                  title="Stop"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-900 hover:bg-gray-700 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-gray-900 shadow-sm transition-colors"
                >
                  <FiSquare className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!(inputMessage.trim() || attachedFiles.length > 0) || isGuest}
                  aria-label="Send message"
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 ${
                    (inputMessage.trim() || attachedFiles.length > 0) && !isGuest
                      ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  <FiSend className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs mt-2.5 text-gray-400 dark:text-gray-500 text-center">
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
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-t border-gray-700'
                    : 'bg-white border-t border-gray-200'
                }`}
              >
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-2">
                  <div
                    className={`w-12 h-1 rounded-full ${
                      theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`}
                  />
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
                      <div
                        className={`p-2 rounded-full mb-1.5 ${
                          theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'
                        }`}
                      >
                        <FiImage
                          className={`w-4 h-4 ${
                            theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                          }`}
                        />
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
                      <div
                        className={`p-2 rounded-full mb-1.5 ${
                          theme === 'dark' ? 'bg-green-500/20' : 'bg-green-100'
                        }`}
                      >
                        <FiFile
                          className={`w-4 h-4 ${
                            theme === 'dark' ? 'text-green-400' : 'text-green-600'
                          }`}
                        />
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
                      <div
                        className={`p-2 rounded-full mb-1.5 ${
                          theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'
                        }`}
                      >
                        <FiCamera
                          className={`w-4 h-4 ${
                            theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                          }`}
                        />
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
                      <div
                        className={`p-2 rounded-full mb-1.5 ${
                          theme === 'dark' ? 'bg-orange-500/20' : 'bg-orange-100'
                        }`}
                      >
                        <FiShoppingCart
                          className={`w-4 h-4 ${
                            theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
                          }`}
                        />
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
  }
);

ChatBot.displayName = 'ChatBot';

export default ChatBot;
