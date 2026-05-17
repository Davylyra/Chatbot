// src/routes/profile.js
import express from 'express';
import authMiddleware from '../authMiddleware.js';
import { getCollection } from '../../config/db.js';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { validateProfilePayload } from '../inputValidation.js';

const router = express.Router();

// Protected route to get the logged-in user's profile - ENHANCED
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const usersCollection = await getCollection("users");
    
    if (!usersCollection) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again.'
      });
    }

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Get additional user stats
    const messagesCollection = await getCollection("messages");
    const messageCount = messagesCollection ? await messagesCollection.countDocuments({ user_id: userId }) : 0;
    
    const conversationsCollection = await getCollection("conversations");
    const conversationCount = conversationsCollection ? await conversationsCollection.countDocuments({ user_id: userId }) : 0;

    // Get latest assessment data for interests and preferences
    const userProfilesCollection = await getCollection("user_profiles");
    const userProfile = userProfilesCollection ? await userProfilesCollection.findOne({ user_id: new ObjectId(userId) }) : null;
    
    // Extract interests and preferred universities from latest assessment
    let interests = [];
    let preferredUniversities = [];
    
    // PRIORITY 1: Check if user has directly saved interests in users collection (from assessment)
    if (user.interests && Array.isArray(user.interests) && user.interests.length > 0) {
      interests = user.interests;
      console.log('✅ Loading interests from users collection:', interests);
    } else if (userProfile && userProfile.preferences) {
      // PRIORITY 2: Fall back to user_profiles collection
      // Combine subjects and interests
      if (userProfile.preferences.interests && Array.isArray(userProfile.preferences.interests)) {
        interests = userProfile.preferences.interests;
      }
      if (userProfile.preferences.subjects && Array.isArray(userProfile.preferences.subjects)) {
        interests = [...new Set([...interests, ...userProfile.preferences.subjects])];
      }
      console.log('📋 Loading interests from user_profiles collection:', interests);
    } else {
      console.log('⚠️ No interests found in database');
    }
    
    // Check for preferred universities in users collection first
    if (user.preferredUniversities && Array.isArray(user.preferredUniversities) && user.preferredUniversities.length > 0) {
      preferredUniversities = user.preferredUniversities;
    }
    
    // Extract preferred universities from AI recommendations
    if (userProfile && userProfile.ai_recommendations && Array.isArray(userProfile.ai_recommendations)) {
      preferredUniversities = userProfile.ai_recommendations
        .slice(0, 3)
        .map(rec => rec.university_name)
        .filter(Boolean);
    }

    console.log(' Sending profile response with interests:', interests);
    console.log('Sending profile response with preferredUniversities:', preferredUniversities);

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        location: user.location || '',
        bio: user.bio || '',
        shsProgram: userProfile?.preferences?.shs_program || '',
        wassceGrade: userProfile?.preferences?.wassce_grade || '',
        isEmailVerified: user.isEmailVerified || false,
        createdAt: user.createdAt || user.created_at,
        updatedAt: user.updatedAt || user.updated_at,
        interests: interests,
        preferredUniversities: preferredUniversities,
        stats: {
          messageCount,
          conversationCount,
          assessmentCount: userProfile?.assessment_count || 0
        }
      }
    });
  } catch (err) {
    console.error('❌ Get profile error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch profile' 
    });
  }
});

