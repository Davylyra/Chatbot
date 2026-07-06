import express from "express";
import { getCollection } from "../../config/db.js";
import { ObjectId } from "mongodb";
import authMiddleware from "../authMiddleware.js";
import { logAssessment } from "../conversationLogger.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { matchUniversitiesToProfile, getTopUniversityMatches } from "../../utils/universityMatcher.js";
import { ghanaUniversitiesDatabase, getAllUniversities } from "../../data/ghanaUniversitiesDatabase.js";

dotenv.config();

const router = express.Router();

router.post("/submit", async (req, res) => {
  try {
    const {
      userId,
      conversationId,
      assessmentData,
      assessmentType = "university_preference"
    } = req.body;

    if (!assessmentData) {
      return res.status(400).json({ success: false, message: "Assessment data is required" });
    }

    const aiRecommendations = await generateAIRecommendations(assessmentData);

    const assessmentRecord = {
      user_id: userId || 'anonymous',
      conversation_id: conversationId,
      assessment_type: assessmentType,
      assessment_data: {
        subjects: assessmentData.subjects || [],
        shs_program: assessmentData.shsProgram || '',
        wassce_grade: assessmentData.wassceGrade || '',
        interests: assessmentData.interests || [],
        career_goals: assessmentData.careerGoals || '',
        preferred_location: assessmentData.preferredLocation || ''
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

    const assessmentId = await logAssessment(assessmentRecord);

    if (userId && userId !== 'anonymous') {
      await updateUserProfile(userId, assessmentRecord);
    }

    res.json({
      success: true,
      assessment_id: assessmentId,
      recommendations: aiRecommendations.recommendations,
      university_matches: aiRecommendations.universityMatches,
      confidence: aiRecommendations.confidence,
      personalized_message: generateAssessmentMessage(assessmentRecord),
      followup_actions: aiRecommendations.followupActions,
      timestamp: new Date().toISOString()
    });

  } catch (submissionError) {
    res.status(500).json({ success: false, message: "Failed to process assessment", error: submissionError.message });
  }
});

router.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const assessmentsCollection = await getCollection("user_assessments");
    
    const [evaluations, totalCount] = await Promise.all([
      assessmentsCollection
        .find({ user_id: userId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      assessmentsCollection.countDocuments({ user_id: userId })
    ]);

    res.json({
      success: true,
      assessments: evaluations.map(evaluation => ({
        id: evaluation._id.toString(),
        assessment_type: evaluation.assessment_type,
        completed: evaluation.completed,
        recommendations_count: evaluation.ai_recommendations?.length || 0,
        university_matches_count: evaluation.university_matches?.length || 0,
        confidence: evaluation.recommendation_confidence,
        created_at: evaluation.created_at,
        summary: generateAssessmentSummary(evaluation)
      })),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch assessment history" });
  }
});

router.get("/:assessmentId", authMiddleware, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user.id;

    const assessmentsCollection = await getCollection("user_assessments");
    const evaluation = await assessmentsCollection.findOne({
      _id: new ObjectId(assessmentId),
      user_id: new ObjectId(userId)
    });

    if (!evaluation) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    const { _id, ...rest } = evaluation;

    res.json({
      success: true,
      assessment: { id: _id.toString(), ...rest }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch assessment details" });
  }
});

router.put("/:assessmentId/feedback", authMiddleware, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user.id;
    const { helpful, rating, comments, selected_universities } = req.body;

    const assessmentsCollection = await getCollection("user_assessments");
    
    const result = await assessmentsCollection.updateOne(
      { _id: new ObjectId(assessmentId), user_id: new ObjectId(userId) },
      { 
        $set: {
          user_feedback: {
            helpful,
            rating,
            comments,
            selected_universities: selected_universities || [],
            feedback_date: new Date()
          },
          updated_at: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }
    
    res.json({ success: true, message: "Feedback saved successfully", assessment_id: assessmentId });

  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to save feedback" });
  }
});

async function generateAIRecommendations(studentProfile) {
  try {
    const universityMatches = getTopUniversityMatches(studentProfile, 5);
    
    const recommendations = universityMatches.slice(0, 3).map((match, index) => ({
      university_name: match.universityName,
      program_name: match.recommendedPrograms[0]?.name || 'Multiple Programs Available',
      confidence_score: match.matchScore / 100,
      reasoning: match.reasoning,
      requirements_met: assessRequirementsMet(studentProfile, match.universityName),
      scholarship_eligible: assessScholarshipEligibility(studentProfile),
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
      concerns: generateConcerns(studentProfile, match.universityName),
      next_steps: generateNextSteps(match.universityName),
      reasoning: match.reasoning
    }));

    return {
      recommendations,
      universityMatches: formattedMatches,
      confidence: 0.95,
      followupActions: generateFollowupActions(studentProfile),
      modelUsed: 'assessment-driven-matcher'
    };

  } catch (error) {
    return generateFallbackRecommendations(studentProfile);
  }
}

function generateFallbackRecommendations(studentProfile) {
  const matches = getTopUniversityMatches(studentProfile, 3);
  
  return {
    recommendations: matches.map((match, index) => ({
      university_name: match.universityName,
      program_name: match.recommendedPrograms[0]?.name || 'Multiple Programs Available',
      confidence_score: match.matchScore / 100,
      reasoning: match.reasoning,
      requirements_met: true,
      scholarship_eligible: assessScholarshipEligibility(studentProfile),
      career_alignment: Math.round((match.matchBreakdown.careerAlignment / 25) * 10),
      priority: index + 1
    })),
    universityMatches: matches.map(({ universityName, matchScore, recommendedPrograms, strengths, location }) => ({
      university_name: universityName,
      match_score: matchScore,
      programs_eligible: recommendedPrograms.map(p => p.name),
      strengths,
      location
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

function assessRequirementsMet(studentProfile, universityName) {
  return Array.isArray(studentProfile.grades) && studentProfile.grades.length > 0;
}

function assessScholarshipEligibility(studentProfile) {
  return studentProfile.financialSituation === 'need_scholarship' || 
         studentProfile.grades?.some(grade => /^[A-C]/i.test(grade));
}

function generateConcerns(studentProfile, universityName) {
  const concerns = [];
  const { financialSituation, preferredLocation } = studentProfile;
  
  if (['need_scholarship', 'financial_constraints'].includes(financialSituation)) {
    concerns.push('Explore scholarship opportunities and financial aid options');
  }
  
  const university = ghanaUniversitiesDatabase[universityName];
  if (university && preferredLocation) {
    const isFlexible = ['any', 'flexible'].includes(preferredLocation.toLowerCase());
    if (!isFlexible && !university.region.toLowerCase().includes(preferredLocation.toLowerCase())) {
      concerns.push(`Located in ${university.region} Region - consider accommodation arrangements`);
    }
  }
  
  return concerns.length ? concerns : ['Review program requirements carefully before applying'];
}

function generateNextSteps(universityName) {
  const university = ghanaUniversitiesDatabase[universityName];
  const steps = [
    `Visit ${universityName} official website for current admission information`,
    'Check specific program requirements and application deadlines',
    'Prepare required documents (WASSCE results, personal statement, etc.)',
    'Contact admissions office for any clarifications'
  ];
  if (university?.type === 'public') steps.push('Explore government scholarship schemes');
  return steps;
}

function generateFollowupActions(studentProfile) {
  const actions = [
    'Research detailed program requirements for recommended universities',
    'Prepare your WASSCE documentation and academic transcripts',
    'Start application process early to meet deadlines',
    'Visit university campuses if possible to get firsthand experience'
  ];
  
  const { financialSituation, careerGoals } = studentProfile;
  if (['need_scholarship', 'financial_constraints'].includes(financialSituation)) {
    actions.push('Apply for scholarships - many opportunities available for qualified students');
  }
  
  if (careerGoals) {
    actions.push(`Connect with professionals in ${careerGoals} field for career insights`);
  }
  
  return actions;
}

async function updateUserProfile(userId, assessmentRecord) {
  try {
    const userProfilesCollection = await getCollection("user_profiles");
    const { assessment_data, ai_recommendations, university_matches } = assessmentRecord;
    
    await userProfilesCollection.updateOne(
      { user_id: new ObjectId(userId) },
      { 
        $set: {
          user_id: new ObjectId(userId),
          last_assessment: assessmentRecord._id || new ObjectId(),
          preferences: assessment_data,
          ai_recommendations,
          university_matches,
          updated_at: new Date()
        },
        $inc: { assessment_count: 1 }
      },
      { upsert: true }
    );
  } catch (error) {
  }
}

function generateAssessmentMessage(assessmentRecord) {
  const topRecommendation = assessmentRecord.ai_recommendations?.[0];
  const university = topRecommendation?.university_name || 'Ghanaian universities';
  const program = topRecommendation?.program_name || 'your preferred program';
  return `Based on your assessment, I recommend exploring ${program} at ${university}. Your academic profile shows strong potential for this program. Would you like detailed information about admission requirements and application procedures?`;
}

function generateAssessmentSummary(evaluation) {
  const recommendation = evaluation.ai_recommendations?.[0];
  return recommendation 
    ? `Top recommendation: ${recommendation.program_name} at ${recommendation.university_name}` 
    : 'Assessment completed';
}

export default router;