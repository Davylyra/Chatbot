/**
 * INTELLIGENT CACHING SYSTEM FOR GLINAX CHATBOT
 * Implements multi-tier caching for optimal performance
 * - In-memory cache for frequent queries
 * - MongoDB cache for complex AI responses  
 * - University data caching with TTL
 */

import { getCollection } from '../config/db.js';

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.MEMORY_CACHE_SIZE = 1000;
    this.MEMORY_TTL = 5 * 60 * 1000; // 5 minutes
    this.DB_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    
    // University data cache (longer TTL since it changes less frequently)
    this.universityCache = new Map();
    this.UNIVERSITY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Cleanup intervals
    setInterval(() => this.cleanupMemoryCache(), 5 * 60 * 1000);
    setInterval(() => this.cleanupUniversityCache(), 60 * 60 * 1000);
  }

  /**
   * Generate cache key from query and context
   */
  generateCacheKey(query, universityContext = null, userId = null) {
    const normalizedQuery = query.toLowerCase().trim();
    const contextKey = universityContext || 'general';
    const userKey = userId || 'anonymous';
    
    return `${contextKey}:${userKey}:${this.hashString(normalizedQuery)}`;
  }

  /**
   * Hash string for consistent cache keys
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Check if query should be cached (avoid caching personal data)
   */
  shouldCache(query, response) {
    const queryLower = query.toLowerCase();
    
    // Don't cache personal information
    const personalKeywords = ['my name', 'my phone', 'my email', 'personal', 'private'];
    if (personalKeywords.some(keyword => queryLower.includes(keyword))) {
      return false;
    }

    // Don't cache low confidence responses
    if (response.confidence && response.confidence < 0.6) {
      return false;
    }

    // Don't cache very short queries
    if (query.length < 10) {
      return false;
    }

    return true;
  }

  /**
   * Get cached response (checks memory first, then DB)
   */
  async getCachedResponse(query, universityContext = null, userId = null) {
    try {
      const cacheKey = this.generateCacheKey(query, universityContext, userId);
      
      // Check memory cache first (fastest)
      const memoryCacheResult = this.getFromMemoryCache(cacheKey);
      if (memoryCacheResult) {
        console.log(`🚀 Memory cache HIT: ${cacheKey}`);
        return {
          ...memoryCacheResult,
          cached: true,
          cache_type: 'memory'
        };
      }

      // Check database cache (slower but persistent)
      const dbCacheResult = await this.getFromDbCache(cacheKey);
      if (dbCacheResult) {
        console.log(`💾 DB cache HIT: ${cacheKey}`);
        
        // Promote to memory cache
        this.setInMemoryCache(cacheKey, dbCacheResult);
        
        return {
          ...dbCacheResult,
          cached: true,
          cache_type: 'database'
        };
      }

      console.log(`❌ Cache MISS: ${cacheKey}`);
      return null;
    } catch (error) {
      console.error('❌ Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * Cache AI response for future use
   */
  async cacheResponse(query, response, universityContext = null, userId = null) {
    try {
      if (!this.shouldCache(query, response)) {
        console.log('🚫 Skipping cache (personal/low confidence)');
        return false;
      }

      const cacheKey = this.generateCacheKey(query, universityContext, userId);
      const cacheData = {
        query: query,
        response: response.reply || response.message,
        sources: response.sources || [],
        confidence: response.confidence || 0.0,
        university_context: universityContext,
        timestamp: new Date(),
        hit_count: 1,
        model_used: response.model_used || 'unknown'
      };

      // Store in memory cache
      this.setInMemoryCache(cacheKey, cacheData);

      // Store in database cache (for persistence)
      await this.setInDbCache(cacheKey, cacheData);

      console.log(`✅ Cached response: ${cacheKey}`);
      return true;
    } catch (error) {
      console.error('❌ Cache storage error:', error);
      return false;
    }
  }

  /**
   * Memory cache operations
   */
  getFromMemoryCache(key) {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.stored > this.MEMORY_TTL) {
      this.memoryCache.delete(key);
      return null;
    }

    // Update hit count
    cached.data.hit_count = (cached.data.hit_count || 0) + 1;
    cached.lastAccess = Date.now();

    return cached.data;
  }

  setInMemoryCache(key, data) {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const oldestKey = this.findOldestCacheKey();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(key, {
      data: data,
      stored: Date.now(),
      lastAccess: Date.now()
    });
  }

  findOldestCacheKey() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.memoryCache.entries()) {
      if (value.lastAccess < oldestTime) {
        oldestTime = value.lastAccess;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  cleanupMemoryCache() {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.stored > this.MEMORY_TTL) {
        this.memoryCache.delete(key);
      }
    }
    console.log(`🧹 Memory cache cleanup: ${this.memoryCache.size} items remaining`);
  }

  /**
   * Database cache operations
   */
  async getFromDbCache(key) {
    try {
      const cacheCollection = await getCollection('response_cache');
      const cached = await cacheCollection.findOne({
        cache_key: key,
        expires_at: { $gt: new Date() }
      });

      if (cached) {
        // Update hit count
        await cacheCollection.updateOne(
          { cache_key: key },
          { 
            $inc: { hit_count: 1 },
            $set: { last_accessed: new Date() }
          }
        );

        return {
          query: cached.query,
          reply: cached.response,
          sources: cached.sources,
          confidence: cached.confidence,
          hit_count: cached.hit_count + 1
        };
      }

      return null;
    } catch (error) {
      console.error('❌ DB cache retrieval error:', error);
      return null;
    }
  }

  async setInDbCache(key, data) {
    try {
      const cacheCollection = await getCollection('response_cache');
      
      const cacheDoc = {
        cache_key: key,
        query: data.query,
        response: data.response,
        sources: data.sources,
        confidence: data.confidence,
        university_context: data.university_context,
        model_used: data.model_used,
        hit_count: 1,
        created_at: new Date(),
        last_accessed: new Date(),
        expires_at: new Date(Date.now() + this.DB_CACHE_TTL)
      };

      await cacheCollection.replaceOne(
        { cache_key: key },
        cacheDoc,
        { upsert: true }
      );

      return true;
    } catch (error) {
      console.error('❌ DB cache storage error:', error);
      return false;
    }
  }

  /**
   * University-specific caching (longer TTL)
   */
  async cacheUniversityData(universityName, dataType, data) {
    const key = `university:${universityName}:${dataType}`;
    
    this.universityCache.set(key, {
      data: data,
      timestamp: Date.now()
    });

    // Also persist to DB
    try {
      const universityCollection = await getCollection('university_cache');
      await universityCollection.replaceOne(
        { cache_key: key },
        {
          cache_key: key,
          university_name: universityName,
          data_type: dataType,
          data: data,
          created_at: new Date(),
          expires_at: new Date(Date.now() + this.UNIVERSITY_CACHE_TTL)
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('❌ University cache storage error:', error);
    }
  }

  async getUniversityData(universityName, dataType) {
    const key = `university:${universityName}:${dataType}`;
    
    // Check memory first
    const cached = this.universityCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.UNIVERSITY_CACHE_TTL) {
      return cached.data;
    }

    // Check database
    try {
      const universityCollection = await getCollection('university_cache');
      const result = await universityCollection.findOne({
        cache_key: key,
        expires_at: { $gt: new Date() }
      });

      if (result) {
        // Promote to memory
        this.universityCache.set(key, {
          data: result.data,
          timestamp: Date.now()
        });

        return result.data;
      }
    } catch (error) {
      console.error('❌ University cache retrieval error:', error);
    }

    return null;
  }

  cleanupUniversityCache() {
    const now = Date.now();
    for (const [key, value] of this.universityCache.entries()) {
      if (now - value.timestamp > this.UNIVERSITY_CACHE_TTL) {
        this.universityCache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for specific patterns
   */
  async invalidateCache(pattern) {
    try {
      // Clear memory cache
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
        }
      }

      // Clear database cache
      const cacheCollection = await getCollection('response_cache');
      await cacheCollection.deleteMany({
        cache_key: { $regex: pattern, $options: 'i' }
      });

      console.log(`🗑️ Invalidated cache for pattern: ${pattern}`);
    } catch (error) {
      console.error('❌ Cache invalidation error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const cacheCollection = await getCollection('response_cache');
      
      const [
        totalCached,
        hitStats,
        topQueries
      ] = await Promise.all([
        cacheCollection.countDocuments(),
        cacheCollection.aggregate([
          { $group: { 
            _id: null, 
            totalHits: { $sum: '$hit_count' },
            avgHits: { $avg: '$hit_count' }
          }}
        ]).toArray(),
        cacheCollection.find()
          .sort({ hit_count: -1 })
          .limit(10)
          .project({ query: 1, hit_count: 1, university_context: 1 })
          .toArray()
      ]);

      return {
        memory_cache_size: this.memoryCache.size,
        memory_cache_limit: this.MEMORY_CACHE_SIZE,
        db_cache_size: totalCached,
        total_hits: hitStats[0]?.totalHits || 0,
        avg_hits_per_query: hitStats[0]?.avgHits || 0,
        top_queries: topQueries,
        university_cache_size: this.universityCache.size
      };
    } catch (error) {
      console.error('❌ Cache stats error:', error);
      return null;
    }
  }

  /**
   * Warm up cache with common queries
   */
  async warmUpCache() {
    const commonQueries = [
      'Computer Science requirements at University of Ghana',
      'KNUST engineering programs and fees',
      'University of Cape Coast admission requirements',
      'Scholarship opportunities in Ghana universities',
      'Medicine program requirements at UG',
      'Business Administration fees at KNUST'
    ];

    console.log('🔥 Warming up cache with common queries...');
    
    for (const query of commonQueries) {
      const cached = await this.getCachedResponse(query);
      if (!cached) {
        console.log(`📝 Query not cached: ${query}`);
      }
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

/**
 * Cache middleware for Express
 */
export const cacheMiddleware = async (req, res, next) => {
  try {
    // Only cache GET requests and specific POST endpoints
    if (req.method !== 'POST' || !req.body.message) {
      return next();
    }

    const cached = await cacheManager.getCachedResponse(
      req.body.message,
      req.body.university_name,
      req.user?.id
    );

    if (cached) {
      return res.json({
        success: true,
        reply: cached.reply,
        sources: cached.sources || [],
        confidence: cached.confidence || 0.8,
        timestamp: new Date().toISOString(),
        cached: true,
        cache_type: cached.cache_type,
        hit_count: cached.hit_count
      });
    }

    // Store original res.json to cache response
    const originalJson = res.json;
    res.json = function(data) {
      // Cache the response after sending
      if (data.success && data.reply) {
        setImmediate(async () => {
          await cacheManager.cacheResponse(
            req.body.message,
            data,
            req.body.university_name,
            req.user?.id
          );
        });
      }
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('❌ Cache middleware error:', error);
    next();
  }
};

export { cacheManager };
export default cacheManager;