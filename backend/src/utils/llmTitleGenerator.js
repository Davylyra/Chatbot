import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const groqClient = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const LLM_CONFIG = {
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
  maxTokens: 20,
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

export async function generateLLMTitle(initialPrompt, initialResponse = null, institutionContext = null) {
  if (!initialPrompt || initialPrompt.trim().length < 5) {
    return { success: false, error: 'First user message too short or empty', method: 'validation_failed' };
  }

  if (!groqClient) {
    return { success: false, error: 'LLM service not configured', method: 'no_api_key' };
  }

  let promptContext = `User: ${initialPrompt.trim()}`;
  
  if (initialResponse) {
    promptContext += `\n\nAssistant: ${initialResponse.length > 300 ? initialResponse.substring(0, 300) + '...' : initialResponse}`;
  }

  if (institutionContext) {
    promptContext = `[Context: ${institutionContext}]\n\n${promptContext}`;
  }

  try {
    const startTimeMs = Date.now();
    const generationOutcome = await groqClient.chat.completions.create({
      messages: [
        { role: 'system', content: LLM_CONFIG.systemPrompt },
        { role: 'user', content: `Generate a title for this conversation:\n\n${promptContext}` }
      ],
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_tokens: LLM_CONFIG.maxTokens,
    });

    const elapsedMs = Date.now() - startTimeMs;
    const rawTitleOutput = generationOutcome.choices[0]?.message?.content?.trim();

    if (!rawTitleOutput) throw new Error('Empty response from LLM');

    return {
      success: true,
      title: cleanTitleFormatting(rawTitleOutput),
      method: 'groq_llm',
      duration_ms: elapsedMs
    };
  } catch (error) {
    return { success: false, error: error.message, method: 'llm_error' };
  }
}

function cleanTitleFormatting(rawText) {
  const noQuotes = rawText.replace(/^["']|["']$/g, '').replace(/[.!?;:,]+$/, '');
  const capitalized = noQuotes.length > 0 ? noQuotes.charAt(0).toUpperCase() + noQuotes.slice(1) : noQuotes;
  return capitalized.length > 60 ? capitalized.substring(0, 60).trim() + '...' : capitalized;
}

export async function generateTitleWithFallback(initialPrompt, initialResponse = null, institutionContext = null, customFallback = null) {
  const primaryOutcome = await generateLLMTitle(initialPrompt, initialResponse, institutionContext);
  
  if (primaryOutcome.success) {
    return { title: primaryOutcome.title, method: primaryOutcome.method };
  }
  
  if (typeof customFallback === 'function') {
    return { title: customFallback(initialPrompt, institutionContext), method: 'fallback_local' };
  }
  
  const defaultTitle = cleanTitleFormatting(initialPrompt.length > 50 ? initialPrompt.substring(0, 50).trim() : initialPrompt.trim());
  return { title: defaultTitle, method: 'fallback_simple' };
}

export function generateSimpleTitle(initialPrompt, institutionContext = null) {
  if (!initialPrompt || initialPrompt.trim().length < 3) return 'New Conversation';

  let derivedTitle = initialPrompt.trim();
  
  if (institutionContext && !derivedTitle.toLowerCase().includes(institutionContext.toLowerCase())) {
    const inquiryMatch = derivedTitle.match(/(?:what|where|when|how|which|who|why)\s+(.+?)(?:\?|$)/i);
    derivedTitle = inquiryMatch && inquiryMatch[1] 
      ? `${institutionContext} - ${inquiryMatch[1]}` 
      : (derivedTitle.length < 30 ? `${institutionContext} - ${derivedTitle}` : derivedTitle);
  }
  
  const primarySentence = derivedTitle.match(/^[^.!?]+/)?.[0] || derivedTitle;
  return cleanTitleFormatting(primarySentence.length > 60 ? primarySentence.substring(0, 60).trim() + '...' : primarySentence);
}

export default { generateLLMTitle, generateTitleWithFallback, generateSimpleTitle };
