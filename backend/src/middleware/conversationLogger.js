/**
 * CONVERSATION LOGGING MIDDLEWARE - PRODUCTION READY
 * Automatically saves all conversations and user assessments to MongoDB
 * Built for Glinax - Ghanaian University Chatbot
 */

import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';

class ConversationLogger {
  constructor() {
    this.cache = new Map();
    this.batchQueue = [];
    this.BATCH_SIZE = 10;
    this.BATCH_TIMEOUT = 5000; // 5 seconds
    
    // Start batch processing
    setInterval(() => {
      this.processBatch();
    }, this.BATCH_TIMEOUT);
  }

  /**
   * Log conversation with enhanced metadata
   */
  async logConversation(data) {
    try {
      const conversationLog = {
        _id: new ObjectId(),
        conversation_id: data.conversationId,
        user_id: data.userId || 'anonymous',
        user_message: data.userMessage,
        bot_response: data.botResponse,
        university_context: data.universityContext,
        confidence_score: data.confidence || 0.0,
        sources: data.sources || [],
        processing_time: data.processingTime || 0,
        timestamp: new Date(),
        session_data: {
          user_agent: data.userAgent,
          ip_address: data.ipAddress,
          location: data.location || 'Ghana'
        },
        metadata: {
          response_type: data.responseType || 'ai_generated',
          model_used: data.modelUsed || 'hybrid-rag',
          tokens_used: data.tokensUsed || 0,
          query_type: this.classifyQuery(data.userMessage)
        }
      };

      // Add to batch queue for performance
      this.batchQueue.push({
        collection: 'conversation_logs',
        document: conversationLog
      });

      // Also update conversation summary
      await this.updateConversationSummary(data);

      return conversationLog._id;
    } catch (error) {
      console.error('❌ Error logging conversation:', error);
      throw error;
    }
  }

  /**
   * Save user assessment data with detailed tracking
   */
  async logAssessment(data) {
    try {
      const assessmentLog = {
        _id: new ObjectId(),
        user_id: data.userId || 'anonymous',
        conversation_id: data.conversationId,
        assessment_type: data.assessmentType || 'university_preference',
        assessment_data: {
          grades: data.grades || [],
          interests: data.interests || [],
          career_goals: data.careerGoals || '',
          preferred_location: data.preferredLocation || '',
          subjects: data.subjects || [],
          extracurricular: data.extracurricular || []
        },
        ai_recommendations: data.aiRecommendations || [],
        recommendation_confidence: data.recommendationConfidence || 0.0,
        university_matches: data.universityMatches || [],
        program_suggestions: data.programSuggestions || [],
        timestamp: new Date(),
        completed: data.completed || false,
        followup_actions: data.followupActions || [],
        metadata: {
          source: data.source || 'chat_assessment',
          version: '2.0.0',
          processing_model: data.processingModel || 'hybrid-rag'
        }
      };

      const assessmentCollection = await getCollection('user_assessments');
      const result = await assessmentCollection.insertOne(assessmentLog);

      // Update user profile with assessment
      await this.updateUserProfile(data.userId, assessmentLog);

      console.log(`✅ Assessment logged for user ${data.userId}: ${result.insertedId}`);
      return result.insertedId;
    } catch (error) {
      console.error('❌ Error logging assessment:', error);
      throw error;
    }
  }