// DEBUG: Test endpoint to check user existence
router.get('/debug-user', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  console.log('🔍 DEBUG - User ID from token:', userId, 'type:', typeof userId);
  
  try {
    const usersCollection = await getCollection("users");
    
    // Try finding with ObjectId
    let userWithObjectId = null;
    try {
      userWithObjectId = await usersCollection.findOne({ _id: new ObjectId(userId) });
      console.log('🔍 Found with ObjectId:', !!userWithObjectId);
    } catch (err) {
      console.log('❌ ObjectId search failed:', err.message);
    }
    
    // Try finding with string
    const userWithString = await usersCollection.findOne({ _id: userId });
    console.log('🔍 Found with string:', !!userWithString);
    
    // List all users to see ID format
    const allUsers = await usersCollection.find({}).limit(3).toArray();
    console.log('🔍 Sample user IDs:', allUsers.map(u => ({ id: u._id, type: typeof u._id })));
    
    res.json({
      userId,
      userIdType: typeof userId,
      foundWithObjectId: !!userWithObjectId,
      foundWithString: !!userWithString,
      sampleIds: allUsers.map(u => ({ id: u._id.toString(), type: typeof u._id }))
    });
  } catch (err) {
    console.error('❌ Debug error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update profile - PRODUCTION READY with comprehensive validation
router.put('/update', authMiddleware, validateProfilePayload, async (req, res) => {
  const userId = req.user.id;
  const { name, email, password, currentPassword, location, bio, interests, preferredUniversities } = req.body;

  console.log('🔍 Profile update request - userId:', userId, 'type:', typeof userId);
  console.log('📥 Request body received:', req.body);
  console.log('📥 Interests in request:', interests);

  try {
    const usersCollection = await getCollection("users");
    
    if (!usersCollection) {
      console.error('❌ Database connection failed - usersCollection is null');
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again.'
      });
    }
    
    // Fetch current user data - handle both string and ObjectId formats
    let currentUser;
    try {
      currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch (oidError) {
      console.error('❌ ObjectId conversion failed:', oidError.message);
      // Try as string ID
      currentUser = await usersCollection.findOne({ _id: userId });
    }
    
    console.log('🔍 Current user found:', !!currentUser, currentUser?._id);
    
    if (!currentUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Validation
    const errors = [];
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long');
      }
      if (name.trim().length > 100) {
        errors.push('Name must not exceed 100 characters');
      }
    }

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
      }
      
      // Check if email is already taken by another user
      const existingUser = await usersCollection.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: new ObjectId(userId) }
      });
      
      if (existingUser) {
        errors.push('Email is already in use by another account');
      }
    }

    if (password !== undefined) {
      if (password.length < 6) {
        errors.push('Password must be at least 6 characters long');
      }
      if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
      }
      
      // Require current password for security
      if (!currentPassword) {
        errors.push('Current password is required to set a new password');
      } else {
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);
        if (!isCurrentPasswordValid) {
          return res.status(401).json({ 
            success: false,
            message: 'Current password is incorrect' 
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors 
      });
    }

    // Build update object
    const updateFields = { 
      updatedAt: new Date() // Standardized field name
    };

    if (name !== undefined && name.trim() !== currentUser.name) {
      updateFields.name = name.trim();
    }
    
    if (email !== undefined && email.toLowerCase() !== currentUser.email.toLowerCase()) {
      updateFields.email = email.toLowerCase();
    }
    
    if (location !== undefined && location.trim() !== (currentUser.location || '')) {
      updateFields.location = location.trim();
    }
    
    if (bio !== undefined && bio.trim() !== (currentUser.bio || '')) {
      updateFields.bio = bio.trim();
    }
    
    if (password !== undefined) {
      updateFields.password = await bcrypt.hash(password, 10); // Standardized to 'password'
    }
    
    // Handle interests array (from assessment)
    if (interests !== undefined && Array.isArray(interests)) {
      updateFields.interests = interests;
      console.log('✅ Updating interests from assessment:', interests);
    }
    
    // Handle preferred universities array
    if (preferredUniversities !== undefined && Array.isArray(preferredUniversities)) {
      updateFields.preferredUniversities = preferredUniversities;
      console.log('✅ Updating preferred universities:', preferredUniversities);
    }

    // REMOVED: The "no changes" check was preventing valid location/bio updates
    // updatedAt alone is fine - it means they opened edit mode and saved without changes
    // which is a valid operation that should succeed

    console.log(`📝 Updating profile for user ${userId}:`, Object.keys(updateFields), updateFields);

    let result;
    try {
      result = await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: updateFields },
        { returnDocument: 'after' }
      );
    } catch (oidError) {
      console.error('❌ ObjectId conversion failed in update:', oidError.message);
      // Try as string ID
      result = await usersCollection.findOneAndUpdate(
        { _id: userId },
        { $set: updateFields },
        { returnDocument: 'after' }
      );
    }

    console.log('🔍 Update result:', !!result, !!result?._id, result?._id);
    console.log('🔍 Full result object:', JSON.stringify(result, null, 2));

    // MongoDB native driver returns the document directly, not in a 'value' property
    const updatedUser = result;

    if (!updatedUser || !updatedUser._id) {
      console.error('❌ Update failed - no user document returned');
      console.error('  - userId:', userId);
      console.error('  - updateFields:', updateFields);
      return res.status(404).json({ 
        success: false,
        message: 'User not found during update',
        debug: { userId, hadResult: !!result, hadId: !!result?._id }
      });
    }

    console.log(`✅ Profile updated successfully for user ${userId}`);
    console.log('✅ Updated user document:', updatedUser);

    // Return interests and preferredUniversities from the updated user document (not from user_profiles)
    // This ensures we return what we just saved
    const updatedInterests = updatedUser.interests || [];
    const updatedUniversities = updatedUser.preferredUniversities || [];
    
    console.log('📤 Returning interests:', updatedInterests);
    console.log('📤 Returning preferredUniversities:', updatedUniversities);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        email: updatedUser.email,
        location: updatedUser.location || '',
        bio: updatedUser.bio || '',
        isEmailVerified: updatedUser.isEmailVerified || updatedUser.is_verified || false,
        createdAt: updatedUser.createdAt || updatedUser.created_at,
        updatedAt: updatedUser.updatedAt || updatedUser.updated_at,
        interests: updatedInterests,
        preferredUniversities: updatedUniversities
      }
    });
  } catch (err) {
    console.error('❌ Profile update error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update profile. Please try again.' 
    });
  }
});

export default router;