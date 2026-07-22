import React, { memo } from "react";
import { motion } from "framer-motion";
import { FiMessageCircle, FiFile, FiImage } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../store";
import { useTheme } from "../contexts/ThemeContext";

interface ChatBubbleProps {
  message: ChatMessage;
  isTyping?: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = memo(
  ({ message, isTyping = false }) => {
    const { text, isUser, timestamp, attachments } = message;
    const { theme } = useTheme();

    // Enhanced URL detection and linking for plain text URLs
    const autolinkText = (t: string): string => {
      // Detect URLs not already in markdown link format [text](url)
      const urlRegex = /(?<!\]\()https?:\/\/[^\s<>"]+(?![^<]*>)(?!\))/gi;

      return t.replace(urlRegex, (url) => {
        const cleanUrl = url.replace(/[.,;:!?'")\]]+$/, "");
        return `[${cleanUrl}](${cleanUrl})`;
      });
    };
    const processedText = autolinkText(text);

    const isGreetingMessage =
      !isUser &&
      (text.includes("Good morning") ||
        text.includes("Good afternoon") ||
        text.includes("Good evening") ||
        text.includes("Good night") ||
        text.includes("Hello"));

    const renderAttachments = () => {
      if (!attachments || attachments.length === 0) return null;

      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={index}
              className={`relative flex flex-col justify-end w-20 h-20 rounded-xl overflow-hidden border shrink-0 ${
                theme === "dark"
                  ? "border-white/20 bg-black/20 text-white"
                  : "border-black/10 bg-black/5 text-gray-800"
              }`}
            >
              {file.previewUrl ? (
                <img src={file.previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {file.type.startsWith("image/") ? (
                    <FiImage className="w-8 h-8 opacity-50" />
                  ) : (
                    <FiFile className="w-8 h-8 opacity-50" />
                  )}
                </div>
              )}
              
              <div className="relative z-10 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-1 truncate text-center font-medium">
                {file.name}
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
        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
      >
        <div
          className={`flex items-start space-x-2 w-full max-w-[90%] md:max-w-[85%] lg:max-w-3xl ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}
        >
          {/* Avatar - Only show for bot messages */}
          {!isUser && (
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200 ${
                theme === "dark"
                  ? "bg-gray-600 text-gray-300"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              <FiMessageCircle className="w-4 h-4" />
            </div>
          )}

          <div
            className={`p-4 rounded-2xl transition-all duration-300 overflow-x-auto ${
              isUser
                ? theme === "dark"
                  ? "bg-primary-600/90 text-white shadow-lg border border-primary-400/30 backdrop-blur-sm shadow-primary-500/20 hover:border-primary-400/50"
                  : "bg-primary-500/90 text-white shadow-lg border border-primary-400/20 backdrop-blur-sm shadow-primary-500/20 hover:border-primary-400/40"
                : theme === "dark"
                  ? "glass-card-unified-dark bg-gray-700/80 text-white"
                  : "glass-card-unified bg-gray-800/90 text-white"
            }`}
          >
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
                  <div className="text-sm leading-relaxed font-semibold text-white">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3 rounded-lg border border-white/20">
                            <table className="min-w-full border-collapse text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-black/10 border-b border-white/20">{children}</thead>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-2 border-t border-white/10">
                            {children}
                          </td>
                        ),
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="italic">{children}</em>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-lg font-bold mb-2 text-white">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-base font-bold mb-2 text-white">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-bold mb-1 text-white">
                            {children}
                          </h3>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside mb-2 space-y-1 ml-2">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm">{children}</li>
                        ),
                        code: ({ children }) => (
                          <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">
                            {children}
                          </code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-primary-500 pl-3 italic text-gray-600 dark:text-gray-400">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium underline decoration-2 transition-colors duration-200 ${
                              theme === "dark"
                                ? "text-blue-400 hover:text-blue-300"
                                : "text-blue-600 hover:text-blue-800"
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
                  <div className="text-sm leading-relaxed text-white">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3 rounded-lg border border-white/20">
                            <table className="min-w-full border-collapse text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-black/10 border-b border-white/20">{children}</thead>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-2 border-t border-white/10">
                            {children}
                          </td>
                        ),
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="italic">{children}</em>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-lg font-bold mb-2 text-white">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-base font-bold mb-2 text-white">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-bold mb-1 text-white">
                            {children}
                          </h3>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside mb-2 space-y-1 ml-2">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside mb-2 space-y-1 ml-2">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm">{children}</li>
                        ),
                        code: ({ children }) => (
                          <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">
                            {children}
                          </code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-primary-500 pl-3 italic text-gray-600 dark:text-gray-400">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium underline decoration-2 transition-colors duration-200 ${
                              theme === "dark"
                                ? "text-blue-400 hover:text-blue-300"
                                : "text-blue-600 hover:text-blue-800"
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
                  <p
                    className={`text-xs mt-2 transition-colors duration-200 ${
                      isUser
                        ? theme === "dark"
                          ? "text-primary-100"
                          : "text-primary-100"
                        : theme === "dark"
                          ? "text-gray-400"
                          : "text-gray-500"
                    }`}
                  >
                    {timestamp}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    );
  },
);

ChatBubble.displayName = "ChatBubble";

export default ChatBubble;
