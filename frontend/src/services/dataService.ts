/**
 * Data Service
 * Description: Centralized service for managing all dynamic data (users, universities, forms, etc.)
 * Integration: Replaces all hardcoded data with AI-managed dynamic content
 */

import { SmartApiService } from './api';

export interface DynamicData {
  id: string;
  type: 'user' | 'university' | 'form' | 'notification' | 'transaction' | 'chat';
  data: any;
  metadata?: Record<string, any>;
  lastUpdated: string;
}

export interface DataCollection {
  type: string;
  items: DynamicData[];
  total: number;
  lastUpdated: string;
}

class DataService {
  private dataCache: Map<string, DynamicData> = new Map();
  private collectionCache: Map<string, DataCollection> = new Map();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Get dynamic data by ID and type
   */
  async getData(type: string, id: string): Promise<DynamicData | null> {
    const cacheKey = `${type}:${id}`;

    const cached = this.dataCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    try {

      const response = await SmartApiService.getDynamicData(type, id);
      
      if (response.success && response.data) {
        const dynamicData: DynamicData = {
          id,
          type: type as any,
          data: response.data,
          metadata: response.data.metadata,
          lastUpdated: new Date().toISOString()
        };
        
        // Cache the data
        this.dataCache.set(cacheKey, dynamicData);
        return dynamicData;
      }
      
      return this.getDefaultData(type, id);
    } catch (error) {
      console.error('Failed to fetch dynamic data:', error);
      return this.getDefaultData(type, id);
    }
  }

  /**
   * Get collection of dynamic data
   */
  async getDataCollection(type: string, filters?: Record<string, any>): Promise<DataCollection> {

    const cached = this.collectionCache.get(type);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    try {

      const response = await SmartApiService.getDynamicDataCollection(type, filters);
      
      if (response.success && response.data) {
        const collection: DataCollection = {
          type,
          items: response.data.items || [],
          total: response.data.total || 0,
          lastUpdated: new Date().toISOString()
        };
        
        // Cache individual items
        collection.items.forEach(item => {
          this.dataCache.set(`${type}:${item.id}`, item);
        });
        
        // Cache the collection
        this.collectionCache.set(type, collection);
        return collection;
      }
      
      return this.getDefaultDataCollection(type);
    } catch (error) {
      console.error('Failed to fetch dynamic data collection:', error);
      return this.getDefaultDataCollection(type);
    }
  }

  /**
   * Create new dynamic data
   */
  async createData(type: string, data: any): Promise<DynamicData | null> {
    try {
      const response = await SmartApiService.createDynamicData(type, data);
      
      if (response.success && response.data) {
        const dynamicData: DynamicData = {
          id: response.data.id,
          type: type as any,
          data: response.data,
          metadata: response.data.metadata,
          lastUpdated: new Date().toISOString()
        };
        
        // Cache the new data
        this.dataCache.set(`${type}:${dynamicData.id}`, dynamicData);
        
        // Invalidate collection cache
        this.collectionCache.delete(type);
        
        return dynamicData;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to create dynamic data:', error);
      return null;
    }
  }

  /**
   * Update existing dynamic data
   */
  async updateData(type: string, id: string, data: any): Promise<boolean> {
    try {
      const response = await SmartApiService.updateDynamicData(type, id, data);
      
      if (response.success) {

        const existing = this.dataCache.get(`${type}:${id}`);
        if (existing) {
          existing.data = { ...existing.data, ...data };
          existing.lastUpdated = new Date().toISOString();
          this.dataCache.set(`${type}:${id}`, existing);
        }
        
        // Invalidate collection cache
        this.collectionCache.delete(type);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to update dynamic data:', error);
      return false;
    }
  }

  /**
   * Delete dynamic data
   */
  async deleteData(type: string, id: string): Promise<boolean> {
    try {
      const response = await SmartApiService.deleteDynamicData(type, id);
      
      if (response.success) {

        this.dataCache.delete(`${type}:${id}`);
        
        // Invalidate collection cache
        this.collectionCache.delete(type);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to delete dynamic data:', error);
      return false;
    }
  }

  /**
   * Clear data cache
   */
  clearCache(): void {
    this.dataCache.clear();
    this.collectionCache.clear();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(lastUpdated: string): boolean {
    const now = new Date().getTime();
    const updated = new Date(lastUpdated).getTime();
    return (now - updated) < this.CACHE_DURATION;
  }

  /**
   * Get default data as fallback
   */
  private getDefaultData(type: string, id: string): DynamicData | null {
    const defaultData: Record<string, Record<string, any>> = {
      'user': {
        '1': {
          id: '1',
          name: 'User',
          email: 'user@example.com',
          phone: '+233123456789',
          createdAt: '2025-01-15T10:00:00Z',
          location: 'Accra, Ghana',
          bio: 'Passionate about technology and education',
          interests: ['Computer Science', 'Engineering', 'Technology'],
          preferredUniversities: ['KNUST', 'UG', 'Ashesi']
        }
      },
      'university': {
        '1': {
          id: '1',
          name: 'KNUST',
          fullName: 'Kwame Nkrumah University of Science & Technology',
          location: 'Kumasi, Ashanti Region',
          established: 1952,
          studentCount: '50,000+',
          type: 'public',
          programs: ['Engineering', 'Medicine', 'Agriculture', 'Business', 'Science'],
          logo: '/university-logos/knust-logo.png',
          formPrice: '₵290',
          buyPrice: '₵290',
          deadline: '2026-12-31',
          isAvailable: true,
          description: 'Ghana\'s premier science and technology university'
        }
      }
    };

    const data = defaultData[type]?.[id];
    if (!data) return null;

    return {
      id,
      type: type as any,
      data,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get default data collection as fallback
   */
  private getDefaultDataCollection(type: string): DataCollection {
    const defaultCollections: Record<string, DataCollection> = {
      'users': {
        type: 'users',
        items: [
          {
            id: '1',
            type: 'user',
            data: {
              id: '1',
              name: 'User',
              email: 'user@example.com',
              phone: '+233123456789',
              createdAt: '2025-01-15T10:00:00Z',
              location: 'Accra, Ghana',
              bio: 'Passionate about technology and education',
              interests: ['Computer Science', 'Engineering', 'Technology'],
              preferredUniversities: ['KNUST', 'UG', 'Ashesi']
            },
            lastUpdated: new Date().toISOString()
          }
        ],
        total: 1,
        lastUpdated: new Date().toISOString()
      },
      'universities': {
        type: 'universities',
        items: [
          {
            id: '1',
            type: 'university',
            data: {
              id: '1',
              name: 'KNUST',
              fullName: 'Kwame Nkrumah University of Science & Technology',
              location: 'Kumasi, Ashanti Region',
              established: 1952,
              studentCount: '50,000+',
              type: 'public',
              programs: ['Engineering', 'Medicine', 'Agriculture', 'Business', 'Science'],
              logo: '/university-logos/knust-logo.png',
              formPrice: '₵290',
              buyPrice: '₵290',
              deadline: '2026-12-31',
              isAvailable: true,
              description: 'Ghana\'s premier science and technology university'
            },
            lastUpdated: new Date().toISOString()
          }
        ],
        total: 1,
        lastUpdated: new Date().toISOString()
      }
    };

    return defaultCollections[type] || {
      type,
      items: [],
      total: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

export const dataService = new DataService();
