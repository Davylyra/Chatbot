import type { PageContent } from '../services/contentService';

export function getDefaultContent(pageId: string): PageContent {
  const defaultContent: Record<string, PageContent> = {
    notifications: {
      pageId: 'notifications',
      sections: [
        {
          id: 'page-title',
          title: 'Notifications',
          content: 'Updates and Alerts',
          type: 'text',
        },
        {
          id: 'empty-state',
          title: 'No notifications yet',
          content: "You'll see updates and alerts here when they arrive.",
          type: 'text',
        },
        {
          id: 'success-message',
          title: 'Success',
          content: 'All notifications marked as read',
          type: 'text',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    forms: {
      pageId: 'forms',
      sections: [
        {
          id: 'page-title',
          title: 'Buy Admission Forms',
          content: 'Universities Form',
          type: 'text',
        },
        {
          id: 'payment-methods-title',
          title: 'Secure Mobile Money Payment',
          content: 'Make payments via',
          type: 'text',
        },
        {
          id: 'email-verification-title',
          title: 'Email Verification Required',
          content:
            "Please verify your email address before purchasing forms. You'll receive a verification code when initiating payment.",
          type: 'text',
        },
        {
          id: 'guest-notice',
          title: 'Guest Mode',
          content:
            "You're purchasing as a guest. Consider creating an account to save your purchase history.",
          type: 'text',
        },
        {
          id: 'empty-state',
          title: 'No forms found',
          content: 'No admission forms available.',
          type: 'text',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    about: {
      pageId: 'about',
      sections: [
        {
          id: 'app-title',
          title: 'CERKYL',
          content: 'Your AI Assistant for Ghana University Admissions',
          type: 'text',
        },
        {
          id: 'version',
          title: 'Version',
          content: '2.1.0',
          type: 'text',
        },
        {
          id: 'features-title',
          title: 'Features',
          content: 'Key features of our platform',
          type: 'text',
        },
        {
          id: 'ai-assistance',
          title: 'AI-Powered Assistance',
          content: 'Get instant answers to your admission questions',
          type: 'text',
        },
        {
          id: 'university-network',
          title: 'University Network',
          content: 'Access information from all major Ghanaian universities',
          type: 'text',
        },
        {
          id: 'personalized-recommendations',
          title: 'Personalized Recommendations',
          content: 'Get program recommendations based on your interests',
          type: 'text',
        },
        {
          id: 'mission-title',
          title: 'Our Mission',
          content:
            'To simplify the university admission process in Ghana by providing students with easy access to information, guidance, and support through our AI-powered platform. We believe every student deserves the opportunity to pursue higher education.',
          type: 'text',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    home: {
      pageId: 'home',
      sections: [
        {
          id: 'welcome-message',
          title: 'Welcome',
          content: 'Your AI Assistant for Ghana University Admissions',
          type: 'text',
        },
        {
          id: 'guest-mode-notice',
          title: 'Guest Mode',
          content: 'Guest Mode - Limited Features',
          type: 'text',
        },
        {
          id: 'start-chat-button',
          title: 'Start Chat',
          content: 'Chat with Cerkyl',
          type: 'text',
        },
        {
          id: 'buy-forms-button',
          title: 'Buy Forms',
          content: 'Buy Forms',
          type: 'text',
        },
        {
          id: 'program-recommendation-title',
          title: 'Get Program Recommendation',
          content:
            "Tell us your grades and interests, and we'll recommend the best programs for you",
          type: 'text',
        },
        {
          id: 'start-assessment-button',
          title: 'Start Assessment',
          content: 'Start Assessment',
          type: 'text',
        },
        {
          id: 'university-sessions-title',
          title: 'University Sessions',
          content: 'University Sessions',
          type: 'text',
        },
        {
          id: 'view-all-universities-button',
          title: 'View All Universities',
          content: 'View All Universities',
          type: 'text',
        },
        {
          id: 'no-universities-found',
          title: 'No universities found',
          content: 'No universities found',
          type: 'text',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'help-support': {
      pageId: 'help-support',
      sections: [
        {
          id: 'page-title',
          title: 'Help & Support',
          content: 'Get help or contact us',
          type: 'text',
        },
        {
          id: 'get-in-touch-title',
          title: 'Get in Touch',
          content: 'Contact Information',
          type: 'text',
        },
        {
          id: 'live-chat',
          title: 'Live Chat',
          content: 'Available 24/7',
          type: 'text',
        },
        {
          id: 'email-support',
          title: 'Email',
          content: 'glinaxtechinnovations@gmail.com',
          type: 'text',
        },
        {
          id: 'phone-support',
          title: 'Phone',
          content: '+233 24 123 4567',
          type: 'text',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
  };

  return (
    defaultContent[pageId] || {
      pageId,
      sections: [],
      lastUpdated: new Date().toISOString(),
    }
  );
}
