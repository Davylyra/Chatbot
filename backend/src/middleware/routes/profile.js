import express from 'express';
import authMiddleware from '../authMiddleware.js';
import { getCollection } from '../../config/db.js';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { validateProfilePayload } from '../inputValidation.js';

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userAccountsDB = await getCollection("users");
    
    if (!userAccountsDB) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again.'
      });
    }

    const user = await userAccountsDB.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const chatHistoryDB = await getCollection("messages");
    const messageCount = chatHistoryDB ? await chatHistoryDB.countDocuments({ user_id: userId }) : 0;
    
    const chatSessionsDB = await getCollection("conversations");
    const conversationCount = chatSessionsDB ? await chatSessionsDB.countDocuments({ user_id: userId }) : 0;

    const studentProfilesDB = await getCollection("user_profiles");
    const userProfile = studentProfilesDB ? await studentProfilesDB.findOne({ user_id: new ObjectId(userId) }) : null;
    
    let interests = [];
    let preferredUniversities = [];

    if (user.interests && Array.isArray(user.interests) && user.interests.length > 0) {
      interests = user.interests;
      console.log(' Loading interests from users collection:', interests);
    } else if (userProfile && userProfile.preferences) {

      if (userProfile.preferences.interests && Array.isArray(userProfile.preferences.interests)) {
        interests = userProfile.preferences.interests;
      }
      if (userProfile.preferences.subjects && Array.isArray(userProfile.preferences.subjects)) {
        interests = [...new Set([...interests, ...userProfile.preferences.subjects])];
      }
      console.log(' Loading interests from user_profiles collection:', interests);
    } else {
      console.log(' No interests found in database');
    }
    
    if (user.preferredUniversities && Array.isArray(user.preferredUniversities) && user.preferredUniversities.length > 0) {
      preferredUniversities = user.preferredUniversities;
    }
    
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
    console.error(' Get profile error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch profile' 
    });
  }
});

router.get('/debug-user', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  console.log(' DEBUG - User ID from token:', userId, 'type:', typeof userId);
  
  try {
    const userAccountsDB = await getCollection("users");
    
    let userWithObjectId = null;
    try {
      userWithObjectId = await userAccountsDB.findOne({ _id: new ObjectId(userId) });
      console.log(' Found with ObjectId:', !!userWithObjectId);
    } catch (err) {
      console.log(' ObjectId search failed:', err.message);
    }
    
    const userWithString = await userAccountsDB.findOne({ _id: userId });
    console.log(' Found with string:', !!userWithString);
    
    const allUsers = await userAccountsDB.find({}).limit(3).toArray();
    console.log(' Sample user IDs:', allUsers.map(u => ({ id: u._id, type: typeof u._id })));
    
    res.json({
      userId,
      userIdType: typeof userId,
      foundWithObjectId: !!userWithObjectId,
      foundWithString: !!userWithString,
      sampleIds: allUsers.map(u => ({ id: u._id.toString(), type: typeof u._id }))
    });
  } catch (err) {
    console.error(' Debug error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/update', authMiddleware, validateProfilePayload, async (req, res) => {
  const userId = req.user.id;
  const { name, email, password, currentPassword, location, bio, interests, preferredUniversities } = req.body;

  console.log(' Profile update request - userId:', userId, 'type:', typeof userId);
  console.log('📥 Request body received:', req.body);
  console.log('📥 Interests in request:', interests);

  try {
    const userAccountsDB = await getCollection("users");
    
    if (!userAccountsDB) {
      console.error(' Database connection failed - userAccountsDB is null');
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again.'
      });
    }
    
    let currentUser;
    try {
      currentUser = await userAccountsDB.findOne({ _id: new ObjectId(userId) });
    } catch (oidError) {
      console.error(' ObjectId conversion failed:', oidError.message);
      currentUser = await userAccountsDB.findOne({ _id: userId });
    }
    
    console.log(' Current user found:', !!currentUser, currentUser?._id);
    
    if (!currentUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

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
      
      const existingUser = await userAccountsDB.findOne({ 
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
    
    if (interests !== undefined && Array.isArray(interests)) {
      updateFields.interests = interests;
      console.log(' Updating interests from assessment:', interests);
    }
    
    if (preferredUniversities !== undefined && Array.isArray(preferredUniversities)) {
      updateFields.preferredUniversities = preferredUniversities;
      console.log(' Updating preferred universities:', preferredUniversities);
    }

    console.log(` Updating profile for user ${userId}:`, Object.keys(updateFields), updateFields);

    let result;
    try {
      result = await userAccountsDB.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: updateFields },
        { returnDocument: 'after' }
      );
    } catch (oidError) {
      console.error(' ObjectId conversion failed in update:', oidError.message);
      result = await userAccountsDB.findOneAndUpdate(
        { _id: userId },
        { $set: updateFields },
        { returnDocument: 'after' }
      );
    }

    console.log(' Update result:', !!result, !!result?._id, result?._id);
    console.log(' Full result object:', JSON.stringify(result, null, 2));

    const updatedUser = result;

    if (!updatedUser || !updatedUser._id) {
      console.error(' Update failed - no user document returned');
      console.error('  - userId:', userId);
      console.error('  - updateFields:', updateFields);
      return res.status(404).json({ 
        success: false,
        message: 'User not found during update',
        debug: { userId, hadResult: !!result, hadId: !!result?._id }
      });
    }

    console.log(` Profile updated successfully for user ${userId}`);
    console.log(' Updated user document:', updatedUser);

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
    console.error(' Profile update error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update profile. Please try again.' 
    });
  }
});

export default router;