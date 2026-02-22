import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ChatBot from '../components/ChatBot';

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get university context and assessment data from location state
  const universityContext = location.state?.universityContext;
  const assessmentData = location.state?.assessmentData;
  const initialMessage = location.state?.initialMessage;
  const forceNewConversation = location.state?.forceNewConversation;
  const userContext = location.state?.userContext;
  const resumeConversationId = location.state?.conversationId;
  const resumeConversationTitle = location.state?.conversationTitle;

  console.log('🔍 Chat page state:', { universityContext, assessmentData, initialMessage, forceNewConversation, userContext });

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Navbar 
        title={resumeConversationTitle ? `${resumeConversationTitle}` : (universityContext ? `${universityContext.name} CHAT` : "CHAT")}
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={true}
      />
      
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        <ChatBot 
          universityContext={universityContext} 
          assessmentData={assessmentData}
          initialMessage={initialMessage}
          forceNewConversation={forceNewConversation}
          userContext={userContext}
          resumeConversationId={resumeConversationId}
          resumeConversationTitle={resumeConversationTitle}
        />
      </div>
    </div>
  );
};

export default Chat;
