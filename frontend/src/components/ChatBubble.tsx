import React, { memo } from "react";
import { motion } from "framer-motion";
import { FiFile, FiImage, FiExternalLink } from "react-icons/fi";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../store";

interface ChatBubbleProps {
  message: ChatMessage;
  isTyping?: boolean;
}

// Cerkyl's answers read like a page: plain text in the conversation column,
// no bubble. Only the student's own messages sit in a bubble, on the right.
const answerComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="text-lg font-semibold mt-5 mb-2 first:mt-0 text-gray-900 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold mt-5 mb-2 first:mt-0 text-gray-900 dark:text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[15px] font-semibold mt-4 mb-1.5 first:mt-0 text-gray-900 dark:text-white">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1.5 marker:text-gray-400">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1.5 marker:text-gray-400">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 align-top border-t border-gray-100 dark:border-gray-800">
      {children}
    </td>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[13px] font-mono text-gray-800 dark:text-gray-200">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-primary-500 pl-4 text-gray-600 dark:text-gray-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-gray-200 dark:border-gray-700" />,
  a: ({ href, children }) => (
    <a
      href={href as string}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary-600 dark:text-primary-400 underline decoration-primary-600/30 dark:decoration-primary-400/40 underline-offset-2 hover:decoration-current"
    >
      {children}
    </a>
  ),
};

// The student's bubble is blue, so links and code inside it use light colours.
const userComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href as string}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded bg-white/15 text-[13px] font-mono">{children}</code>
  ),
};

export const TypingDots: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center gap-2 min-h-7 text-gray-500 dark:text-gray-400">
    <div className="flex gap-1 shrink-0">
      {[0, 0.15, 0.3].map((delay) => (
        <motion.span
          key={delay}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay }}
          className="w-1.5 h-1.5 rounded-full bg-current"
        />
      ))}
    </div>
    {label && <span className="text-sm">{label}</span>}
  </div>
);

export const CerkylAvatar: React.FC = () => (
  <div className="shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm">
    <img src="/cerkyl.svg" alt="CERKYL" className="w-5 h-5 object-contain" />
  </div>
);

const ChatBubble: React.FC<ChatBubbleProps> = memo(({ message, isTyping = false }) => {
  const { text, isUser, timestamp, attachments, sources } = message;

  // Turn bare URLs into markdown links (skipping ones already in [text](url) form).
  const autolinkText = (t: string): string => {
    const urlRegex = /(?<!\]\()https?:\/\/[^\s<>"]+(?![^<]*>)(?!\))/gi;
    return t.replace(urlRegex, (url) => {
      const cleanUrl = url.replace(/[.,;:!?'")\]]+$/, "");
      return `[${cleanUrl}](${cleanUrl})`;
    });
  };
  const processedText = autolinkText(text || "");

  // Official websites of the universities whose information the answer used
  // (sent by the AI service as local_knowledge sources with a url).
  const officialLinks = (() => {
    if (isUser || !Array.isArray(sources)) return [];
    const seen = new Set<string>();
    const links: { name: string; url: string }[] = [];
    for (const source of sources) {
      const url = typeof source?.url === "string" ? source.url : "";
      if (
        source?.type !== "local_knowledge" ||
        !/^https?:\/\//i.test(url) ||
        Number(source?.confidence ?? 0) < 0.5 ||
        seen.has(url)
      ) {
        continue;
      }
      seen.add(url);
      links.push({ name: String(source.source || url), url });
      if (links.length === 3) break;
    }
    return links;
  })();

  const renderOfficialLinks = () => {
    if (officialLinks.length === 0) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {officialLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${link.name} official website`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <FiExternalLink className="w-3 h-3" />
            {link.url.replace(/^https?:\/\/(www\.)?/i, "")}
          </a>
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {officialLinks.length === 1 ? "Official website" : "Official websites"}
        </span>
      </div>
    );
  };

  const renderAttachments = () => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div className={`mt-2 flex flex-wrap gap-2 ${isUser ? "justify-end" : ""}`}>
        {attachments.map((file, index) => (
          <div
            key={index}
            className="relative flex flex-col justify-end w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 shrink-0"
          >
            {file.previewUrl ? (
              <img
                src={file.previewUrl}
                alt="preview"
                className="absolute inset-0 w-full h-full object-cover"
              />
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

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-end">
          <div className="px-4 py-2.5 rounded-3xl rounded-br-lg bg-primary-600 text-white text-[15px] leading-relaxed shadow-sm break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={userComponents}>
              {processedText}
            </ReactMarkdown>
          </div>
          {renderAttachments()}
          {timestamp && (
            <span className="mt-1 mr-1 text-[11px] text-gray-400 dark:text-gray-500">
              {timestamp}
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3"
    >
      <CerkylAvatar />
      <div className="flex-1 min-w-0 pt-0.5">
        {isTyping ? (
          <TypingDots />
        ) : (
          <>
            <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={answerComponents}>
                {processedText}
              </ReactMarkdown>
            </div>
            {renderAttachments()}
            {renderOfficialLinks()}
            {timestamp && (
              <span className="block mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                {timestamp}
              </span>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
});

ChatBubble.displayName = "ChatBubble";

export default ChatBubble;
