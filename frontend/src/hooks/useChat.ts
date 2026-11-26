import { useToast } from "./useToast";

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
    response_type?: "local_knowledge" | "hybrid_search";
    processing_info?: any;
    message_count?: number;
    fallback_mode?: boolean;
  };
  error?: string;
  requiresAuth?: boolean;
  // True when sending again may work (the AI service was waking up, the
  // connection dropped, or the server hit a temporary error).
  retryable?: boolean;
}

export interface StreamCallbacks {
  onMeta?: (meta: { sources?: ChatSource[]; confidence?: number }) => void;
  onDelta?: (text: string) => void;
}

export const useChat = () => {
  const { showError, showSuccess } = useToast();

  const sendMessage = async (
    message: string,
    conversationId: string,
    universityName?: string,
    additionalContext?: any,
    // Aborting this (the Stop button) cancels the request.
    signal?: AbortSignal,
  ): Promise<EnhancedChatResponse> => {
    try {
      const token = localStorage.getItem("token");

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
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const endpoint = token
        ? `${API_BASE_URL}/chat/send`
        : `${API_BASE_URL}/chat/demo`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload),
        credentials: "include",
        signal,
      });

      const chatResponse = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");

        if (chatResponse?.requiresAuth) {
          showError(
            "Authentication Required",
            chatResponse.message || "Please log in to continue.",
          );
          return {
            success: false,
            message:
              "Authentication required. Please log in to access this feature.",
            error: "AUTHENTICATION_REQUIRED",
            requiresAuth: true,
          };
        }

        const demoResponse = await fetch(`${API_BASE_URL}/chat/demo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        const demoPayload = await demoResponse.json();
        if (demoResponse.ok && demoPayload.success) {
          showError(
            "Session Expired",
            "Continued in demo mode. Please log in for full features.",
          );
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

      if (!response.ok && chatResponse?.retryable) {
        return {
          success: false,
          message: chatResponse.message || "Your message couldn't be sent.",
          error: chatResponse.error || "AI_UNAVAILABLE",
          retryable: true,
        };
      }

      if (!response.ok) {
        console.error(
          "HTTP error response:",
          response.status,
          response.statusText,
        );
        throw new Error(
          chatResponse?.message || `HTTP error! status: ${response.status}`,
        );
      }

      if (!chatResponse.success) {
        const errorMessage =
          chatResponse.message || chatResponse.reply || "Error sending message";
        console.warn("Backend returned success=false:", errorMessage);
        showError("Chat Error", errorMessage);

        return {
          success: false,
          message: errorMessage,
          error: chatResponse.error || "BACKEND_ERROR",
        };
      }

      if (chatResponse.fallback_mode) {
        showError(
          "Limited Response",
          "AI service temporarily unavailable. Showing cached knowledge.",
        );
      } else if (chatResponse.confidence && chatResponse.confidence > 0.9) {
        showSuccess(
          "High Confidence",
          "Response generated with high confidence",
        );
      }

      return {
        success: true,
        message:
          chatResponse.reply ||
          chatResponse.message ||
          "Response received from assistant.",
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
      if (signal?.aborted) {
        return { success: false, message: "Cancelled", error: "CANCELLED" };
      }
      console.error("Chat send failed:", networkError);

      let userFriendlyMessage = "Unable to send message. Please try again.";
      let errorCategory = "UNKNOWN_ERROR";

      if (networkError instanceof Error) {
        if (
          networkError.message.includes("fetch") ||
          networkError.message.includes("Failed to fetch")
        ) {
          userFriendlyMessage =
            "Connection problem. Please check your internet and try again.";
          errorCategory = "NETWORK_ERROR";
        } else if (
          networkError.message.includes("timeout") ||
          networkError.message.includes("aborted")
        ) {
          userFriendlyMessage =
            "Request timed out. The server is taking too long to respond. Please try again.";
          errorCategory = "TIMEOUT_ERROR";
        } else if (
          networkError.message.includes("HTTP") ||
          networkError.message.includes("status:")
        ) {
          userFriendlyMessage = `Server error: ${networkError.message}. Please try again later.`;
          errorCategory = "HTTP_ERROR";
        } else if (
          networkError.message.includes("JSON") ||
          networkError.message.includes("parse")
        ) {
          userFriendlyMessage =
            "Received invalid response from server. Please try again.";
          errorCategory = "PARSE_ERROR";
        } else if (
          !networkError.message.includes("TypeError") &&
          !networkError.message.includes("undefined")
        ) {
          userFriendlyMessage = networkError.message;
          errorCategory = "CUSTOM_ERROR";
        }
      }

      console.error(`Error category: ${errorCategory}`);

      // The chat shows this inline with a retry button, so no toast here.
      return {
        success: false,
        message: userFriendlyMessage,
        error: errorCategory,
        retryable: true,
      };
    }
  };

  const searchUniversities = async (query: string) => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        return { success: false, universities: [] };
      }

      const response = await fetch(`${API_BASE_URL}/universities/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      console.error("University search error:", searchError);
      return { success: false, universities: [] };
    }
  };

  const getScholarships = async () => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        return { success: false, scholarships: [] };
      }

      const response = await fetch(`${API_BASE_URL}/scholarships`, {
        method: "GET",
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
      console.error("Scholarships fetch error:", fetchError);
      return { success: false, scholarships: [] };
    }
  };

  const sendMessageStream = async (
    message: string,
    conversationId: string,
    universityName?: string,
    additionalContext?: any,
    signal?: AbortSignal,
    callbacks?: StreamCallbacks,
  ): Promise<EnhancedChatResponse> => {
    const token = localStorage.getItem("token");
    if (!token) {
      return sendMessage(
        message,
        conversationId,
        universityName,
        additionalContext,
        signal,
      );
    }

    try {
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

      const response = await fetch(`${API_BASE_URL}/chat/send-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestPayload),
        credentials: "include",
        signal,
      });

      // Fall back cleanly to non-streaming /send if /send-stream is not deployed.
      if (response.status === 404) {
        return sendMessage(
          message,
          conversationId,
          universityName,
          additionalContext,
          signal,
        );
      }

      const contentType = response.headers.get("content-type") || "";

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");
        const errorBody = await response.json().catch(() => ({}));

        if (errorBody?.requiresAuth) {
          showError(
            "Authentication Required",
            errorBody.message || "Please log in to continue.",
          );
          return {
            success: false,
            message:
              "Authentication required. Please log in to access this feature.",
            error: "AUTHENTICATION_REQUIRED",
            requiresAuth: true,
          };
        }

        return sendMessage(
          message,
          conversationId,
          universityName,
          additionalContext,
          signal,
        );
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (errorBody?.retryable) {
          return {
            success: false,
            message: errorBody.message || "Your message couldn't be sent.",
            error: errorBody.error || "AI_UNAVAILABLE",
            retryable: true,
          };
        }
        throw new Error(
          errorBody?.message || `HTTP error! status: ${response.status}`,
        );
      }

      if (!contentType.includes("text/event-stream") || !response.body) {
        const jsonBody = await response.json().catch(() => null);
        if (jsonBody && jsonBody.success) {
          return {
            success: true,
            message:
              jsonBody.reply ||
              jsonBody.message ||
              "Response received from assistant.",
            conversation_title: jsonBody.conversation_title,
            sources: jsonBody.sources || [],
            confidence: jsonBody.confidence || 0.0,
            timestamp: jsonBody.timestamp || new Date().toISOString(),
          };
        }
        return sendMessage(
          message,
          conversationId,
          universityName,
          additionalContext,
          signal,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedText = "";
      let finalReply = "";
      let finalSources: ChatSource[] = [];
      let finalConfidence = 0.0;
      let finalTimestamp = new Date().toISOString();
      let conversationTitle: string | undefined;
      let streamError: EnhancedChatResponse | null = null;

      const handleSseBlock = (block: string) => {
        const lines = block.split("\n");
        let eventName = "message";
        const dataLines: string[] = [];

        for (const line of lines) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (dataLines.length === 0) return;
        let parsed: any;
        try {
          parsed = JSON.parse(dataLines.join("\n"));
        } catch {
          parsed = { text: dataLines.join("\n") };
        }

        if (eventName === "meta") {
          finalSources = Array.isArray(parsed.sources) ? parsed.sources : [];
          finalConfidence =
            typeof parsed.confidence === "number" ? parsed.confidence : 0.0;
          callbacks?.onMeta?.({
            sources: finalSources,
            confidence: finalConfidence,
          });
        } else if (eventName === "delta") {
          const textChunk = typeof parsed.text === "string" ? parsed.text : "";
          if (textChunk) {
            accumulatedText += textChunk;
            callbacks?.onDelta?.(textChunk);
          }
        } else if (eventName === "done") {
          if (typeof parsed.reply === "string") finalReply = parsed.reply;
          else if (typeof parsed.message === "string")
            finalReply = parsed.message;
          if (Array.isArray(parsed.sources)) finalSources = parsed.sources;
          if (typeof parsed.confidence === "number")
            finalConfidence = parsed.confidence;
          if (parsed.timestamp) finalTimestamp = parsed.timestamp;
          if (parsed.conversation_title)
            conversationTitle = parsed.conversation_title;
        } else if (eventName === "error") {
          streamError = {
            success: false,
            message:
              parsed.message || "Your message couldn't be sent. Please try again.",
            error: parsed.error || "AI_UNAVAILABLE",
            retryable: parsed.retryable ?? true,
          };
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (signal?.aborted) {
            reader.cancel().catch(() => {});
            return { success: false, message: "Cancelled", error: "CANCELLED" };
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (block.trim()) {
              handleSseBlock(block);
            }
            boundary = buffer.indexOf("\n\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          handleSseBlock(buffer.replace(/\r\n/g, "\n"));
        }
      } finally {
        reader.releaseLock();
      }

      if (signal?.aborted) {
        return { success: false, message: "Cancelled", error: "CANCELLED" };
      }

      if (streamError) {
        return streamError;
      }

      const replyText = finalReply || accumulatedText;
      if (!replyText) {
        return {
          success: false,
          message: "Cerkyl couldn't answer that just now. Please try again.",
          error: "AI_UNAVAILABLE",
          retryable: true,
        };
      }

      return {
        success: true,
        message: replyText,
        conversation_title: conversationTitle,
        sources: finalSources,
        confidence: finalConfidence,
        timestamp: finalTimestamp,
      };
    } catch (networkError) {
      if (signal?.aborted) {
        return { success: false, message: "Cancelled", error: "CANCELLED" };
      }
      console.error("Chat stream failed:", networkError);

      let userFriendlyMessage = "Unable to send message. Please try again.";
      let errorCategory = "UNKNOWN_ERROR";

      if (networkError instanceof Error) {
        if (
          networkError.message.includes("fetch") ||
          networkError.message.includes("Failed to fetch")
        ) {
          userFriendlyMessage =
            "Connection problem. Please check your internet and try again.";
          errorCategory = "NETWORK_ERROR";
        } else if (
          networkError.message.includes("timeout") ||
          networkError.message.includes("aborted")
        ) {
          userFriendlyMessage =
            "Request timed out. The server is taking too long to respond. Please try again.";
          errorCategory = "TIMEOUT_ERROR";
        } else if (
          networkError.message.includes("HTTP") ||
          networkError.message.includes("status:")
        ) {
          userFriendlyMessage = `Server error: ${networkError.message}. Please try again later.`;
          errorCategory = "HTTP_ERROR";
        } else if (
          !networkError.message.includes("TypeError") &&
          !networkError.message.includes("undefined")
        ) {
          userFriendlyMessage = networkError.message;
          errorCategory = "CUSTOM_ERROR";
        }
      }

      return {
        success: false,
        message: userFriendlyMessage,
        error: errorCategory,
        retryable: true,
      };
    }
  };

  return {
    sendMessage,
    sendMessageStream,
    searchUniversities,
    getScholarships,
  };
};
