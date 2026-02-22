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
  conversation_title?: string; // Add conversation title from backend
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

  // FIXED: Enhanced sendMessage with proper authentication and token management
  const sendMessage = async (
    message: string, 
    conversationId: string, 
    universityName?: string,
    additionalContext?: any
  ): Promise<EnhancedChatResponse> => {
    try {
      const token = localStorage.getItem('token');
      console.log('🔐 FIXED: Sending message with auth check:', !!token);

      console.log('📤 FIXED: Sending enhanced message:', { 
        message: message.substring(0, 100), 
        conversationId, 
        universityName,
        hasContext: !!additionalContext,
        hasToken: !!token
      });

      // Prepare enhanced request payload
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

      // FIXED: Prepare headers with proper authentication
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      // FIXED: Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // FIXED: Use correct endpoint based on authentication
      const endpoint = token ? `${API_BASE_URL}/chat/send` : `${API_BASE_URL}/chat/demo`;
      console.log('📤 FIXED: Sending to endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        credentials: 'include'
      });

      console.log('📥 FIXED: Enhanced backend response status:', response.status);

      // ✅ CRITICAL FIX: Parse response body ONCE to avoid "Response body is already used" error
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ FIXED: Failed to parse response JSON:', parseError);
        throw new Error('Invalid response format from server');
      }

      // FIXED: Handle authentication errors specifically and trigger auth modal
      if (response.status === 401 || response.status === 403) {
        console.log('🔒 FIXED: Authentication failed, clearing token');
        localStorage.removeItem('token');
        
        // If this requires auth, we should show the auth modal
        if (data?.requiresAuth) {
          showError('Authentication Required', data.message || 'Please log in to continue.');
          return {
            success: false,
            message: 'Authentication required. Please log in to access this feature.',
            error: 'AUTHENTICATION_REQUIRED',
            requiresAuth: true
          };
        }
        
        // Otherwise, retry with demo endpoint
        console.log('🔄 FIXED: Retrying with demo endpoint');
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
        // ✅ FIXED: Enhanced HTTP error handling with data already parsed
        console.error('❌ FIXED: HTTP error response:', {
          status: response.status,
          statusText: response.statusText,
          data
        });
        
        throw new Error(data?.message || `HTTP error! status: ${response.status}`);
      }
      
      console.log('📥 FIXED: Enhanced backend response:', {
        success: data.success,
        confidence: data.confidence,
        sources_count: data.sources?.length || 0,
        response_type: data.metadata?.response_type,
        fallback_mode: data.fallback_mode || false,
        rag_error: data.rag_error || null
      });

      // ✅ FIXED: Even if backend says "success: false", try to extract a message
      if (!data.success) {
        const errorMessage = data.message || data.reply || 'Error sending message';
        console.warn('⚠️ FIXED: Backend returned success=false:', errorMessage);
        showError('Chat Error', errorMessage);
        
        return { 
          success: false, 
          message: errorMessage,
          error: data.error || 'BACKEND_ERROR'
        };
      }

      // ✅ FIXED: Show fallback mode indicator if applicable
      if (data.fallback_mode) {
        console.log('⚠️ FIXED: Response generated in fallback mode');
        showError('Limited Response', 'AI service temporarily unavailable. Showing cached knowledge.');
      } else if (data.confidence && data.confidence > 0.9) {
        // Show success feedback with context
        showSuccess('High Confidence', 'Response generated with high confidence');
      }

      // ✅ FIXED: Return enhanced response data with guaranteed message
      return { 
        success: true, 
        message: data.reply || data.message || 'Response received from assistant.',
        conversation_title: data.conversation_title, // Include conversation title from backend
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
      // ✅ FIXED: Comprehensive error handling with detailed logging
      console.error('❌ FIXED: Enhanced chat error with details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      let userFriendlyMessage = 'Unable to send message. Please try again.';
      let errorCategory = 'UNKNOWN_ERROR';

      if (error instanceof Error) {
        // Network/connection errors
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          userFriendlyMessage = 'Connection problem. Please check your internet and try again.';
          errorCategory = 'NETWORK_ERROR';
        } 
        // Timeout errors
        else if (error.message.includes('timeout') || error.message.includes('aborted')) {
          userFriendlyMessage = 'Request timed out. The server is taking too long to respond. Please try again.';
          errorCategory = 'TIMEOUT_ERROR';
        }
        // HTTP errors
        else if (error.message.includes('HTTP') || error.message.includes('status:')) {
          userFriendlyMessage = `Server error: ${error.message}. Please try again later.`;
          errorCategory = 'HTTP_ERROR';
        }
        // Parse errors
        else if (error.message.includes('JSON') || error.message.includes('parse')) {
          userFriendlyMessage = 'Received invalid response from server. Please try again.';
          errorCategory = 'PARSE_ERROR';
        }
        // Use the error message if it's already user-friendly
        else if (!error.message.includes('TypeError') && !error.message.includes('undefined')) {
          userFriendlyMessage = error.message;
          errorCategory = 'CUSTOM_ERROR';
        }
      }

      console.error(`❌ FIXED: Error category: ${errorCategory}`);
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
      console.error('❌ University search error:', error);
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
      console.error('❌ Scholarships fetch error:', error);
      return { success: false, scholarships: [] };
    }
  };

  return { 
    sendMessage, 
    searchUniversities, 
    getScholarships 
  };
};
