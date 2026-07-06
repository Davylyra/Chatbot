import { CacheManager } from '../utils/apiHelpers';
import { getDefaultContent as fetchDefaultContent } from '../mocks/defaultContent';

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
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  private getCacheManager(pageId: string): CacheManager<PageContent> {
    if (!this.contentCache.has(pageId)) {
      this.contentCache.set(
        pageId,
        new CacheManager<PageContent>(`content-${pageId}`, this.CACHE_DURATION)
      );
    }
    return this.contentCache.get(pageId)!;
  }

  async getPageContent(pageId: string): Promise<PageContent> {
    const cacheManager = this.getCacheManager(pageId);
    const cached = cacheManager.get();
    if (cached) {
      return cached;
    }

    return await this.getDefaultContentWithConfig(pageId);
  }

  async getSectionContent(pageId: string, sectionId: string): Promise<ContentSection | null> {
    const pageContent = await this.getPageContent(pageId);
    return pageContent.sections.find((section) => section.id === sectionId) || null;
  }

  async updateContent(pageId: string, sections: ContentSection[]): Promise<boolean> {
    try {
      const content: PageContent = {
        pageId,
        sections,
        lastUpdated: new Date().toISOString(),
      };
      const cacheManager = this.getCacheManager(pageId);
      cacheManager.set(content);
      return true;
    } catch (updateError) {
      console.error('Failed to update content:', updateError);
      return false;
    }
  }

  clearCache(): void {
    this.contentCache.forEach((manager) => manager.clear());
    this.contentCache.clear();
  }

  private async getDefaultContentWithConfig(pageId: string): Promise<PageContent> {
    const defaultContent = this.getDefaultContent(pageId);

    if (pageId === 'help-support') {
      try {
        const { configService } = await import('./configService');
        const supportEmail = await configService.getConfig('contact.support_email');
        const supportPhone = await configService.getConfig('contact.support_phone');

        const emailSection = defaultContent.sections.find((s) => s.id === 'email-support');
        const phoneSection = defaultContent.sections.find((s) => s.id === 'phone-support');

        if (emailSection && supportEmail) {
          emailSection.content = supportEmail;
        }
        if (phoneSection && supportPhone) {
          phoneSection.content = supportPhone;
        }
      } catch (configError) {
        console.warn('Failed to load dynamic contact configuration:', configError);
      }
    }

    return defaultContent;
  }

  private getDefaultContent(pageId: string): PageContent {
    return fetchDefaultContent(pageId);
  }
}

export const contentService = new ContentService();
