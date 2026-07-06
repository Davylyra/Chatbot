import { useToast } from './useToast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface ChatSource {
  id: number;
  source: string;
  url: string;
  date: string;
  confidence: number;
}

export interface EnhancedChatResponse {
  success: boolean;
  message: string;
  conversation_title?: string;
  sources?: ChatSource[];
  confidence?: number;
  timestamp?: string;
  metadata?: {
    university_context?: string;
    response_type?: 'local_knowledge' | 'hybrid_search';
    processing_info?: any;
    message_count?: number;
    fallback_mode?: boolean;
  };
  error?: string;
  requiresAuth?: boolean;
}

export const useChat = () => {
  const { showError, showSuccess } = useToast();

  const sendMessage = async (
    message: string,
    conversationId: string,
    universityName?: string,
    additionalContext?: any
  ): Promise<EnhancedChatResponse> => {
    try {
      const token = localStorage.getItem('token');

      const requestPayload = {
        message,
        conversation_id: conversationId,
        university_name: universityName || null,
        user_context: {
          preferred_university: universityName,
          timestamp: new Date().toISOString(),
          ...additionalContext,
        },
      };

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const endpoint = token ? `${API_BASE_URL}/chat/send` : `${API_BASE_URL}/chat/demo`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        credentials: 'include',
      });

      const chatResponse = await response.json().catch(() => {
        throw new Error('Invalid response format from server');
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');

        if (chatResponse?.requiresAuth) {
          showError('Authentication Required', chatResponse.message || 'Please log in to continue.');
          return {
            success: false,
            message: 'Authentication required. Please log in to access this feature.',
            error: 'AUTHENTICATION_REQUIRED',
            requiresAuth: true,
          };
        }

        const demoResponse = await fetch(`${API_BASE_URL}/chat/demo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        const demoPayload = await demoResponse.json();
        if (demoResponse.ok && demoPayload.success) {
          showError('Session Expired', 'Continued in demo mode. Please log in for full features.');
          return {
            success: true,
            message: demoPayload.reply || demoPayload.message,
            sources: demoPayload.sources || [],
            confidence: demoPayload.confidence || 0.0,
            timestamp: demoPayload.timestamp || new Date().toISOString(),
            metadata: { ...demoPayload.metadata, demo_mode: true },
          };
        }
      }

      if (!response.ok) {
        console.error('HTTP error response:', response.status, response.statusText);
        throw new Error(chatResponse?.message || `HTTP error! status: ${response.status}`);
      }

      if (!chatResponse.success) {
        const errorMessage = chatResponse.message || chatResponse.reply || 'Error sending message';
        console.warn('Backend returned success=false:', errorMessage);
        showError('Chat Error', errorMessage);

        return {
          success: false,
          message: errorMessage,
          error: chatResponse.error || 'BACKEND_ERROR',
        };
      }

      if (chatResponse.fallback_mode) {
        showError(
          'Limited Response',
          'AI service temporarily unavailable. Showing cached knowledge.'
        );
      } else if (chatResponse.confidence && chatResponse.confidence > 0.9) {
        showSuccess('High Confidence', 'Response generated with high confidence');
      }

      return {
        success: true,
        message: chatResponse.reply || chatResponse.message || 'Response received from assistant.',
        conversation_title: chatResponse.conversation_title,
        sources: chatResponse.sources || [],
        confidence: chatResponse.confidence || 0.0,
        timestamp: chatResponse.timestamp || new Date().toISOString(),
        metadata: {
          ...chatResponse.metadata,
          fallback_mode: chatResponse.fallback_mode || false,
          rag_error: chatResponse.rag_error || null,
        },
      };
    } catch (networkError) {
      console.error('Chat send failed:', networkError);

      let userFriendlyMessage = 'Unable to send message. Please try again.';
      let errorCategory = 'UNKNOWN_ERROR';

      if (networkError instanceof Error) {
        if (networkError.message.includes('fetch') || networkError.message.includes('Failed to fetch')) {
          userFriendlyMessage = 'Connection problem. Please check your internet and try again.';
          errorCategory = 'NETWORK_ERROR';
        } else if (networkError.message.includes('timeout') || networkError.message.includes('aborted')) {
          userFriendlyMessage =
            'Request timed out. The server is taking too long to respond. Please try again.';
          errorCategory = 'TIMEOUT_ERROR';
        } else if (networkError.message.includes('HTTP') || networkError.message.includes('status:')) {
          userFriendlyMessage = `Server error: ${networkError.message}. Please try again later.`;
          errorCategory = 'HTTP_ERROR';
        } else if (networkError.message.includes('JSON') || networkError.message.includes('parse')) {
          userFriendlyMessage = 'Received invalid response from server. Please try again.';
          errorCategory = 'PARSE_ERROR';
        } else if (!networkError.message.includes('TypeError') && !networkError.message.includes('undefined')) {
          userFriendlyMessage = networkError.message;
          errorCategory = 'CUSTOM_ERROR';
        }
      }

      console.error(`Error category: ${errorCategory}`);
      showError('Connection Error', userFriendlyMessage);

      return {
        success: false,
        message: `I'm having trouble connecting right now. ${userFriendlyMessage}`,
        error: errorCategory,
      };
    }
  };

  const searchUniversities = async (query: string) => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        return { success: false, universities: [] };
      }

      const response = await fetch(`${API_BASE_URL}/universities/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
      });

      const searchPayload = await response.json();

      return {
        success: response.ok,
        universities: searchPayload.universities || [],
        total: searchPayload.total || 0,
      };
    } catch (searchError) {
      console.error('University search error:', searchError);
      return { success: false, universities: [] };
    }
  };

  const getScholarships = async () => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        return { success: false, scholarships: [] };
      }

      const response = await fetch(`${API_BASE_URL}/scholarships`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const scholarshipPayload = await response.json();

      return {
        success: response.ok,
        scholarships: scholarshipPayload.scholarships || [],
        total: scholarshipPayload.total || 0,
      };
    } catch (fetchError) {
      console.error('Scholarships fetch error:', fetchError);
      return { success: false, scholarships: [] };
    }
  };

  return {
    sendMessage,
    searchUniversities,
    getScholarships,
  };
};
