/**
 * ASSESSMENT ROUTES - Enhanced for tracking user evaluations
 * Handles university recommendation assessments with AI integration
 */

import express from "express";
import { getCollection } from "../config/db.js";
import { ObjectId } from "mongodb";
import authMiddleware from "../middleware/authMiddleware.js";
import { logAssessment } from "../middleware/conversationLogger.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { matchUniversitiesToProfile, getTopUniversityMatches } from "../utils/universityMatcher.js";
import { ghanaUniversitiesDatabase, getAllUniversities } from "../data/ghanaUniversitiesDatabase.js";

dotenv.config();

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000/respond";

/**
 * Submit user assessment and get AI recommendations
 */
router.post("/submit", async (req, res) => {
  try {
    const {
      userId,
      conversationId,
      assessmentData,
      assessmentType = "university_preference"
    } = req.body;

    console.log(`📋 Processing assessment for user: ${userId || 'anonymous'}`);

    // Validate required data
    if (!assessmentData) {
      return res.status(400).json({
        success: false,
        message: "Assessment data is required"
      });
    }

    // Generate AI recommendations based on assessment
    console.log('🤖 Generating AI recommendations...');
    const aiRecommendations = await generateAIRecommendations(assessmentData);

    // Create comprehensive assessment record
    const assessmentRecord = {
      user_id: userId || 'anonymous',
      conversation_id: conversationId,
      assessment_type: assessmentType,
      assessment_data: {
        grades: assessmentData.grades || [],
        subjects: assessmentData.subjects || [],
        shs_program: assessmentData.shsProgram || '',
        wassce_grade: assessmentData.wassceGrade || '',
        interests: assessmentData.interests || [],
        career_goals: assessmentData.careerGoals || '',
        preferred_location: assessmentData.preferredLocation || '',
        extracurricular: assessmentData.extracurricular || [],
        financial_situation: assessmentData.financialSituation || '',
        program_preferences: assessmentData.programPreferences || []
      },
      ai_recommendations: aiRecommendations.recommendations || [],
      university_matches: aiRecommendations.universityMatches || [],
      recommendation_confidence: aiRecommendations.confidence || 0.0,
      completed: true,
      followup_actions: aiRecommendations.followupActions || [],
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {
        source: 'chat_assessment',
        version: '2.0.0',
        processing_model: aiRecommendations.modelUsed || 'hybrid-rag'
      }
    };

    // Log assessment using middleware
    const assessmentId = await logAssessment(assessmentRecord);

    // Update user profile
    if (userId && userId !== 'anonymous') {
      await updateUserProfile(userId, assessmentRecord);
    }

    // Generate personalized message for chat
    const personalizedMessage = generateAssessmentMessage(assessmentRecord);

    console.log(`✅ Assessment processed with ID: ${assessmentId}`);

    res.json({
      success: true,
      assessment_id: assessmentId,
      recommendations: aiRecommendations.recommendations,
      university_matches: aiRecommendations.universityMatches,
      confidence: aiRecommendations.confidence,
      personalized_message: personalizedMessage,
      followup_actions: aiRecommendations.followupActions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Assessment submission error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process assessment",
      error: error.message
    });
  }
});

/**
 * Get user's assessment history
 */
router.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const assessmentsCollection = await getCollection("user_assessments");
    
    const [assessments, total] = await Promise.all([
      assessmentsCollection
        .find({ user_id: userId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      assessmentsCollection.countDocuments({ user_id: userId })
    ]);

    const formattedAssessments = assessments.map(assessment => ({
      id: assessment._id.toString(),
      assessment_type: assessment.assessment_type,
      completed: assessment.completed,
      recommendations_count: assessment.ai_recommendations?.length || 0,
      university_matches_count: assessment.university_matches?.length || 0,
      confidence: assessment.recommendation_confidence,
      created_at: assessment.created_at,
      summary: generateAssessmentSummary(assessment)
    }));

    res.json({
      success: true,
      assessments: formattedAssessments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("❌ Assessment history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assessment history"
    });
  }
});

/**
 * Get specific assessment details
 */
router.get("/:assessmentId", authMiddleware, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user.id;

    const assessmentsCollection = await getCollection("user_assessments");
    const assessment = await assessmentsCollection.findOne({
      _id: new ObjectId(assessmentId),
      user_id: new ObjectId(userId)
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: "Assessment not found"
      });
    }

    res.json({
      success: true,
      assessment: {
        id: assessment._id.toString(),
        assessment_type: assessment.assessment_type,
        assessment_data: assessment.assessment_data,
        ai_recommendations: assessment.ai_recommendations,
        university_matches: assessment.university_matches,
        confidence: assessment.recommendation_confidence,
        followup_actions: assessment.followup_actions,
        created_at: assessment.created_at,
        metadata: assessment.metadata
      }
    });

  } catch (error) {
    console.error("❌ Assessment fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assessment details"
    });
  }
});

