import re

file_path = "src/components/ChatBot.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Hide the Quick Actions block if there's an empty state
quick_actions_regex = r"(\{/\* Quick Actions \*/\}.*?\{currentMessages\.length <= 2 && \(\s*<div className=\{`p-4 border-t.*?</div>\s*\)\})"
content = re.sub(quick_actions_regex, r"{/* Quick actions removed to match new UI */}", content, flags=re.DOTALL)

# 2. Update the message mapping loop to include the EmptyState
old_message_map = """        <AnimatePresence mode="popLayout">
          {currentMessages.map((message) => (
            <motion.div
              key={`message-${message.id}-${message.conversationId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ChatBubble message={message} />
            </motion.div>
          ))}
        </AnimatePresence>"""

new_message_map = """        <AnimatePresence mode="popLayout">
          {currentMessages.length <= 1 ? (
            <div className="flex flex-col items-center justify-center text-center w-full min-h-[60vh]">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">
                Thinking about your future?, <span className="text-blue-500">{user?.name?.split(' ')[0] || 'Guest'}</span>
              </h1>
              <p className="text-gray-400 mb-12 text-lg">Ask me anything about universities and admissions.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full px-4">
                {/* Find a Course */}
                <button onClick={() => { setInputMessage("Help me find a course"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-gray-800/40 hover:bg-gray-800/80 rounded-2xl border border-gray-700/50 transition-all duration-200">
                  <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center mb-4">
                    <FiSearch className="text-white text-xl" />
                  </div>
                  <span className="text-gray-300 font-medium text-sm">Find a Course</span>
                </button>
                {/* Check Deadlines */}
                <button onClick={() => { setInputMessage("What are the admission deadlines?"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-gray-800/40 hover:bg-gray-800/80 rounded-2xl border border-gray-700/50 transition-all duration-200">
                  <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mb-4">
                    <FiFile className="text-white text-xl" />
                  </div>
                  <span className="text-gray-300 font-medium text-sm">Check Deadlines</span>
                </button>
                {/* Compare Universities */}
                <button onClick={() => { setInputMessage("Compare KNUST and UG"); handleSendMessage(); }} className="flex flex-col items-center p-6 bg-gray-800/40 hover:bg-gray-800/80 rounded-2xl border border-gray-700/50 transition-all duration-200">
                  <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center mb-4">
                    <FiUsers className="text-white text-xl" />
                  </div>
                  <span className="text-gray-300 font-medium text-sm">Compare Schools</span>
                </button>
                {/* Buy Forms */}
                <button onClick={() => handleBuyForms()} className="flex flex-col items-center p-6 bg-gray-800/40 hover:bg-gray-800/80 rounded-2xl border border-gray-700/50 transition-all duration-200">
                  <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mb-4">
                    <FiShoppingCart className="text-white text-xl" />
                  </div>
                  <span className="text-gray-300 font-medium text-sm">Buy Forms</span>
                </button>
              </div>
            </div>
          ) : (
            currentMessages.map((message) => (
              <motion.div
                key={`message-${message.id}-${message.conversationId}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ChatBubble message={message} />
              </motion.div>
            ))
          )}
        </AnimatePresence>"""

content = content.replace(old_message_map, new_message_map)


# 3. Restyle the Input Area
old_input_area = """      {/* Input Area */}
      <div className={`p-4 border-t transition-colors duration-200 ${
        theme === 'dark' 
          ? 'border-gray-700 bg-gray-800' 
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center space-x-3">
          {/* Attach Button with Dropdown */}
          <div className="relative">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (!isGuest) {
                  setShowAttachMenu(!showAttachMenu);
                }
              }}
              disabled={isGuest}
            className={`p-2.5 rounded-full transition-all duration-200 ${
                showAttachMenu
                  ? theme === 'dark' 
                    ? 'text-primary-400 bg-primary-500/20' 
                    : 'text-primary-600 bg-primary-100'
                  : theme === 'dark' 
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            } ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isGuest ? 'Guest users cannot attach files. Please log in.' : 'Attach file or document'}
          >
            <FiPaperclip className="w-5 h-5" />
          </motion.button>

          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message CERKYL..."
              className={`w-full px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 ${
                theme === 'dark' 
                  ? 'glass-unified-dark text-white placeholder-gray-400' 
                  : 'glass-unified text-gray-900 placeholder-gray-500'
              } ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isTyping || isGuest}
            />
          </div>
          <motion.button
            whileHover={{ scale: (inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest ? 1.05 : 1 }}
            whileTap={{ scale: (inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest ? 0.95 : 1 }}
            onClick={handleSendMessage}
            disabled={!(inputMessage.trim() || attachedFiles.length > 0) || isTyping || isGuest}
            className={`p-3 rounded-full transition-all duration-200 ${
              (inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest
                ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-md hover:shadow-lg'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-300 text-gray-400 cursor-not-allowed'
            }`}
            title={(inputMessage.trim() || attachedFiles.length > 0)
              ? (isGuest ? 'Guest users cannot send messages. Please log in.' : 'Send message')
              : 'Type a message or attach files'}
          >
            <FiSend className="w-5 h-5" />
          </motion.button>
        </div>
      </div>"""

new_input_area = """      {/* Styled Input Area */}
      <div className={`p-4 transition-colors duration-200 flex flex-col items-center ${
        theme === 'dark' ? 'bg-[#0f1115] border-t border-gray-800' : 'bg-gray-50'
      }`}>
        <div className={`w-full max-w-4xl flex items-center space-x-3 rounded-full px-3 py-2 transition-all duration-200 ${
          theme === 'dark' ? 'bg-[#1e2329]' : 'bg-white shadow-lg border border-gray-200'
        }`}>
          {/* Attach Button (+) */}
          <div className="relative">
            <button 
              onClick={() => { if (!isGuest) setShowAttachMenu(!showAttachMenu); }}
              className={`p-1 rounded-full transition-all duration-200 ${
                theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border border-dashed ${
                theme === 'dark' ? 'border-gray-500' : 'border-gray-400'
              }`}>
                <span className="text-lg leading-none mb-0.5">+</span>
              </div>
            </button>
          </div>
          
          <div className={`flex items-center space-x-1 px-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
             <FiSearch className="w-4 h-4" />
             <span className="text-sm font-medium">Tools</span>
          </div>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message CERKYL..."
              className={`w-full px-2 py-2 bg-transparent focus:outline-none transition-all duration-200 ${
                theme === 'dark' 
                  ? 'text-white placeholder-gray-500' 
                  : 'text-gray-900 placeholder-gray-400'
              } ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isTyping || isGuest}
            />
          </div>
          
          <div className="flex items-center space-x-2 pr-1">
            <button className={`p-2 transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
              <FiMessageCircle className="w-5 h-5" /> 
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!(inputMessage.trim() || attachedFiles.length > 0) || isTyping || isGuest}
              className={`p-2 rounded-full transition-all duration-200 ${
                (inputMessage.trim() || attachedFiles.length > 0) && !isTyping && !isGuest
                  ? theme === 'dark' ? 'text-white bg-gray-700' : 'text-black bg-gray-200'
                  : theme === 'dark' ? 'text-gray-600' : 'text-gray-300'
              }`}
            >
              <FiSend className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <p className={`text-xs mt-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          CERKYL can make mistakes. Please verify important information.
        </p>
      </div>"""

content = content.replace(old_input_area, new_input_area)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated ChatBot.tsx successfully")