  /**
   * Update conversation summary for analytics
   */
  async updateConversationSummary(data) {
    try {
      const summaryCollection = await getCollection('conversation_summaries');

      const summary = {
        conversation_id: data.conversationId,
        user_id: data.userId || 'anonymous',
        title: data.title || this.generateConversationTitle(data.userMessage),
        last_message: data.userMessage,
        last_bot_response: data.botResponse,
        university_context: data.universityContext,
        topics_discussed: this.extractTopics(data.userMessage),
        avg_confidence: data.confidence || 0.0,
        total_processing_time: data.processingTime || 0,
        created_at: new Date(),
        updated_at: new Date(),
        status: 'active'
      };

      await summaryCollection.updateOne(
        { conversation_id: data.conversationId },
        {
          $set: summary,
          $inc: { message_count: 1 },
          $push: {
            topics_discussed: { $each: summary.topics_discussed }
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('❌ Error updating conversation summary:', error);
    }
  }

  /**
   * Update user profile with assessment data
   */
  async updateUserProfile(userId, assessmentData) {
    if (!userId || userId === 'anonymous') return;

    try {
      const userProfilesCollection = await getCollection('user_profiles');
      
      const profileUpdate = {
        user_id: userId,
        last_assessment: assessmentData._id,
        assessment_count: 1,
        preferences: {
          subjects: assessmentData.assessment_data.subjects,
          career_goals: assessmentData.assessment_data.career_goals,
          preferred_location: assessmentData.assessment_data.preferred_location,
          interests: assessmentData.assessment_data.interests
        },
        ai_recommendations: assessmentData.ai_recommendations,
        university_matches: assessmentData.university_matches,
        updated_at: new Date()
      };

      await userProfilesCollection.updateOne(
        { user_id: userId },
        { 
          $set: profileUpdate,
          $inc: { assessment_count: 1 }
        },
        { upsert: true }
      );

      console.log(`✅ Updated profile for user ${userId}`);
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
    }
  }

  /**
   * Process batch queue for performance
   */
  async processBatch() {
    if (this.batchQueue.length === 0) return;

    try {
      const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
      
      const conversationLogs = batch.filter(item => item.collection === 'conversation_logs');
      
      if (conversationLogs.length > 0) {
        const logsCollection = await getCollection('conversation_logs');
        await logsCollection.insertMany(conversationLogs.map(item => item.document));
        console.log(`✅ Batch saved ${conversationLogs.length} conversation logs`);
      }
    } catch (error) {
      console.error('❌ Error processing batch:', error);
    }
  }

  /**
   * Classify user query type for analytics
   */
  classifyQuery(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('fee') || messageLower.includes('cost')) {
      return 'fees_inquiry';
    } else if (messageLower.includes('admission') || messageLower.includes('apply')) {
      return 'admission_inquiry';
    } else if (messageLower.includes('program') || messageLower.includes('course')) {
      return 'program_inquiry';
    } else if (messageLower.includes('scholarship')) {
      return 'scholarship_inquiry';
    } else if (messageLower.includes('assessment') || messageLower.includes('recommend')) {
      return 'assessment_request';
    } else {
      return 'general_inquiry';
    }
  }

  /**
   * Generate conversation title from first message
   */
  generateConversationTitle(message) {
    const words = message.split(' ').slice(0, 6);
    return words.join(' ') + (words.length === 6 ? '...' : '');
  }

  /**
   * Extract topics from message for analytics
   */
  extractTopics(message) {
    const topics = [];
    const messageLower = message.toLowerCase();
    
    const universityKeywords = {
      'university of ghana': 'University of Ghana',
      'ug': 'University of Ghana',
      'legon': 'University of Ghana',
      'knust': 'KNUST',
      'kumasi': 'KNUST',
      'ucc': 'University of Cape Coast',
      'cape coast': 'University of Cape Coast',
      'uds': 'University for Development Studies',
      'tamale': 'University for Development Studies'
    };

    const programKeywords = [
      'computer science', 'engineering', 'medicine', 'business',
      'nursing', 'law', 'education', 'agriculture'
    ];

    // Extract university mentions
    for (const [keyword, university] of Object.entries(universityKeywords)) {
      if (messageLower.includes(keyword)) {
        topics.push({ type: 'university', value: university });
      }
    }

    // Extract program mentions
    for (const program of programKeywords) {
      if (messageLower.includes(program)) {
        topics.push({ type: 'program', value: program });
      }
    }

    return topics;
  }

  /**
   * Get conversation analytics
   */
  async getAnalytics(timeframe = '7d') {
    try {
      const logsCollection = await getCollection('conversation_logs');
      const assessmentsCollection = await getCollection('user_assessments');
      
      const timeFilter = this.getTimeFilter(timeframe);
      
      const [
        totalConversations,
        totalAssessments,
        avgConfidence,
        topUniversities,
        queryTypes
      ] = await Promise.all([
        logsCollection.countDocuments(timeFilter),
        assessmentsCollection.countDocuments(timeFilter),
        logsCollection.aggregate([
          { $match: timeFilter },
          { $group: { _id: null, avgConfidence: { $avg: '$confidence_score' } } }
        ]).toArray(),
        logsCollection.aggregate([
          { $match: timeFilter },
          { $group: { _id: '$university_context', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray(),
        logsCollection.aggregate([
          { $match: timeFilter },
          { $group: { _id: '$metadata.query_type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).toArray()
      ]);

      return {
        timeframe,
        totalConversations,
        totalAssessments,
        avgConfidence: avgConfidence[0]?.avgConfidence || 0,
        topUniversities,
        queryTypes,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting analytics:', error);
      return null;
    }
  }

  /**
   * Helper to generate time filter
   */
  getTimeFilter(timeframe) {
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { timestamp: { $gte: startDate } };
  }
}

// Create singleton instance
const conversationLogger = new ConversationLogger();

/**
 * Middleware function for Express
 */
export const logConversationMiddleware = (req, res, next) => {
  // Store original res.json to intercept response
  const originalJson = res.json;

  res.json = function(data) {
    // Log the conversation after response
    setImmediate(async () => {
      try {
        if (req.body && req.body.message && data.reply) {
          await conversationLogger.logConversation({
            conversationId: req.body.conversation_id,
            userId: req.user?.id || req.body.user_id || 'anonymous',
            userMessage: req.body.message,
            botResponse: data.reply || data.message,
            universityContext: req.body.university_name,
            confidence: data.confidence,
            sources: data.sources,
            processingTime: data.processing_time,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            responseType: data.model_used,
            modelUsed: data.model_used
          });
        }
      } catch (error) {
        console.error('❌ Middleware logging error:', error);
      }
    });

    // Call original res.json
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Assessment logging function
 */
export const logAssessment = async (assessmentData) => {
  return await conversationLogger.logAssessment(assessmentData);
};

/**
 * Get conversation analytics
 */
export const getConversationAnalytics = async (timeframe) => {
  return await conversationLogger.getAnalytics(timeframe);
};

export default conversationLogger;
