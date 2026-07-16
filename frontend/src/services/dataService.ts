import { SmartApiService } from "./api";
import {
  getDefaultData as fetchDefaultData,
  getDefaultDataCollection as fetchDefaultDataCollection,
} from "../mocks/defaultData";

export interface DynamicData {
  id: string;
  type:
    | "user"
    | "university"
    | "form"
    | "notification"
    | "transaction"
    | "chat";
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
  private readonly CACHE_DURATION = 15 * 60 * 1000;

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
          lastUpdated: new Date().toISOString(),
        };

        this.dataCache.set(cacheKey, dynamicData);
        return dynamicData;
      }

      return this.getDefaultData(type, id);
    } catch (fetchError) {
      console.error("Failed to fetch dynamic data:", fetchError);
      return this.getDefaultData(type, id);
    }
  }

  async getDataCollection(
    type: string,
    filters?: Record<string, any>,
  ): Promise<DataCollection> {
    const cached = this.collectionCache.get(type);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    try {
      const response = await SmartApiService.getDynamicDataCollection(
        type,
        filters,
      );

      if (response.success && response.data) {
        const collection: DataCollection = {
          type,
          items: response.data.items || [],
          total: response.data.total || 0,
          lastUpdated: new Date().toISOString(),
        };

        collection.items.forEach((item) => {
          this.dataCache.set(`${type}:${item.id}`, item);
        });

        this.collectionCache.set(type, collection);
        return collection;
      }

      return this.getDefaultDataCollection(type);
    } catch (fetchError) {
      console.error("Failed to fetch dynamic data collection:", fetchError);
      return this.getDefaultDataCollection(type);
    }
  }

  async createData(type: string, payload: any): Promise<DynamicData | null> {
    try {
      const response = await SmartApiService.createDynamicData(type, payload);

      if (response.success && response.data) {
        const dynamicData: DynamicData = {
          id: response.data.id,
          type: type as any,
          data: response.data,
          metadata: response.data.metadata,
          lastUpdated: new Date().toISOString(),
        };

        this.dataCache.set(`${type}:${dynamicData.id}`, dynamicData);
        this.collectionCache.delete(type);

        return dynamicData;
      }

      return null;
    } catch (createError) {
      console.error("Failed to create dynamic data:", createError);
      return null;
    }
  }

  async updateData(type: string, id: string, payload: any): Promise<boolean> {
    try {
      const response = await SmartApiService.updateDynamicData(
        type,
        id,
        payload,
      );

      if (response.success) {
        const existing = this.dataCache.get(`${type}:${id}`);
        if (existing) {
          existing.data = { ...existing.data, ...payload };
          existing.lastUpdated = new Date().toISOString();
          this.dataCache.set(`${type}:${id}`, existing);
        }

        this.collectionCache.delete(type);
        return true;
      }

      return false;
    } catch (updateError) {
      console.error("Failed to update dynamic data:", updateError);
      return false;
    }
  }

  async deleteData(type: string, id: string): Promise<boolean> {
    try {
      const response = await SmartApiService.deleteDynamicData(type, id);

      if (response.success) {
        this.dataCache.delete(`${type}:${id}`);
        this.collectionCache.delete(type);
        return true;
      }

      return false;
    } catch (deleteError) {
      console.error("Failed to delete dynamic data:", deleteError);
      return false;
    }
  }

  clearCache(): void {
    this.dataCache.clear();
    this.collectionCache.clear();
  }

  private isCacheValid(lastUpdated: string): boolean {
    const now = new Date().getTime();
    const updated = new Date(lastUpdated).getTime();
    return now - updated < this.CACHE_DURATION;
  }

  private getDefaultData(type: string, id: string): DynamicData | null {
    return fetchDefaultData(type, id);
  }

  private getDefaultDataCollection(type: string): DataCollection {
    return fetchDefaultDataCollection(type);
  }
}

export const dataService = new DataService();
