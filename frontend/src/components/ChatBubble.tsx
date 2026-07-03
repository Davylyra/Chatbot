import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { FiMessageCircle } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../store';
import { useTheme } from '../contexts/ThemeContext';

interface ChatBubbleProps {
  message: ChatMessage;
  isTyping?: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = memo(({
  message,
  isTyping = false
}) => {
  const { text, isUser, timestamp, attachments } = message;
  const { theme } = useTheme();
  
  // Enhanced URL detection and linking for plain text URLs
  const autolinkText = (t: string): string => {
    // Detect URLs not already in markdown link format [text](url)
    // This regex finds URLs that are NOT preceded by ]( or followed by ) when preceded by ](
    const urlRegex = /(?<!\]\()https?:\/\/[^\s<>"]+(?![^<]*>)(?!\))/gi;
    
    return t.replace(urlRegex, (url) => {
      // Clean trailing punctuation that might not be part of the URL
      let cleanUrl = url.replace(/[.,;:!?'")\]]+$/, '');
      return `[${cleanUrl}](${cleanUrl})`;
    });
  };
  const processedText = autolinkText(text);
  
  const isGreetingMessage = !isUser && (
    text.includes('Good morning') || 
    text.includes('Good afternoon') || 
    text.includes('Good evening') || 
    text.includes('Good night') ||
    text.includes('Hello')
  );

  const renderAttachments = () => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="mt-2 space-y-1">
        {attachments.map((file, index) => (
          <div
            key={index}
            className={`flex items-center space-x-2 p-2 rounded-lg transition-colors duration-200 ${
              theme === 'dark' 
                ? 'bg-gray-600/50 text-gray-300' 
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <div className={`p-1.5 rounded-full ${
              file.type.startsWith('image/') 
                ? theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                : theme === 'dark' ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'
            }`}>
              {file.type.startsWith('image/') ? '️' : ''}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{file.name}</p>
              <p className="text-xs opacity-70">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ))}
      </div>
    );
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex items-start space-x-2 max-w-xs lg:max-w-md ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar - Only show for bot messages */}
        {!isUser && (
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200 ${
            theme === 'dark' 
              ? 'bg-gray-600 text-gray-300' 
              : 'bg-gray-200 text-gray-600'
        }`}>
            <FiMessageCircle className="w-4 h-4" />
        </div>
        )}

        {/* Message Bubble */}
        <div className={`p-4 rounded-2xl transition-all duration-300 ${
          isUser 
            ? theme === 'dark'
              ? 'bg-primary-600/90 text-white shadow-lg border border-primary-400/30 backdrop-blur-sm shadow-primary-500/20 hover:border-primary-400/50'
              : 'bg-primary-500/90 text-white shadow-lg border border-primary-400/20 backdrop-blur-sm shadow-primary-500/20 hover:border-primary-400/40'
            : theme === 'dark' 
              ? 'glass-card-unified-dark bg-gray-700/80 text-gray-200' 
              : 'glass-card-unified bg-white/80 text-gray-800'
        }`}>
          {isTyping ? (
            <div className="flex items-center space-x-1">
              <div className="flex space-x-1">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  className="w-2 h-2 bg-current rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-current rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-current rounded-full"
                />
              </div>
              <span className="text-sm ml-2">typing...</span>
            </div>
          ) : (
            <>
              {isGreetingMessage ? (
                <div className="text-sm leading-relaxed font-semibold text-primary-600">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 text-primary-600">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-primary-600">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 text-primary-600">{children}</h3>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                      code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      blockquote: ({ children }) => <blockquote className="border-l-4 border-primary-500 pl-3 italic text-gray-600 dark:text-gray-400">{children}</blockquote>,
                      a: ({ href, children }) => (
                        <a 
                          href={href as string} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={`font-medium underline decoration-2 transition-colors duration-200 ${
                            theme === 'dark'
                              ? 'text-blue-400 hover:text-blue-300'
                              : 'text-blue-600 hover:text-blue-800'
                          }`}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                  {processedText}
                  </ReactMarkdown>
                  {renderAttachments()}
                </div>
              ) : (
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 text-primary-600">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-primary-600">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 text-primary-600">{children}</h3>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                      code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      blockquote: ({ children }) => <blockquote className="border-l-4 border-primary-500 pl-3 italic text-gray-600 dark:text-gray-400">{children}</blockquote>,
                      a: ({ href, children }) => (
                        <a 
                          href={href as string} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={`font-medium underline decoration-2 transition-colors duration-200 ${
                            theme === 'dark'
                              ? 'text-blue-400 hover:text-blue-300'
                              : 'text-blue-600 hover:text-blue-800'
                          }`}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {processedText}
                  </ReactMarkdown>
                  {renderAttachments()}
                </div>
              )}
              {timestamp && (
                <p className={`text-xs mt-2 transition-colors duration-200 ${
                  isUser 
                    ? theme === 'dark'
                    ? 'text-primary-100' 
                      : 'text-primary-100'
                    : theme === 'dark' 
                      ? 'text-gray-400' 
                      : 'text-gray-500'
                }`}>
                  {timestamp}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
});

ChatBubble.displayName = 'ChatBubble';

export default ChatBubble;
