// LLM-powered conversation title generator using Groq API

import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY
}) : null;

const LLM_CONFIG = {
  model: 'llama-3.1-8b-instant', // Fast Groq model
  temperature: 0.3, // Lower temperature for consistent, focused titles
  maxTokens: 20, // 3-7 words ~ 10-20 tokens
  systemPrompt: `You are a conversation title generator. Your job is to read the FIRST user message and create a short, professional title.

RULES:
- ONE SENTENCE ONLY
- Maximum 7 words
- Must be brief, concise, and precise
- No quotes, no punctuation at the end
- Professional and clear
- Focus on the main topic or question from the FIRST user message
- Examples: "KNUST Scholarship Requirements", "UG Admission Cut Off Points", "Engineering Program Comparison"

Respond with ONLY the title text, nothing else.`,
};

export async function generateLLMTitle(firstUserMessage, firstBotReply = null, universityContext = null) {
  try {
    if (!firstUserMessage || firstUserMessage.trim().length < 5) {
      return {
        success: false,
        error: 'First user message too short or empty',
        method: 'validation_failed'
      };
    }

    if (!groq) {
      console.warn('GROQ_API_KEY not configured');
      return {
        success: false,
        error: 'LLM service not configured',
        method: 'no_api_key'
      };
    }

    let conversationContext = `User: ${firstUserMessage.trim()}`;
    
    if (firstBotReply) {
      const truncatedReply = firstBotReply.length > 300 
        ? firstBotReply.substring(0, 300) + '...'
        : firstBotReply;
      conversationContext += `\n\nAssistant: ${truncatedReply}`;
    }

    if (universityContext) {
      conversationContext = `[Context: ${universityContext}]\n\n${conversationContext}`;
    }

    console.log('Generating LLM title for conversation:', {
      messageLength: firstUserMessage.length,
      hasBotReply: !!firstBotReply,
      universityContext
    });

    // Call Groq API
    const startTime = Date.now();
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: LLM_CONFIG.systemPrompt
        },
        {
          role: 'user',
          content: `Generate a title for this conversation:\n\n${conversationContext}`
        }
      ],
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_tokens: LLM_CONFIG.maxTokens,
    });

    const duration = Date.now() - startTime;
    const generatedTitle = completion.choices[0]?.message?.content?.trim();

    if (!generatedTitle) {
      throw new Error('Empty response from LLM');
    }

    const cleanedTitle = cleanTitle(generatedTitle);

    console.log('LLM title generated in', duration, 'ms:', cleanedTitle);

    return {
      success: true,
      title: cleanedTitle,
      method: 'groq_llm',
      duration_ms: duration
    };

  } catch (error) {
    console.error('LLM title generation failed:', error.message);
    
    return {
      success: false,
      error: error.message,
      method: 'llm_error'
    };
  }
}

function cleanTitle(title) {
  let cleaned = title.replace(/^["']|["']$/g, '');
  
  cleaned = cleaned.replace(/[.!?;:,]+$/, '');
  
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  if (cleaned.length > 60) {
    cleaned = cleaned.substring(0, 60).trim() + '...';
  }
  
  return cleaned;
}

export async function generateTitleWithFallback(
  firstUserMessage,
  firstBotReply = null,
  universityContext = null,
  fallbackGenerator = null
) {
  // Try LLM first
  const llmResult = await generateLLMTitle(firstUserMessage, firstBotReply, universityContext);
  
  if (llmResult.success) {
    return {
      title: llmResult.title,
      method: llmResult.method
    };
  }
  
  console.log('LLM title generation failed, using fallback');
  
  if (fallbackGenerator && typeof fallbackGenerator === 'function') {
    const fallbackTitle = fallbackGenerator(firstUserMessage, universityContext);
    return {
      title: fallbackTitle,
      method: 'fallback_local'
    };
  }
  
  // Last resort: simple title from first message
  const simpleTitle = cleanTitle(
    firstUserMessage.length > 50 
      ? firstUserMessage.substring(0, 50).trim() 
      : firstUserMessage.trim()
  );
  
  return {
    title: simpleTitle,
    method: 'fallback_simple'
  };
}

export function generateSimpleTitle(firstUserMessage, universityContext = null) {
  if (!firstUserMessage || firstUserMessage.trim().length < 3) {
    return 'New Conversation';
  }

  let title = firstUserMessage.trim();
  
  if (universityContext && !title.toLowerCase().includes(universityContext.toLowerCase())) {
    const questionMatch = title.match(/(?:what|where|when|how|which|who|why)\s+(.+?)(?:\?|$)/i);
    if (questionMatch && questionMatch[1]) {
      title = `${universityContext} - ${questionMatch[1]}`;
    } else {
      if (title.length < 30) {
        title = `${universityContext} - ${title}`;
      }
    }
  }
  
  const firstSentence = title.match(/^[^.!?]+/)?.[0] || title;
  
  // Limit to 60 characters for display
  if (firstSentence.length > 60) {
    return cleanTitle(firstSentence.substring(0, 60).trim() + '...');
  }
  
  return cleanTitle(firstSentence);
}

export default { generateLLMTitle, generateTitleWithFallback, generateSimpleTitle };
