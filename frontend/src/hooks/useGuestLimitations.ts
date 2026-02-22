/**
 * Guest Limitations Hook
 * Description: Manages guest user limitations and feature access
 * Integration: Used across components to control guest access
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface GuestLimitation {
  feature: string;
  description: string;
  benefits: string[];
}

export const useGuestLimitations = () => {
  const { isGuest } = useAuth();
  const [showLimitationModal, setShowLimitationModal] = useState(false);
  const [limitationData, setLimitationData] = useState<GuestLimitation | null>(null);

  const limitationConfigs: Record<string, GuestLimitation> = {
    profile: {
      feature: 'Profile Management',
      description: 'Access your personal profile, edit information, and manage your account settings.',
      benefits: [
        'Save and edit your personal information',
        'Manage your academic preferences',
        'Track your application history',
        'Customize your dashboard'
      ]
    },
    transactions: {
      feature: 'Transaction History',
      description: 'View your complete purchase history and transaction details.',
      benefits: [
        'View all your form purchases',
        'Download receipts and invoices',
        'Track payment history',
        'Manage subscription plans'
      ]
    },
    settings: {
      feature: 'Account Settings',
      description: 'Customize your app experience and manage your account preferences.',
      benefits: [
        'Change password and security settings',
        'Manage notification preferences',
        'Customize app appearance',
        'Export your data'
      ]
    },
    notifications: {
      feature: 'Notifications',
      description: 'Get personalized notifications about deadlines, updates, and important information.',
      benefits: [
        'Receive deadline reminders',
        'Get application updates',
        'University news and announcements',
        'Personalized recommendations'
      ]
    },
    recentChats: {
      feature: 'Chat History',
      description: 'Access your complete chat history and continue previous conversations.',
      benefits: [
        'View all your previous chats',
        'Continue interrupted conversations',
        'Search through chat history',
        'Export chat transcripts'
      ]
    },
    assessment: {
      feature: 'Program Assessment',
      description: 'Take our comprehensive assessment to discover the best programs for you.',
      benefits: [
        'Take personalized program assessments',
        'Get AI-powered recommendations',
        'Save assessment results permanently',
        'Track your academic progress'
      ]
    },
    universities: {
      feature: 'University Directory',
      description: 'Browse our complete database of universities and their programs.',
      benefits: [
        'Access full university database',
        'View detailed program information',
        'Compare universities side-by-side',
        'Get admission requirements'
      ]
    }
  };

  const checkGuestAccess = (feature: string): boolean => {
    if (!isGuest) return true;
    
    // Show limitation modal for guest users
    const config = limitationConfigs[feature];
    if (config) {
      setLimitationData(config);
      setShowLimitationModal(true);
    }
    
    return false;
  };

  const closeLimitationModal = () => {
    setShowLimitationModal(false);
    setLimitationData(null);
  };

  return {
    isGuest,
    showLimitationModal,
    limitationData,
    checkGuestAccess,
    closeLimitationModal
  };
};
