/**
 * Conversation Title Generation Utilities
 *
 * Provides consistent, professional title generation for all conversations.
 * Titles are generated from the FIRST user message to ensure:
 * - Brief and concise (max 7 words)
 * - One sentence only
 * - Precise and professional
 */

/**
 * Generate a professional conversation title from the FIRST user message
 * Ensures title is brief, concise, and one sentence (max 7 words)
 * @param firstMessage - The FIRST message sent by the user (primary source for title)
 * @param universityContext - Optional university name for context-based titles
 * @param assessmentData - Optional assessment data for assessment-based titles
 * @returns A brief, concise, one-sentence conversation title (max 7 words)
 */
export function generateConversationTitle(
  firstMessage?: string,
  universityContext?: string,
  assessmentData?: any,
): string {
  if (assessmentData) {
    const interests =
      assessmentData.interests?.slice(0, 2).join(", ") || "interests";
    return `Assessment: ${interests}`;
  }

  if (universityContext) {
    if (firstMessage && firstMessage.trim()) {
      const cleanMessage = cleanMessageForTitle(firstMessage);
      if (cleanMessage.length > 5) {
        return `${universityContext}: ${cleanMessage}`;
      }
    }
    return `${universityContext} Admissions`;
  }

  if (firstMessage && firstMessage.trim()) {
    const cleanMessage = cleanMessageForTitle(firstMessage);
    if (cleanMessage.length > 5) {
      return cleanMessage;
    }
  }

  const hour = new Date().getHours();
  let timeOfDay = "Morning";
  if (hour >= 12 && hour < 17) timeOfDay = "Afternoon";
  else if (hour >= 17) timeOfDay = "Evening";

  return `${timeOfDay} Consultation`;
}

function cleanMessageForTitle(message: string): string {
  let cleaned = message.replace(/\s+/g, " ").trim();

  const firstSentenceMatch = cleaned.match(/^[^.!?;]+/);
  if (firstSentenceMatch) {
    cleaned = firstSentenceMatch[0].trim();
  }

  const prefixesToRemove = [
    "tell me about",
    "i want to know about",
    "can you help me with",
    "what is",
    "what are",
    "how do i",
    "how can i",
    "please tell me",
    "i need help with",
    "can you tell me",
    "i would like to know",
  ];

  const lowerCleaned = cleaned.toLowerCase();
  for (const prefix of prefixesToRemove) {
    if (lowerCleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length).trim();
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      break;
    }
  }

  const words = cleaned.split(/\s+/);
  if (words.length > 7) {
    cleaned = words.slice(0, 7).join(" ");
  }

  if (cleaned.length > 50) {
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 30) {
      cleaned = truncated.substring(0, lastSpace);
    } else {
      cleaned = truncated;
    }
  }

  cleaned = cleaned.replace(/[?!.,;:]+$/, "");

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

const SMALL_TALK_WORDS = new Set([
  "hi", "hello", "hey", "hiya", "yo", "sup", "good", "morning", "afternoon",
  "evening", "day", "thanks", "thank", "you", "u", "ok", "okay", "cool",
  "nice", "great", "bye", "goodbye", "how", "are", "doing", "there",
  "cerkyl", "bot", "bro", "charley", "chale", "sir", "madam", "please",
  "whats", "up", "what's", "fine", "alright",
]);

export function isSmallTalkMessage(message?: string): boolean {
  const words = String(message || "").toLowerCase().match(/[a-z']+/g) || [];
  return words.length === 0 || (words.length <= 6 && words.every((w) => SMALL_TALK_WORDS.has(w)));
}

export function shouldUpdateConversationTitle(
  currentTitle: string,
  userMessage?: string,
): boolean {
  if (!userMessage || userMessage.trim().length <= 5 || isSmallTalkMessage(userMessage)) {
    return false;
  }

  const normalized = String(currentTitle || "").trim().toLowerCase();
  const alwaysUpdateTitles = new Set([
    "",
    "new chat",
    "new conversation",
    "morning consultation",
    "afternoon consultation",
    "evening consultation",
    "university consultation",
    "untitled",
    "untitled conversation",
    "conversation",
    "general greeting",
    "greeting",
    "friendly greeting",
    "casual greeting",
  ]);

  if (alwaysUpdateTitles.has(normalized) || /\bgreeting\b/.test(normalized)) {
    return true;
  }

  if (currentTitle.endsWith(" Admissions")) {
    return true;
  }

  if (currentTitle.startsWith("Assessment: ")) {
    return true;
  }

  return false;
}
