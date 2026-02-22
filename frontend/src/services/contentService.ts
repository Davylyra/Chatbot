/**
 * Content Service
 * Description: Centralized service for managing all dynamic content and text
 * Integration: Replaces all hardcoded text with AI-managed content
 */

import { SmartApiService } from './api';
import { CacheManager } from '../utils/apiHelpers';

export interface ContentSection {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'list' | 'html';
  metadata?: Record<string, any>;
}

export interface PageContent {
  pageId: string;
  sections: ContentSection[];
  lastUpdated: string;
}

class ContentService {
  private contentCache = new Map<string, CacheManager<PageContent>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get or create cache manager for a page
   */
  private getCacheManager(pageId: string): CacheManager<PageContent> {
    if (!this.contentCache.has(pageId)) {
      this.contentCache.set(pageId, new CacheManager<PageContent>(`content-${pageId}`, this.CACHE_DURATION));
    }
    return this.contentCache.get(pageId)!;
  }

  /**
   * Get content for a specific page
   */
  async getPageContent(pageId: string): Promise<PageContent> {
    // Check cache first
    const cacheManager = this.getCacheManager(pageId);
    const cached = cacheManager.get();
    if (cached) {
      return cached;
    }

    try {
      // Fetch from AI service
      const response = await SmartApiService.getPageContent(pageId);
      
      if (response.success && response.data) {
        const content: PageContent = {
          pageId,
          sections: response.data.sections || [],
          lastUpdated: new Date().toISOString()
        };
        
        // Cache the content
        cacheManager.set(content);
        return content;
      }
      
      // Fallback to default content with dynamic configuration
      return await this.getDefaultContentWithConfig(pageId);
    } catch (error) {
      console.error('Failed to fetch page content:', error);
      return await this.getDefaultContentWithConfig(pageId);
    }
  }

  /**
   * Get specific section content
   */
  async getSectionContent(pageId: string, sectionId: string): Promise<ContentSection | null> {
    const pageContent = await this.getPageContent(pageId);
    return pageContent.sections.find(section => section.id === sectionId) || null;
  }

