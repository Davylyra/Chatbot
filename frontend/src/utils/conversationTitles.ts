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
  assessmentData?: any
): string {
  console.log('🏷️ generateConversationTitle called with FIRST message:', {
    hasFirstMessage: !!firstMessage,
    firstMessagePreview: firstMessage?.substring(0, 30),
    universityContext,
    hasAssessmentData: !!assessmentData
  });
  
  // Priority 1: Assessment-based title
  if (assessmentData) {
    const interests = assessmentData.interests?.slice(0, 2).join(', ') || 'interests';
    const title = `Assessment: ${interests}`;
    console.log('🏷️ Generated assessment title:', title);
    return title;
  }

  // Priority 2: University context-based title
  if (universityContext) {
    // If we have a first message, combine with university
    if (firstMessage && firstMessage.trim()) {
      const cleanMessage = cleanMessageForTitle(firstMessage);
      if (cleanMessage.length > 5) {
        const title = `${universityContext}: ${cleanMessage}`;
        console.log('🏷️ Generated university + message title:', title);
        return title;
      }
    }
    const title = `${universityContext} Admissions`;
    console.log('🏷️ Generated university-only title (placeholder):', title);
    return title;
  }

  // Priority 3: First message-based title
  if (firstMessage && firstMessage.trim()) {
    const cleanMessage = cleanMessageForTitle(firstMessage);
    if (cleanMessage.length > 5) {
      console.log('🏷️ Generated message-based title:', cleanMessage);
      return cleanMessage;
    }
  }

  // Fallback: Generic title with timestamp for uniqueness
  const hour = new Date().getHours();
  let timeOfDay = 'Morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
  else if (hour >= 17) timeOfDay = 'Evening';
  
  const title = `${timeOfDay} Consultation`;
  console.log('🏷️ Generated time-based fallback title:', title);
  return title;
}

/**
 * Clean and truncate a message to be used as a conversation title
 * Ensures title is brief, concise, and one sentence (max 7 words)
 * @param message - Raw message text
 * @returns Cleaned, truncated title-appropriate text (one sentence, max 7 words)
 */
function cleanMessageForTitle(message: string): string {
  // Remove excessive whitespace and newlines
  let cleaned = message.replace(/\s+/g, ' ').trim();
  
  // Extract only the first sentence
  const firstSentenceMatch = cleaned.match(/^[^.!?;]+/);
  if (firstSentenceMatch) {
    cleaned = firstSentenceMatch[0].trim();
  }
  
  // Remove common prefixes that don't add value
  const prefixesToRemove = [
    'tell me about',
    'i want to know about',
    'can you help me with',
    'what is',
    'what are',
    'how do i',
    'how can i',
    'please tell me',
    'i need help with',
    'can you tell me',
    'i would like to know'
  ];
  
  const lowerCleaned = cleaned.toLowerCase();
  for (const prefix of prefixesToRemove) {
    if (lowerCleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length).trim();
      // Capitalize first letter after removing prefix
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      break;
    }
  }
  
  // Enforce max 7 words for brevity (like LLM backend)
  const words = cleaned.split(/\s+/);
  if (words.length > 7) {
    cleaned = words.slice(0, 7).join(' ');
  }
  
  // Truncate to max 50 characters if still too long
  if (cleaned.length > 50) {
    // Try to cut at word boundary
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 30) {
      cleaned = truncated.substring(0, lastSpace);
    } else {
      cleaned = truncated;
    }
  }
  
  // Remove trailing punctuation that looks bad in titles
  cleaned = cleaned.replace(/[?!.,;:]+$/, '');
  
  // Ensure first letter is capitalized
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned;
}

/**
 * Check if conversation title should be updated with first user message
 * Returns true if current title is generic/placeholder and should be replaced
 * with a message-based title
 * @param currentTitle - Current conversation title
 * @param firstUserMessage - First message from user
 */
export function shouldUpdateConversationTitle(
  currentTitle: string,
  firstUserMessage?: string
): boolean {
  // Don't update if no valid first message
  if (!firstUserMessage || firstUserMessage.trim().length <= 5) {
    console.log('🏷️ shouldUpdateConversationTitle: NO - invalid message', {
      currentTitle,
      messageLength: firstUserMessage?.trim().length || 0
    });
    return false;
  }
  
  // Always update these generic titles
  const alwaysUpdateTitles = [
    'New Chat',
    'Morning Consultation',
    'Afternoon Consultation', 
    'Evening Consultation',
    'Untitled',
    'Conversation'
  ];
  
  if (alwaysUpdateTitles.includes(currentTitle)) {
    console.log('🏷️ shouldUpdateConversationTitle: YES - generic title', currentTitle);
    return true;
  }
  
  // Update university-only titles (e.g., "KNUST Admissions", "UG Admissions")
  // These are placeholders that should be replaced with message-based titles
  if (currentTitle.endsWith(' Admissions')) {
    console.log('🏷️ shouldUpdateConversationTitle: YES - university placeholder', currentTitle);
    return true;
  }
  
  // Update assessment-only titles (e.g., "Assessment: Computer Science, Medicine")
  // when user sends first real message (not from assessment flow)
  if (currentTitle.startsWith('Assessment: ')) {
    console.log('🏷️ shouldUpdateConversationTitle: YES - assessment placeholder', currentTitle);
    return true;
  }
  
  // Don't update titles that already look message-based
  // (e.g., "KNUST: Scholarship opportunities" or "Cut off points")
  console.log('🏷️ shouldUpdateConversationTitle: NO - already has good title', currentTitle);
  return false;
}
