/**
 * Conversation History Page
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConversationHistory from '../components/ConversationHistory';

const ConversationHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Navbar 
        title="CONVERSATION HISTORY"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={true}
      />
      
      <div className="flex-1 overflow-hidden">
        <ConversationHistory />
      </div>
    </div>
  );
};

export default ConversationHistoryPage;