/**
 * Update assessment with user feedback
 */
router.put("/:assessmentId/feedback", authMiddleware, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user.id;
    const { helpful, rating, comments, selected_universities } = req.body;

    const assessmentsCollection = await getCollection("user_assessments");
    
    const updateData = {
      user_feedback: {
        helpful: helpful,
        rating: rating, // 1-5 rating
        comments: comments,
        selected_universities: selected_universities || [],
        feedback_date: new Date()
      },
      updated_at: new Date()
    };

    const result = await assessmentsCollection.updateOne(
      {
        _id: new ObjectId(assessmentId),
        user_id: new ObjectId(userId)
      },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Assessment not found"
      });
    }

    console.log(`✅ Assessment feedback updated: ${assessmentId}`);
    
    res.json({
      success: true,
      message: "Feedback saved successfully",
      assessment_id: assessmentId
    });

  } catch (error) {
    console.error("❌ Assessment feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save feedback"
    });
  }
});

/**
 * Generate AI recommendations based on assessment data
 */
async function generateAIRecommendations(assessmentData) {
  try {
    // IMPORTANT: For assessment requests, we use the unbiased assessment-driven matcher
    // NOT the AI service. This ensures fair, data-driven recommendations.
    
    console.log('🎯 Using assessment-driven matcher (NOT AI service - ensures fairness)');
    
    // Directly use the unbiased matcher
    const universityMatches = getTopUniversityMatches(assessmentData, 5);
    
    // Build structured recommendations
    const recommendations = universityMatches.slice(0, 3).map((match, index) => ({
      university_name: match.universityName,
      program_name: match.recommendedPrograms[0]?.name || 'Multiple Programs Available',
      confidence_score: match.matchScore / 100,
      reasoning: match.reasoning,
      requirements_met: assessRequirementsMet(assessmentData, match.universityName),
      scholarship_eligible: assessScholarshipEligibility(assessmentData),
      career_alignment: Math.round((match.matchBreakdown.careerAlignment / 25) * 10),
      priority: index + 1,
      match_breakdown: match.matchBreakdown,
      recommended_programs: match.recommendedPrograms
    }));

    const formattedMatches = universityMatches.map(match => ({
      university_name: match.universityName,
      match_score: match.matchScore,
      programs_eligible: match.recommendedPrograms.map(p => p.name),
      strengths: match.strengths,
      location: match.location,
      type: match.type,
      concerns: generateConcerns(assessmentData, match.universityName),
      next_steps: generateNextSteps(match.universityName),
      reasoning: match.reasoning
    }));

    console.log(`✅ Top recommendation: ${universityMatches[0]?.universityName} (score: ${universityMatches[0]?.matchScore})`);

    return {
      recommendations: recommendations,
      universityMatches: formattedMatches,
      confidence: 0.95, // High confidence using assessment-driven matcher
      followupActions: generateFollowupActions(assessmentData),
      modelUsed: 'assessment-driven-matcher'
    };

  } catch (error) {
    console.error('❌ Assessment matching error:', error);
    
    // Fallback to rule-based recommendations
    return generateFallbackRecommendations(assessmentData);
  }
}



/**
 * Generate fallback recommendations when matcher fails
 */
function generateFallbackRecommendations(assessmentData) {
  console.log('🔄 Generating fallback recommendations using assessment-driven matching...');
  
  // Use unbiased matcher even for fallback
  const matches = getTopUniversityMatches(assessmentData, 3);
  
  const fallbackRecommendations = matches.map((match, index) => ({
    university_name: match.universityName,
    program_name: match.recommendedPrograms[0]?.name || 'Multiple Programs Available',
    confidence_score: match.matchScore / 100,
    reasoning: match.reasoning,
    requirements_met: true,
    scholarship_eligible: assessScholarshipEligibility(assessmentData),
    career_alignment: Math.round((match.matchBreakdown.careerAlignment / 25) * 10),
    priority: index + 1
  }));

  return {
    recommendations: fallbackRecommendations,
    universityMatches: matches.map(m => ({
      university_name: m.universityName,
      match_score: m.matchScore,
      programs_eligible: m.recommendedPrograms.map(p => p.name),
      strengths: m.strengths,
      location: m.location
    })),
    confidence: 0.7,
    followupActions: [
      "Research specific program requirements for recommended universities",
      "Visit university websites for current application information",
      "Contact admissions offices for personalized guidance"
    ],
    modelUsed: 'assessment-driven-fallback'
  };
}

