/**
 * Markdown Utilities
 * 
 * Provides utilities for cleaning and processing markdown text
 * for display in UI components that don't support markdown rendering
 */

/**
 * Strip markdown syntax from text while preserving content
 * Removes formatting like **bold**, *italic*, ##headers, etc.
 * @param text - Raw text with markdown syntax
 * @returns Clean text without markdown formatting
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove headers (## Header -> Header)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  
  // Remove bold/italic (**text** or __text__ -> text)
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.+?)__/g, '$1');
  
  // Remove italic (*text* or _text_ -> text)
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/_(.+?)_/g, '$1');
  
  // Remove strikethrough (~~text~~ -> text)
  cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');
  
  // Remove code blocks (```code``` -> code)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code (`code` -> code)
  cleaned = cleaned.replace(/`(.+?)`/g, '$1');
  
  // Remove links ([text](url) -> text)
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Remove images (![alt](url) -> alt)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
  
  // Remove blockquotes (> text -> text)
  cleaned = cleaned.replace(/^>\s+/gm, '');
  
  // Remove horizontal rules (---, ***, ___ -> empty)
  cleaned = cleaned.replace(/^[-*_]{3,}$/gm, '');
  
  // Remove list markers (- item, * item, 1. item -> item)
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');
  
  // Normalize whitespace (multiple spaces/newlines -> single space)
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Truncate text to a specified length, ensuring no markdown is cut mid-token
 * @param text - Text to truncate
 * @param maxLength - Maximum length of output
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated, markdown-free text
 */
export function truncateCleanText(text: string, maxLength: number = 100, suffix: string = '...'): string {
  // First strip markdown to get clean text
  const cleaned = stripMarkdown(text);
  
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  
  // Truncate at word boundary
  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    // If we have a space near the end, cut there
    return truncated.substring(0, lastSpace) + suffix;
  }
  
  // Otherwise just truncate and add suffix
  return truncated + suffix;
}

/**
 * Extract plain text preview from markdown content
 * Perfect for conversation previews, summaries, etc.
 * @param markdown - Markdown formatted text
 * @param maxLength - Maximum length of preview (default: 120)
 * @returns Clean, truncated preview text
 */
export function getMarkdownPreview(markdown: string, maxLength: number = 120): string {
  return truncateCleanText(markdown, maxLength, '...');
}