  /**
   * Update content (for admin use)
   */
  async updateContent(pageId: string, sections: ContentSection[]): Promise<boolean> {
    try {
      const response = await SmartApiService.updatePageContent(pageId, { sections });
      
      if (response.success) {
        // Update cache
        const content: PageContent = {
          pageId,
          sections,
          lastUpdated: new Date().toISOString()
        };
        const cacheManager = this.getCacheManager(pageId);
        cacheManager.set(content);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to update content:', error);
      return false;
    }
  }

  /**
   * Clear content cache
   */
  clearCache(): void {
    this.contentCache.forEach(manager => manager.clear());
    this.contentCache.clear();
  }

  /**
   * Get default content with dynamic configuration as fallback
   */
  private async getDefaultContentWithConfig(pageId: string): Promise<PageContent> {
    const defaultContent = this.getDefaultContent(pageId);
    
    // Load dynamic configuration for contact information
    if (pageId === 'help-support') {
      try {
        const { configService } = await import('./configService');
        const supportEmail = await configService.getConfig('contact.support_email');
        const supportPhone = await configService.getConfig('contact.support_phone');
        
        // Update contact information with dynamic config
        const emailSection = defaultContent.sections.find(s => s.id === 'email-support');
        const phoneSection = defaultContent.sections.find(s => s.id === 'phone-support');
        
        if (emailSection && supportEmail) {
          emailSection.content = supportEmail;
        }
        if (phoneSection && supportPhone) {
          phoneSection.content = supportPhone;
        }
      } catch (error) {
        console.warn('Failed to load dynamic contact configuration:', error);
      }
    }
    
    return defaultContent;
  }

  /**
   * Get default content as fallback
   */
  private getDefaultContent(pageId: string): PageContent {
    const defaultContent: Record<string, PageContent> = {
      'notifications': {
        pageId: 'notifications',
        sections: [
          {
            id: 'page-title',
            title: 'Notifications',
            content: 'Updates and Alerts',
            type: 'text'
          },
          {
            id: 'empty-state',
            title: 'No notifications yet',
            content: "You'll see updates and alerts here when they arrive.",
            type: 'text'
          },
          {
            id: 'success-message',
            title: 'Success',
            content: 'All notifications marked as read',
            type: 'text'
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'forms': {
        pageId: 'forms',
        sections: [
          {
            id: 'page-title',
            title: 'Buy Admission Forms',
            content: 'Universities Form',
            type: 'text'
          },
          {
            id: 'payment-methods-title',
            title: 'Secure Mobile Money Payment',
            content: 'Make payments via',
            type: 'text'
          },
          {
            id: 'email-verification-title',
            title: 'Email Verification Required',
            content: 'Please verify your email address before purchasing forms. You\'ll receive a verification code when initiating payment.',
            type: 'text'
          },
          {
            id: 'guest-notice',
            title: 'Guest Mode',
            content: 'You\'re purchasing as a guest. Consider creating an account to save your purchase history.',
            type: 'text'
          },
          {
            id: 'empty-state',
            title: 'No forms found',
            content: 'No admission forms available.',
            type: 'text'
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'about': {
        pageId: 'about',
        sections: [
          {
            id: 'app-title',
            title: 'Glinax Chatbot',
            content: 'Your AI Assistant for Ghana University Admissions',
            type: 'text'
          },
          {
            id: 'version',
            title: 'Version',
            content: '2.1.0',
            type: 'text'
          },
          {
            id: 'features-title',
            title: 'Features',
            content: 'Key features of our platform',
            type: 'text'
          },
          {
            id: 'ai-assistance',
            title: 'AI-Powered Assistance',
            content: 'Get instant answers to your admission questions',
            type: 'text'
          },
          {
            id: 'university-network',
            title: 'University Network',
            content: 'Access information from all major Ghanaian universities',
            type: 'text'
          },
          {
            id: 'personalized-recommendations',
            title: 'Personalized Recommendations',
            content: 'Get program recommendations based on your interests',
            type: 'text'
          },
          {
            id: 'mission-title',
            title: 'Our Mission',
            content: 'To simplify the university admission process in Ghana by providing students with easy access to information, guidance, and support through our AI-powered platform. We believe every student deserves the opportunity to pursue higher education.',
            type: 'text'
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'home': {
        pageId: 'home',
        sections: [
          {
            id: 'welcome-message',
            title: 'Welcome',
            content: 'Your AI Assistant for Ghana University Admissions',
            type: 'text'
          },
          {
            id: 'guest-mode-notice',
            title: 'Guest Mode',
            content: 'Guest Mode - Limited Features',
            type: 'text'
          },
          {
            id: 'start-chat-button',
            title: 'Start New Chat',
            content: 'Start New Chat',
            type: 'text'
          },
          {
            id: 'buy-forms-button',
            title: 'Buy Forms',
            content: 'Buy Forms',
            type: 'text'
          },
          {
            id: 'program-recommendation-title',
            title: 'Get Program Recommendation',
            content: 'Tell us your grades and interests, and we\'ll recommend the best programs for you',
            type: 'text'
          },
          {
            id: 'start-assessment-button',
            title: 'Start Assessment',
            content: 'Start Assessment',
            type: 'text'
          },
          {
            id: 'university-sessions-title',
            title: 'University Sessions',
            content: 'University Sessions',
            type: 'text'
          },
          {
            id: 'view-all-universities-button',
            title: 'View All Universities',
            content: 'View All Universities',
            type: 'text'
          },
          {
            id: 'no-universities-found',
            title: 'No universities found',
            content: 'No universities found',
            type: 'text'
          }
        ],
        lastUpdated: new Date().toISOString()
      },
      'help-support': {
        pageId: 'help-support',
        sections: [
          {
            id: 'page-title',
            title: 'Help & Support',
            content: 'Get help or contact us',
            type: 'text'
          },
          {
            id: 'get-in-touch-title',
            title: 'Get in Touch',
            content: 'Contact Information',
            type: 'text'
          },
          {
            id: 'live-chat',
            title: 'Live Chat',
            content: 'Available 24/7',
            type: 'text'
          },
          {
            id: 'email-support',
            title: 'Email',
            content: 'support@glinax.com', // Will be replaced by dynamic config
            type: 'text'
          },
          {
            id: 'phone-support',
            title: 'Phone',
            content: '+233 24 123 4567', // Will be replaced by dynamic config
            type: 'text'
          }
        ],
        lastUpdated: new Date().toISOString()
      }
    };

    return defaultContent[pageId] || {
      pageId,
      sections: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

export const contentService = new ContentService();
