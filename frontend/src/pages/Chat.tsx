import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import ChatBot from "../components/ChatBot";
import ChatSidebar from "../components/ChatSidebar";

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);

    const handleToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener("toggleSidebar", handleToggle);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("toggleSidebar", handleToggle);
    };
  }, []);

  const universityContext = location.state?.universityContext;
  const assessmentData = location.state?.assessmentData;
  const initialMessage = location.state?.initialMessage;
  const forceNewConversation = location.state?.forceNewConversation;
  const userContext = location.state?.userContext;
  const resumeConversationId = location.state?.conversationId;
  const resumeConversationTitle = location.state?.conversationTitle;
  const forceCoachMode = location.state?.forceCoachMode;

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900 transition-colors duration-200 overflow-hidden">
      <ChatSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isDesktop={isDesktop}
      />

      <div className="flex-1 flex flex-col w-full h-full relative">
        <Navbar
          title={
            resumeConversationTitle
              ? `${resumeConversationTitle}`
              : universityContext
                ? `${universityContext.name} CHAT`
                : "CHAT"
          }
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={true}
          onMenuClick={() => setIsSidebarOpen((prev) => !prev)}
          showThemeToggle={true}
        />

        <div className="flex-1 flex flex-col w-full h-full min-h-0">
          <ChatBot
            key={location.key}
            universityContext={universityContext}
            assessmentData={assessmentData}
            initialMessage={initialMessage}
            forceNewConversation={forceNewConversation}
            userContext={userContext}
            resumeConversationId={resumeConversationId}
            resumeConversationTitle={resumeConversationTitle}
            forceCoachMode={forceCoachMode}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;