/**
 * Helper functions for recommendation processing
 */
function assessRequirementsMet(assessmentData, universityName) {
  // Simplified - check if user has basic qualifications
  return assessmentData.grades && assessmentData.grades.length > 0;
}

function assessScholarshipEligibility(assessmentData) {
  // Check if user needs or qualifies for scholarships
  return assessmentData.financialSituation === 'need_scholarship' || 
         assessmentData.grades?.some(grade => grade.match(/^[A-C]/i));
}

function generateConcerns(assessmentData, universityName) {
  const concerns = [];
  
  if (assessmentData.financialSituation === 'need_scholarship' || assessmentData.financialSituation === 'financial_constraints') {
    concerns.push('Explore scholarship opportunities and financial aid options');
  }
  
  const university = ghanaUniversitiesDatabase[universityName];
  if (university && assessmentData.preferredLocation) {
    const locationMatch = university.region.toLowerCase().includes(assessmentData.preferredLocation.toLowerCase());
    if (!locationMatch && assessmentData.preferredLocation !== 'any' && assessmentData.preferredLocation !== 'flexible') {
      concerns.push(`Located in ${university.region} Region - consider accommodation arrangements`);
    }
  }
  
  return concerns.length > 0 ? concerns : ['Review program requirements carefully before applying'];
}

function generateNextSteps(universityName) {
  const university = ghanaUniversitiesDatabase[universityName];
  return [
    `Visit ${universityName} official website for current admission information`,
    'Check specific program requirements and application deadlines',
    'Prepare required documents (WASSCE results, personal statement, etc.)',
    'Contact admissions office for any clarifications',
    ...(university && university.type === 'public' ? ['Explore government scholarship schemes'] : [])
  ];
}

function generateFollowupActions(assessmentData) {
  const actions = [
    'Research detailed program requirements for recommended universities',
    'Prepare your WASSCE documentation and academic transcripts',
    'Start application process early to meet deadlines',
    'Visit university campuses if possible to get firsthand experience'
  ];
  
  if (assessmentData.financialSituation === 'need_scholarship' || assessmentData.financialSituation === 'financial_constraints') {
    actions.push('Apply for scholarships - many opportunities available for qualified students');
  }
  
  if (assessmentData.careerGoals) {
    actions.push(`Connect with professionals in ${assessmentData.careerGoals} field for career insights`);
  }
  
  return actions;
}

/**
 * Update user profile with assessment results
 */
async function updateUserProfile(userId, assessmentRecord) {
  try {
    const userProfilesCollection = await getCollection("user_profiles");
    
    const profileUpdate = {
      user_id: new ObjectId(userId),
      last_assessment: assessmentRecord._id || new ObjectId(),
      preferences: {
        subjects: assessmentRecord.assessment_data.subjects,
        shs_program: assessmentRecord.assessment_data.shs_program,
        wassce_grade: assessmentRecord.assessment_data.wassce_grade,
        career_goals: assessmentRecord.assessment_data.career_goals,
        preferred_location: assessmentRecord.assessment_data.preferred_location,
        interests: assessmentRecord.assessment_data.interests
      },
      ai_recommendations: assessmentRecord.ai_recommendations,
      university_matches: assessmentRecord.university_matches,
      updated_at: new Date()
    };

    await userProfilesCollection.updateOne(
      { user_id: new ObjectId(userId) },
      { 
        $set: profileUpdate,
        $inc: { assessment_count: 1 }
      },
      { upsert: true }
    );

    console.log(`✅ User profile updated: ${userId}`);
  } catch (error) {
    console.error('❌ User profile update error:', error);
  }
}

/**
 * Generate personalized message for chat interface
 */
function generateAssessmentMessage(assessmentRecord) {
  const recommendations = assessmentRecord.ai_recommendations;
  const topUniversity = recommendations[0]?.university_name || 'Ghanaian universities';
  const topProgram = recommendations[0]?.program_name || 'your preferred program';
  
  return `Based on your assessment, I recommend exploring ${topProgram} at ${topUniversity}. Your academic profile shows strong potential for this program. Would you like detailed information about admission requirements and application procedures?`;
}

/**
 * Generate assessment summary for history
 */
function generateAssessmentSummary(assessment) {
  const topRecommendation = assessment.ai_recommendations?.[0];
  if (topRecommendation) {
    return `Top recommendation: ${topRecommendation.program_name} at ${topRecommendation.university_name}`;
  }
  return 'Assessment completed';
}

export default router;