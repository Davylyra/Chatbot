import { useToast } from './useToast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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
          ...additionalContext
        }
      };

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const endpoint = token ? `${API_BASE_URL}/chat/send` : `${API_BASE_URL}/chat/demo`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        credentials: 'include'
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response format from server');
      }

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        
        if (data?.requiresAuth) {
          showError('Authentication Required', data.message || 'Please log in to continue.');
          return {
            success: false,
            message: 'Authentication required. Please log in to access this feature.',
            error: 'AUTHENTICATION_REQUIRED',
            requiresAuth: true
          };
        }
        
        const demoResponse = await fetch(`${API_BASE_URL}/chat/demo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestPayload)
        });
        
        const demoData = await demoResponse.json();
        if (demoResponse.ok && demoData.success) {
          showError('Session Expired', 'Continued in demo mode. Please log in for full features.');
          return {
            success: true,
            message: demoData.reply || demoData.message,
            sources: demoData.sources || [],
            confidence: demoData.confidence || 0.0,
            timestamp: demoData.timestamp || new Date().toISOString(),
            metadata: { ...demoData.metadata, demo_mode: true }
          };
        }
      }

      if (!response.ok) {
        console.error('HTTP error response:', {
          status: response.status,
          statusText: response.statusText,
          data
        });
        
        throw new Error(data?.message || `HTTP error! status: ${response.status}`);
      }
      
      if (!data.success) {
        const errorMessage = data.message || data.reply || 'Error sending message';
        console.warn('Backend returned success=false:', errorMessage);
        showError('Chat Error', errorMessage);
        
        return { 
          success: false, 
          message: errorMessage,
          error: data.error || 'BACKEND_ERROR'
        };
      }

      if (data.fallback_mode) {
        showError('Limited Response', 'AI service temporarily unavailable. Showing cached knowledge.');
      } else if (data.confidence && data.confidence > 0.9) {
        showSuccess('High Confidence', 'Response generated with high confidence');
      }

      return { 
        success: true, 
        message: data.reply || data.message || 'Response received from assistant.',
        conversation_title: data.conversation_title,
        sources: data.sources || [],
        confidence: data.confidence || 0.0,
        timestamp: data.timestamp || new Date().toISOString(),
        metadata: {
          ...data.metadata,
          fallback_mode: data.fallback_mode || false,
          rag_error: data.rag_error || null
        }
      };

    } catch (error) {
      console.error('Enhanced chat error with details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      let userFriendlyMessage = 'Unable to send message. Please try again.';
      let errorCategory = 'UNKNOWN_ERROR';

      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          userFriendlyMessage = 'Connection problem. Please check your internet and try again.';
          errorCategory = 'NETWORK_ERROR';
        } 
        else if (error.message.includes('timeout') || error.message.includes('aborted')) {
          userFriendlyMessage = 'Request timed out. The server is taking too long to respond. Please try again.';
          errorCategory = 'TIMEOUT_ERROR';
        }
        else if (error.message.includes('HTTP') || error.message.includes('status:')) {
          userFriendlyMessage = `Server error: ${error.message}. Please try again later.`;
          errorCategory = 'HTTP_ERROR';
        }
        else if (error.message.includes('JSON') || error.message.includes('parse')) {
          userFriendlyMessage = 'Received invalid response from server. Please try again.';
          errorCategory = 'PARSE_ERROR';
        }
        else if (!error.message.includes('TypeError') && !error.message.includes('undefined')) {
          userFriendlyMessage = error.message;
          errorCategory = 'CUSTOM_ERROR';
        }
      }

      console.error(`Error category: ${errorCategory}`);
      showError('Connection Error', userFriendlyMessage);
      
      return { 
        success: false, 
        message: `I'm having trouble connecting right now. ${userFriendlyMessage}`,
        error: errorCategory
      };
    }
  };

  const searchUniversities = async (query: string) => {
    try {
      const _token = localStorage.getItem('token');
      
      if (!_token) {
        return { success: false, universities: [] };
      }

      const response = await fetch(`${API_BASE_URL}/universities/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${_token}`
        },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      
      return {
        success: response.ok,
        universities: data.universities || [],
        total: data.total || 0
      };

    } catch (error) {
      console.error('University search error:', error);
      return { success: false, universities: [] };
    }
  };

  const getScholarships = async () => {
    try {
      const _token = localStorage.getItem('token');
      
      if (!_token) {
        return { success: false, scholarships: [] };
      }

      const response = await fetch(`${API_BASE_URL}/scholarships`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${_token}`
        }
      });

      const data = await response.json();
      
      return {
        success: response.ok,
        scholarships: data.scholarships || [],
        total: data.total || 0
      };

    } catch (error) {
      console.error('Scholarships fetch error:', error);
      return { success: false, scholarships: [] };
    }
  };

  return { 
    sendMessage, 
    searchUniversities, 
    getScholarships 
  };
};
