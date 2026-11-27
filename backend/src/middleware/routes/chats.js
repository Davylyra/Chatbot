import express from "express";
import multer from "multer";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import { getCollection } from "../../config/db.js";
import { ObjectId } from "mongodb";
import authMiddleware from "../authMiddleware.js";
import { logConversationMiddleware, logAssessment } from "../conversationLogger.js";
import { cacheMiddleware, cacheManager } from "../cacheManager.js";
import { rateLimiters } from "../rateLimiter.js";
import { validateChatPayload } from "../inputValidation.js";
import { generateTitleWithFallback } from "../../utils/llmTitleGenerator.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const upload = multer({ dest: "uploads/" });

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ;
const aiServiceHeaders = (extra = {}) => ({
  ...extra,
  ...(process.env.INTERNAL_API_KEY
    ? { "X-Internal-Key": process.env.INTERNAL_API_KEY }
    : {}),
});

// Visitors who aren't logged in send a private per-browser id
// (frontend/src/utils/guestId.ts). Guest routes only ever return data saved
// under that id.
const GUEST_ID_PATTERN = /^guest_[A-Za-z0-9_-]{8,64}$/;
const isGuestId = (value) => typeof value === "string" && GUEST_ID_PATTERN.test(value);
const getGuestId = (req) => {
  const headerId = req.get("x-guest-id");
  return isGuestId(headerId) ? headerId : null;
};

// The logged-in user's id from a valid Bearer token, or null. For routes
// that serve both logged-in users and guests.
const getTokenUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
};

const GENERIC_TITLES = new Set([
  "",
  "untitled",
  "new chat",
  "new conversation",
  "untitled conversation",
  "conversation",
  "general greeting",
  "greeting",
  "friendly greeting",
  "casual greeting",
  "welcome greeting",
  "hello",
  "hi",
  "hey",
  "welcome",
  "morning consultation",
  "afternoon consultation",
  "evening consultation",
  "university consultation",
]);
const isGenericTitle = (title) => {
  const normalized = String(title || "").trim().toLowerCase();
  return (
    !normalized ||
    GENERIC_TITLES.has(normalized) ||
    normalized.startsWith("conv_") ||
    /\bgreeting\b/.test(normalized)
  );
};

const SMALL_TALK_WORDS = new Set([
  "hi", "hello", "hey", "hiya", "yo", "sup", "good", "morning", "afternoon",
  "evening", "day", "thanks", "thank", "you", "u", "ok", "okay", "cool",
  "nice", "great", "bye", "goodbye", "how", "are", "doing", "there",
  "cerkyl", "bot", "bro", "charley", "chale", "sir", "madam", "please",
  "whats", "up", "what's", "fine", "alright",
]);
const isSmallTalkMessage = (text) => {
  const words = (String(text || "").toLowerCase().match(/[a-z']+/g) || []);
  return words.length === 0 || (words.length <= 6 && words.every((w) => SMALL_TALK_WORDS.has(w)));
};

const titleFromMessage = (text) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const firstSentence = clean.match(/^[^.!?]+/)?.[0]?.trim() || clean;
  if (!firstSentence) return "University Consultation";
  return firstSentence.length > 60 ? firstSentence.substring(0, 60).trim() + "..." : firstSentence;
};

// Conversations with a title being generated right now, so a quick second
// message doesn't start a duplicate generation.
const titlesInProgress = new Set();

router.post("/upload", authMiddleware, upload.array('files', 5), async (req, res) => {
  const { message, conversation_id, university_name } = req.body;
  const userId = req.user?.id ;

  let chatHistoryDB;

  try {
    chatHistoryDB = await getCollection('messages');
    const files = req.files || [];

    console.log(' Processing message with files:', {
      message: message?.substring(0, 100),
      fileCount: files.length,
      conversation_id,
      university_name
    });

    if (!message && files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Either message or files are required"
      });
    }

    const fileAttachments = files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));

    let messageText = message || '';
    if (files.length > 0) {
      const fileInfo = files.map(f => `📎 ${f.originalname} (${(f.size/1024).toFixed(1)}KB)`).join('\n');
      messageText = message ? `${message}\n\n${fileInfo}` : fileInfo;
    }

    const studentMessage = {
      user_id: userId,
      conversation_id: conversation_id,
      message: messageText,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString(),
      attachments: fileAttachments
    };

    await chatHistoryDB.insertOne(studentMessage);
    console.log(' Saved user message with files to MongoDB');

    const knowledgeRequestPayload = {
      message: message || `User sent ${files.length} file(s)`,
      conversation_id: conversation_id,
      university_name: university_name || null,
      files: fileAttachments,
      user_context: {
        ...(req.body?.user_context || {}),
        user_id: userId,
        preferred_university: university_name,
        has_attachments: files.length > 0,
        file_types: files.map(f => f.mimetype)
      }
    };

    console.log(' Sending message with files to RAG service...');

    const formData = new FormData();
    formData.append('message', message || `User sent ${files.length} file(s)`);
    formData.append('conversation_id', conversation_id);
    formData.append('user_id', userId); 
    formData.append('university_name', university_name || '');
    formData.append('user_context', JSON.stringify({
      ...(req.body?.user_context || {}),
      user_id: userId,
      preferred_university: university_name,
      has_attachments: files.length > 0,
      file_types: files.map(f => f.mimetype)
    }));

    files.forEach((file) => {
      formData.append('files', fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    console.log(' Sending files to enhanced RAG service endpoint...');

    const fileEndpoint = AI_SERVICE_URL.replace('/respond', '/respond-with-files');
    console.log('Using file endpoint:', fileEndpoint);

    const knowledgeServiceResponse = await fetch(fileEndpoint, {
      method: 'POST',
      headers: aiServiceHeaders({
        "x-user-id": userId,
      }),
      body: formData,
      timeout: 60000 // Longer timeout for file processing
    });

    const aiKnowledgeResponse = await knowledgeServiceResponse.json();
    console.log('RAG service response for files received:', {
      confidence: aiKnowledgeResponse.confidence,
      sources_count: aiKnowledgeResponse.sources?.length || 0,
      response_length: aiKnowledgeResponse.reply?.length || 0
    });

    const aiMessage = {
      user_id: userId === 'demo_user' ? userId : new ObjectId(userId),
      conversation_id: conversation_id,
      message: aiKnowledgeResponse.reply || 'I received your files but had trouble processing them.',
      is_bot: true,
      created_at: new Date(),
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString(),
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0,
      rag_metadata: {
        source_count: aiKnowledgeResponse.sources?.length || 0,
        processing_time: aiKnowledgeResponse.processing_time,
        model_used: aiKnowledgeResponse.model_used || 'hybrid-rag',
        processed_files: files.length
      }
    };

    await chatHistoryDB.insertOne(aiMessage);
    console.log(' Saved AI response for files to MongoDB');

    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn(' Could not delete uploaded file:', file.path);
      }
    });

    res.json({
      success: true,
      message: aiKnowledgeResponse.reply || 'Files processed successfully',
      reply: aiKnowledgeResponse.reply || 'Files processed successfully',
      conversation_id: conversation_id,
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0,
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString(),
      files_processed: files.length,
      metadata: {
        university_context: university_name,
        response_type: aiKnowledgeResponse.confidence > 0.85 ? 'local_knowledge' : 'hybrid_search',
        processing_info: aiKnowledgeResponse.processing_info,
        attachments: fileAttachments
      }
    });

  } catch (error) {
    console.error(" File upload processing error:", error);

    const fallbackReply = generateQuickFallback(message || '');

    try {
      if (!chatHistoryDB) {
        chatHistoryDB = await getCollection('messages');
      }
      await chatHistoryDB.insertOne({
        user_id: userId === 'demo_user' ? userId : new ObjectId(userId),
        conversation_id: conversation_id,
        message: fallbackReply,
        is_bot: true,
        created_at: new Date(),
        timestamp: new Date().toISOString(),
        sources: [{ source: "Local Knowledge", type: "fallback", confidence: 0.3 }],
        confidence: 0.3,
        fallback_mode: true,
        rag_error: error?.message
      });
      console.log(' Saved fallback AI response for file upload');
    } catch (dbErr) {
      console.warn(' Could not save fallback AI response:', dbErr?.message);
    }

    res.status(200).json({ 
      success: true,
      message: fallbackReply,
      reply: fallbackReply,
      conversation_id: conversation_id,
      sources: [{ source: "Local Knowledge", type: "fallback", confidence: 0.3 }],
      confidence: 0.3,
      timestamp: new Date().toISOString(),
      fallback_mode: true,
      rag_error: error?.message
    });
  }
});

router.post("/demo", cacheMiddleware, logConversationMiddleware, async (req, res) => {
  try {
    const { message, conversation_id } = req.body;

    console.log(`Demo message: ${message?.substring(0, 100)}...`);

    if (!message || !conversation_id) {
      return res.status(400).json({
        success: false,
        message: "Message and conversation_id are required"
      });
    }

    console.log(` Sending demo request to: ${AI_SERVICE_URL}`);
    
    try {
      const response = await fetch(AI_SERVICE_URL, {
        method: 'POST',
        headers: aiServiceHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          message,
          conversation_id: conversation_id,
          user_context: {
            user_id: 'demo_user',
            demo_mode: true,
            timestamp: new Date().toISOString()
          }
        })
      });

      const data = await response.json();
      console.log(" Demo response received from RAG service");

      res.json({
        success: true,
        reply: data.reply || "I'm here to help with Ghanaian university information!",
        sources: data.sources || [],
        confidence: data.confidence || 0.5,
        processing_time: data.processing_time || 0,
        demo_mode: true
      });

    } catch (ragError) {
      console.error(" Demo RAG Service Error:", ragError.message);
      
      const fallbackReply = generateQuickFallback(message);
      
      res.json({
        success: true,
        reply: fallbackReply,
        sources: [{"source": "Local Knowledge", "type": "fallback"}],
        confidence: 0.3,
        demo_mode: true
      });
    }

  } catch (error) {
    console.error(" Demo Chat Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process your message. Please try again.",
      demo_mode: true
    });
  }
});

function generateQuickFallback(message) {
  const messageLower = message?.toLowerCase() || '';
  
  if (messageLower.includes('assessment') || messageLower.includes('grades') || messageLower.includes('career goals')) {
    return `**🎯 Assessment Results Analysis**

Thank you for sharing your academic profile! To provide personalized recommendations, I need to analyze your specific information more carefully. 

**What I need to know:**
• Your current subjects and WASSCE grades
• Your SHS program (General Science, Business, etc.)
• Your career interests (e.g., Medicine, Technology, Business)
• Your preferred location
• Your financial situation

Once you provide these details, I'll recommend universities that are specifically suited to YOUR profile using our fair, data-driven matching system.

**In the meantime:**
1. I can tell you about any specific university
2. I can explain different programs and careers
3. I can help you understand admission requirements

What would you like to know?`;
  }
  
  if (messageLower.includes('university of ghana') || messageLower.includes('ug')) {
    return `**University of Ghana (Legon) 🎓**

**📍 Location:** Legon, Accra
**📞 Contact:** +233-30-213-8501
**✉️ Email:** admissions@ug.edu.gh
**🌐 Website:** www.ug.edu.gh

**Popular Programs:**
• Computer Science - 4 years, GHS 8,500/year
• Medicine - 6 years, GHS 15,000/year
• Business Admin - 4 years, GHS 6,500/year

**Requirements:** WASSCE with 6 credits (A1-C6)
**Deadline:** March 31st | **Fee:** GHS 200

Need specific program details? Just ask!`;
  }
  
  return `**Welcome to CERKYL! 🎓**

I help with fair, personalized Ghanaian university recommendations:

**What I can help with:**
📋 **Assessment** - Take a quick assessment for personalized recommendations
🏫 **University Info** - Details about any Ghanaian university
📚 **Programs** - Information about specific programs and careers
💡 **Guidance** - Admission requirements, fees, deadlines, and application help

**To get started:**
1. Take the assessment for personalized recommendations
2. Ask about specific universities or programs
3. Get help with your application journey

What would you like to explore?`;
}

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    const userId = req.user.id;
    const chatSessionsDB = await getCollection("conversations");

    const newConversation = {
      user_id: new ObjectId(userId),
      title: title || "New Conversation",
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await chatSessionsDB.insertOne(newConversation);
    
    const conversation = {
      id: result.insertedId.toString(),
      user_id: userId,
      title: newConversation.title,
      created_at: newConversation.created_at,
      updated_at: newConversation.updated_at
    };

    res.status(201).json({ conversation });
  } catch (err) {
    console.error(" Error creating conversation:", err);
    res.status(500).json({ message: "Failed to start new conversation" });
  }
});

router.post(
  "/respond",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const { message, conversation_id } = req.body;
    const file = req.file;
    const userId = req.user.id;

    if (!message && !file)
      return res.status(400).json({ message: "Provide either a message or a file" });

    try {
      const chatSessionsDB = await getCollection("conversations");
      
      const convoCheck = await chatSessionsDB.findOne({
        _id: new ObjectId(conversation_id),
        user_id: new ObjectId(userId)
      });
      
      
      if (!convoCheck) {
        console.log(" WARNING: Chat ID not found in DB, proceeding anyway for demo.");
      }

      let aiResponse;

      if (file) {
        const formData = new FormData();
        formData.append("conversation_id", conversation_id);
        formData.append("message", message || "");
        formData.append("file", fs.createReadStream(file.path));

        aiResponse = await fetch(`${AI_SERVICE_URL}`, {
          method: "POST",
          headers: aiServiceHeaders({ "x-user-id": userId.toString() }),
          body: formData,
        });

        try { fs.unlinkSync(file.path); } catch (e) { console.error("Error deleting file:", e); }

      } else {
        aiResponse = await fetch(`${AI_SERVICE_URL}`, {
          method: "POST",
          headers: aiServiceHeaders({
            "Content-Type": "application/json",
            "x-user-id": userId.toString(),
          }),
          body: JSON.stringify({ conversation_id, message }),
        });
      }

      const aiResponseText = await aiResponse.text();
      let data;
      try {
        data = JSON.parse(aiResponseText);
      } catch {
        data = { reply: aiResponseText };
      }

      const aiMessage = data.reply || "Sorry, I couldn’t process that.";

      const chatHistoryDB = await getCollection("messages");
      
      if (message) {
        await chatsCollection.insertOne({
          user_id: new ObjectId(userId),
          conversation_id: new ObjectId(conversation_id),
          message,
          is_bot: false,
          created_at: new Date()
        });
      }

      if (file) {
        await chatsCollection.insertOne({
          user_id: new ObjectId(userId),
          conversation_id: new ObjectId(conversation_id),
          message: `📎 Uploaded file: ${file.originalname}`,
          is_bot: false,
          created_at: new Date()
        });
      }

      await chatsCollection.insertOne({
        user_id: new ObjectId(userId),
        conversation_id: new ObjectId(conversation_id),
        message: aiMessage,
        is_bot: true,
        created_at: new Date()
      });

      res.json({ reply: aiMessage });

    } catch (err) {
      console.error(" Chat error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get("/user/all", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const chatSessionsDB = await getCollection("conversations");
    
    const conversations = await chatSessionsDB
      .find({ user_id: new ObjectId(userId) })
      .sort({ created_at: -1 })
      .toArray();
    
    const formattedConversations = conversations.map(conv => ({
      id: conv._id.toString(),
      user_id: conv.user_id.toString(),
      title: conv.title,
      created_at: conv.created_at,
      updated_at: conv.updated_at
    }));
    
    res.json({ conversations: formattedConversations });
  } catch (err) {
    console.error(" Error fetching conversations:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/history/:conversation_id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversation_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const chatHistoryDB = await getCollection("messages");

    const userIdCandidates = [userId];
    if (/^[a-fA-F0-9]{24}$/.test(userId)) {
      try { userIdCandidates.push(new ObjectId(userId)); } catch (e) {}
    }

    const conversationIdCandidates = [conversation_id];
    if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      try { conversationIdCandidates.push(new ObjectId(conversation_id)); } catch (e) {}
    }

    const filter = {
      user_id: { $in: userIdCandidates },
      conversation_id: { $in: conversationIdCandidates }
    };

    const total = await chatHistoryDB.countDocuments(filter);

    const chats = await chatHistoryDB
      .find(filter)
      .sort({ sequence: 1, created_at: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formattedChats = chats.map(chat => ({
      id: chat._id.toString(),
      user_id: String(chat.user_id || ''),
      conversation_id: String(chat.conversation_id || ''),
      message: chat.message,
      is_bot: !!chat.is_bot,
      created_at: chat.created_at
    }));

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      chats: formattedChats,
    });
  } catch (err) {
    console.error(" Error fetching chat history:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/save-conversation", async (req, res) => {
  try {
    const { conversation, messages, userId } = req.body;
    
    if (!conversation || !conversation.id || !Array.isArray(messages)) {
      return res.status(400).json({ 
        success: false, 
        message: "Conversation and messages are required" 
      });
    }

    // Logged-in users are identified by their token; guests by their
    // private guest id. Never trust a bare user id from the body.
    const ownerId =
      getTokenUserId(req) ||
      getGuestId(req) ||
      (isGuestId(userId) ? userId : null);

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Not allowed to save this conversation" });
    }

    const chatSessionsDB = await getCollection("conversations");
    const chatHistoryDB = await getCollection("messages");

    const existing = await chatSessionsDB.findOne({ _id: conversation.id });
    if (existing && existing.user_id != null && String(existing.user_id) !== ownerId) {
      return res.status(403).json({ success: false, message: "Not allowed to save this conversation" });
    }

    const substantiveUserMessage =
      messages.find(
        (m) =>
          (m.isUser === true || m.sender === "user") &&
          !isSmallTalkMessage(m.text || m.message || "")
      ) || messages.find((m) => m.isUser === true || m.sender === "user");
    const firstBotReply = messages.find(m => m.isUser === false || m.sender === 'bot');
    const firstUserText = substantiveUserMessage?.text || substantiveUserMessage?.message || '';

    // Keep a real title if one is already saved (for example the one /send
    // generated). Otherwise generate one; never fall back to a generic title.
    let finalTitle = existing?.title;
    let titleMethod = existing?.title_method || 'existing';
    let titleGenerated = false;

    if (isGenericTitle(finalTitle)) {
      const localTitle = isGenericTitle(conversation.title) ? null : conversation.title;
      if (firstUserText && firstBotReply) {
        try {
          const titleResult = await generateTitleWithFallback(
            firstUserText,
            firstBotReply.text || firstBotReply.message || '',
            conversation.universityContext || null,
            () => localTitle || titleFromMessage(firstUserText)
          );
          finalTitle = titleResult.title;
          titleMethod = titleResult.method;
          titleGenerated = true;
          console.log(` [SAVE] Generated title: "${finalTitle}" (method: ${titleMethod})`);
        } catch (titleError) {
          console.warn(' [SAVE] Title generation failed:', titleError.message);
        }
      }
      if (isGenericTitle(finalTitle)) {
        finalTitle = localTitle || (firstUserText ? titleFromMessage(firstUserText) : 'New Conversation');
        titleMethod = localTitle ? 'provided' : 'fallback_local';
      }

      // /send may have saved a generated title while we were working.
      const latest = await chatSessionsDB.findOne({ _id: conversation.id }, { projection: { title: 1 } });
      if (latest && !isGenericTitle(latest.title)) {
        finalTitle = latest.title;
        titleGenerated = false;
      }
    }

    await chatSessionsDB.updateOne(
      { _id: conversation.id },
      {
        $set: {
          title: finalTitle,
          title_method: titleMethod,
          ...(titleGenerated && { title_generated_at: new Date() }),
          last_message: conversation.lastMessage || '',
          updated_at: new Date(),
          message_count: messages.length,
          university_context: conversation.universityContext || null,
          user_id: ownerId
        },
        $setOnInsert: {
          created_at: conversation.timestamp ? new Date(conversation.timestamp) : new Date()
        }
      },
      { upsert: true }
    );

    console.log(` [SAVE] Conversation saved with _id: ${conversation.id}, title: "${finalTitle}"`);

    await chatHistoryDB.deleteMany({
      conversation_id: conversation.id,
      user_id: ownerId
    });

    const messageDocs = messages.map((message, index) => ({
      conversation_id: conversation.id,
      message: message.text || message.message || '',
      is_bot: message.isUser === false || message.sender === 'bot',
      created_at: message.timestamp && !isNaN(new Date(message.timestamp)) ? new Date(message.timestamp) : new Date(),
      timestamp: message.timestamp || new Date().toISOString(),
      sources: message.sources || [],
      confidence: message.confidence || 0,
      user_id: ownerId,
      sequence: index
    }));
    if (messageDocs.length > 0) {
      await chatHistoryDB.insertMany(messageDocs, { ordered: false });
    }

    console.log(` [SAVE] Conversation ${conversation.id} with ${messages.length} messages saved for ${ownerId}`);
    res.json({ 
      success: true, 
      message: "Conversation saved successfully",
      conversation_id: conversation.id,
      saved_messages: messages.length,
      title: finalTitle,
      title_method: titleMethod
    });

  } catch (error) {
    console.error(" Error saving conversation to MongoDB:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to save conversation"
    });
  }
});

router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, skip = 0 } = req.query; // 🚀 PERFORMANCE: Pagination support
    const chatSessionsDB = await getCollection("conversations");

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 conversations
    const parsedSkip = parseInt(skip) || 0;

    console.log(` [GET] Fetching conversations for user: ${userId} (limit: ${parsedLimit}, skip: ${parsedSkip})`);

    const projection = {
      _id: 1,
      title: 1,
      last_message: 1,
      lastMessage: 1,
      updated_at: 1,
      created_at: 1,
      message_count: 1,
      messageCount: 1,
      university_context: 1,
      universityContext: 1
    };

    const conversations = await chatSessionsDB
      .find({
        $or: [
          { user_id: userId }, // String comparison
          { user_id: new ObjectId(userId) } // ObjectId comparison
        ]
      }, { projection })
      .sort({ updated_at: -1, created_at: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .toArray();

    const totalCount = await chatSessionsDB.countDocuments({
      $or: [
        { user_id: userId },
        { user_id: new ObjectId(userId) }
      ]
    });

    console.log(` [GET] Retrieved ${conversations.length}/${totalCount} conversations for user ${userId}`);
    
    if (conversations.length === 0) {
      return res.json({
        success: true,
        conversations: [],
        pagination: {
          total: 0,
          limit: parsedLimit,
          skip: parsedSkip,
          hasMore: false
        }
      });
    }

    res.json({
      success: true,
      conversations: conversations.map(conv => ({
        id: conv._id?.toString() || conv.id || String(conv._id),
        title: conv.title || 'Untitled Conversation',
        lastMessage: conv.last_message || conv.lastMessage || '',
        timestamp: conv.updated_at?.toISOString() || conv.created_at?.toISOString() || new Date().toISOString(),
        messageCount: conv.message_count || conv.messageCount || 0,
        universityContext: conv.university_context || conv.universityContext || null,
        last_message: conv.last_message || conv.lastMessage || '',
        message_count: conv.message_count || conv.messageCount || 0,
        university_context: conv.university_context || conv.universityContext || null
      })),
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: parsedSkip + conversations.length < totalCount
      }
    });

  } catch (error) {
    console.error(" Error fetching conversations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get("/conversations-demo", async (req, res) => {
  try {
    const chatSessionsDB = await getCollection("conversations");
    const { limit = 20, skip = 0 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    const parsedSkip = parseInt(skip) || 0;
    
    const guestId = getGuestId(req);
    if (!guestId) {
      return res.json({
        success: true,
        conversations: [],
        pagination: { total: 0, limit: parsedLimit, skip: parsedSkip, hasMore: false }
      });
    }

    console.log(` [DEMO] Loading conversations for ${guestId} (limit: ${parsedLimit}, skip: ${parsedSkip})`);

    const projection = {
      _id: 1,
      title: 1,
      last_message: 1,
      lastMessage: 1,
      updated_at: 1,
      created_at: 1,
      message_count: 1,
      messageCount: 1,
      university_context: 1,
      universityContext: 1
    };
    
    const conversations = await chatSessionsDB
      .find({ user_id: guestId }, { projection })
      .sort({ updated_at: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .toArray();

    const totalCount = await chatSessionsDB.countDocuments({ user_id: guestId });
    console.log(` Retrieved ${conversations.length}/${totalCount} demo conversations`);
    
    res.json({ 
      success: true, 
      conversations: conversations.map(conv => ({
        id: conv._id?.toString() || String(conv._id),
        title: conv.title || 'Untitled Conversation',
        lastMessage: conv.last_message || conv.lastMessage || '',
        timestamp: conv.updated_at?.toISOString() || conv.created_at?.toISOString() || new Date().toISOString(),
        messageCount: conv.message_count || conv.messageCount || 0,
        universityContext: conv.university_context || conv.universityContext || null
      })),
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: parsedSkip + conversations.length < totalCount
      }
    });

  } catch (error) {
    console.error(" Error fetching demo conversations:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch conversations" 
    });
  }
});

router.get("/conversations-demo/:conversation_id/messages", async (req, res) => {
  try {
    const { conversation_id } = req.params;
    const { limit = 100, skip = 0 } = req.query;
    const chatHistoryDB = await getCollection("messages");
    
    const parsedLimit = Math.min(parseInt(limit) || 100, 200);
    const parsedSkip = parseInt(skip) || 0;
    
    const guestId = getGuestId(req);
    if (!guestId) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    console.log(` [DEMO] Loading messages for ${conversation_id} (limit: ${parsedLimit}, skip: ${parsedSkip})`);

    const projection = {
      _id: 1,
      message: 1,
      is_bot: 1,
      created_at: 1,
      timestamp: 1,
      conversation_id: 1,
      sources: 1,
      confidence: 1,
      attachments: 1,
      sequence: 1
    };
    
    const convIdCandidates = [conversation_id];
    if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      try { convIdCandidates.push(new ObjectId(conversation_id)); } catch (e) {}
    }
    
    const messages = await chatHistoryDB
      .find({ conversation_id: { $in: convIdCandidates }, user_id: guestId }, { projection })
      .sort({ sequence: 1, created_at: 1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .toArray();
    
    const totalCount = await chatHistoryDB.countDocuments({
      conversation_id: { $in: convIdCandidates },
      user_id: guestId
    });
    
    console.log(` [DEMO] Retrieved ${messages.length}/${totalCount} messages`);
    
    res.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id?.toString() || String(msg._id),
        text: msg.message || '',
        message: msg.message || '',
        isUser: !msg.is_bot,
        is_bot: msg.is_bot,
        timestamp: msg.timestamp || msg.created_at?.toISOString() || new Date().toISOString(),
        conversationId: msg.conversation_id,
        conversation_id: msg.conversation_id,
        sources: msg.sources || [],
        confidence: msg.confidence || 0,
        attachments: msg.attachments || []
      })),
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: parsedSkip + messages.length < totalCount
      }
    });
    
  } catch (error) {
    console.error(" [DEMO] Error fetching messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages"
    });
  }
});

router.get("/conversations/:conversation_id/messages", authMiddleware, async (req, res) => {
  try {
    const { conversation_id } = req.params;
    const { limit = 100, skip = 0 } = req.query; // 🚀 PERFORMANCE: Pagination support
    const userId = req.user.id;
    const chatHistoryDB = await getCollection("messages");

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const parsedLimit = Math.min(parseInt(limit) || 100, 200); // Max 200 messages
    const parsedSkip = parseInt(skip) || 0;

    console.log(` Fetching messages for conversation: ${conversation_id} (user: ${userId}, limit: ${parsedLimit}, skip: ${parsedSkip})`);

    const userIdCandidates2 = [userId];
    if (/^[a-fA-F0-9]{24}$/.test(userId)) {
      try { userIdCandidates2.push(new ObjectId(userId)); } catch (e) {}
    }

    const convIdCandidates2 = [conversation_id];
    if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      try { convIdCandidates2.push(new ObjectId(conversation_id)); } catch (e) {}
    }

    const projection = {
      _id: 1,
      message: 1,
      is_bot: 1,
      created_at: 1,
      timestamp: 1,
      conversation_id: 1,
      sources: 1,
      confidence: 1,
      attachments: 1,
      sequence: 1
    };

    const messages = await chatHistoryDB
      .find({
        conversation_id: { $in: convIdCandidates2 },
        user_id: { $in: userIdCandidates2 }
      }, { projection })
      .sort({ sequence: 1, created_at: 1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .toArray();

    const totalCount = await chatHistoryDB.countDocuments({
      conversation_id: { $in: convIdCandidates2 },
      user_id: { $in: userIdCandidates2 }
    });

    console.log(` Retrieved ${messages.length}/${totalCount} raw messages for conversation ${conversation_id} (user: ${userId})`);

    const dedupedMessages = [];
    const seenSignatures = new Set();
    
    for (const msg of messages) {
      const timestamp = msg.created_at || msg.timestamp;
      const timestampSec = timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : 0;
      const signature = `${conversation_id}|${msg.is_bot}|${msg.message}|${timestampSec}`;
      
      if (!seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        dedupedMessages.push(msg);
      } else {
        console.warn(` [DEDUP] Skipping duplicate message: ${msg.message?.substring(0, 50)}...`);
      }
    }

    if (dedupedMessages.length < messages.length) {
      console.warn(` [DEDUP] Removed ${messages.length - dedupedMessages.length} duplicate messages`);
    }

    res.json({
      success: true,
      messages: dedupedMessages.map(msg => ({
        id: msg._id?.toString() || String(msg._id),
        text: msg.message || '',
        isUser: !msg.is_bot,
        timestamp: msg.timestamp || msg.created_at?.toISOString() || new Date().toISOString(),
        conversationId: msg.conversation_id,
        sources: msg.sources || [],
        confidence: msg.confidence || 0,
        attachments: msg.attachments || []
      })),
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: parsedSkip + dedupedMessages.length < totalCount
      }
    });

  } catch (error) {
    console.error(" Error fetching messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.delete("/:conversation_id/clear", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversation_id } = req.params;
    const chatHistoryDB = await getCollection("messages");

    const deleteFilter = { user_id: userId, conversation_id };
    await chatHistoryDB.deleteMany(deleteFilter);

    res.json({ 
      success: true,
      message: "Chat history cleared successfully" 
    });
  } catch (err) {
    console.error(" Error clearing chats:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

router.delete("/:conversation_id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversation_id } = req.params;
    const chatHistoryDB = await getCollection("messages");
    const chatSessionsDB = await getCollection("conversations");

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    console.log(`[DELETE] Starting deletion of conversation ${conversation_id} for user ${userId}`);

    const messagesResult = await chatHistoryDB.deleteMany({ 
      user_id: userId, 
      conversation_id 
    });
    console.log(` [DELETE] Deleted ${messagesResult.deletedCount} messages for conversation ${conversation_id}`);

    let conversationResult = { deletedCount: 0 };
    
    conversationResult = await chatSessionsDB.deleteOne({
      _id: conversation_id,
      user_id: userId
    });
    console.log(`[DELETE] Query by string ID: ${conversation_id}, deleted: ${conversationResult.deletedCount}`);

    if (conversationResult.deletedCount === 0 && /^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      console.log(`[DELETE] String ID query returned 0, trying ObjectId format...`);
      try {
        const conversationObjectId = new ObjectId(conversation_id);
        conversationResult = await chatSessionsDB.deleteOne({
          _id: conversationObjectId,
          user_id: userId
        });
        console.log(`[DELETE] Query by ObjectId: ${conversation_id}, deleted: ${conversationResult.deletedCount}`);
      } catch (objectIdError) {
        console.log(` [DELETE] ObjectId conversion failed: ${objectIdError.message}`);
      }
    }

    if (conversationResult.deletedCount === 0) {
      console.warn(` [DELETE] WARNING: Conversation ${conversation_id} not found for user ${userId}`);
      console.warn(` [DELETE] This may indicate the conversation was already deleted or doesn't exist`);
    } else {
      console.log(` [DELETE] Successfully deleted conversation metadata`);
    }

    console.log(` [DELETE] COMPLETE: Deleted ${messagesResult.deletedCount} messages and ${conversationResult.deletedCount} conversation records for ${conversation_id}`);

    res.json({ 
      success: true,
      message: "Conversation deleted successfully",
      deletedMessages: messagesResult.deletedCount,
      deletedConversation: conversationResult.deletedCount
    });
  } catch (err) {
    console.error(" Error deleting conversation:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete conversation" 
    });
  }
});

router.post("/send", authMiddleware, rateLimiters.chatRateLimit, validateChatPayload, async (req, res) => {
  const startTime = Date.now();
  let userMessageSaved = false;
  
  try {
    const { message, conversation_id, university_name, user_context } = req.body;
    const userId = req.user.id;

    console.log(` [CHAT-SEND] User ${userId} sending message (${message?.length || 0} chars) to conversation ${conversation_id}`);

    if (!message || !conversation_id) {
      console.warn(` [CHAT-SEND] Missing required fields: message=${!!message}, conversation_id=${!!conversation_id}`);
      return res.status(400).json({ 
        success: false,
        message: "Message and conversation_id are required" 
      });
    }

    const chatHistoryDB = await getCollection('messages');

    // Load recent conversation turns BEFORE inserting the current message,
    // so chat_history reflects everything that happened prior to this turn.
    // main.py builds [system, ...chat_history, current user_message] - if we
    // fetched after inserting, the current message would be duplicated.
    let chatHistoryForAI = [];
    try {
      const userIdCandidatesHist = [userId];
      if (/^[a-fA-F0-9]{24}$/.test(userId)) {
        try { userIdCandidatesHist.push(new ObjectId(userId)); } catch (e) {}
      }
      const convIdCandidatesHist = [conversation_id];
      if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
        try { convIdCandidatesHist.push(new ObjectId(conversation_id)); } catch (e) {}
      }

      const priorMessages = await chatHistoryDB
        .find({
          conversation_id: { $in: convIdCandidatesHist },
          user_id: { $in: userIdCandidatesHist }
        })
        .sort({ sequence: -1, created_at: -1 })
        .limit(20)
        .toArray();

      chatHistoryForAI = priorMessages
        .reverse()
        .map(m => ({ role: m.is_bot ? 'assistant' : 'user', content: m.message || '' }));

      console.log(` [CHAT-SEND] Loaded ${chatHistoryForAI.length} prior messages for context`);
    } catch (historyError) {
      console.error(` [CHAT-SEND] Failed to load chat history:`, historyError.message);
    }

    const coachOpening = typeof user_context?.coach_opening === 'string'
      ? user_context.coach_opening.trim().slice(0, 1000)
      : '';
    if (coachOpening && chatHistoryForAI.length === 0) {
      chatHistoryForAI = [{ role: 'assistant', content: coachOpening }];
    }

    // Load the user's saved assessment profile + already-computed university
    // matches (written by assessments.js on submit) so the AI doesn't have to
    // re-derive recommendations from scratch on every turn.
    let assessmentContext = {};
    try {
      const userProfilesDB = await getCollection('user_profiles');
      const profileIdCandidates = [userId];
      if (/^[a-fA-F0-9]{24}$/.test(userId)) {
        try { profileIdCandidates.push(new ObjectId(userId)); } catch (e) {}
      }

      const userProfile = await userProfilesDB.findOne({
        user_id: { $in: profileIdCandidates }
      });

      if (userProfile) {
        assessmentContext = {
          assessment_data: userProfile.preferences || null,
          university_matches: userProfile.university_matches || null,
          ai_recommendations: userProfile.ai_recommendations || null
        };
        console.log(` [CHAT-SEND] Loaded saved assessment profile for user ${userId}`);
      }
    } catch (profileError) {
      console.error(` [CHAT-SEND] Failed to load assessment profile:`, profileError.message);
    }

    const studentMessage = {
      user_id: userId,
      conversation_id: conversation_id,
      message: message,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString()
    };

    try {
      await chatHistoryDB.insertOne(studentMessage);
      userMessageSaved = true;
      console.log(` [CHAT-SEND] User message saved to MongoDB`);
    } catch (dbError) {
      console.error(` [CHAT-SEND] Failed to save user message:`, dbError);
    }

    const knowledgeRequestPayload = {
      message: message,
      conversation_id: conversation_id,
      university_name: university_name || null,
      chat_history: chatHistoryForAI,
      user_context: {
        ...assessmentContext,
        ...(user_context || {}),
        user_id: userId,
        preferred_university: university_name,
        timestamp: new Date().toISOString()
      }
    };

    console.log(` [CHAT-SEND] Sending to RAG service: ${AI_SERVICE_URL}`);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`[CHAT-SEND] RAG service timeout after 30s, aborting request`);
      abortController.abort();
    }, 30000);

    let cancelledByStudent = false;
    res.on('close', () => {
      if (!res.writableFinished) {
        cancelledByStudent = true;
        abortController.abort();
      }
    });
    const discardCancelledTurn = async () => {
      console.log(` [CHAT-SEND] Cancelled by the student, nothing saved for this turn`);
      if (userMessageSaved && studentMessage._id) {
        try {
          await chatHistoryDB.deleteOne({ _id: studentMessage._id });
        } catch (dbError) {
          console.error(` [CHAT-SEND] Failed to remove cancelled message:`, dbError.message);
        }
      }
    };

    let aiKnowledgeResponse;
    try {
      const knowledgeServiceResponse = await fetch(AI_SERVICE_URL, {
        method: "POST",
        headers: aiServiceHeaders({
          "Content-Type": "application/json",
          "x-user-id": userId,
        }),
        body: JSON.stringify(knowledgeRequestPayload),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      if (!knowledgeServiceResponse.ok) {
        const errorText = await knowledgeServiceResponse.text().catch(() => 'Unknown error');
        console.error(` [CHAT-SEND] RAG service error: ${knowledgeServiceResponse.status} ${knowledgeServiceResponse.statusText} - ${errorText}`);
        
        const statusError = new Error(`RAG service returned ${knowledgeServiceResponse.status}: ${errorText}`);
        statusError.status = knowledgeServiceResponse.status;
        throw statusError;
      }

      aiKnowledgeResponse = await knowledgeServiceResponse.json();
      console.log(` [CHAT-SEND] RAG response received successfully`);
      console.log(`   └─ Confidence: ${aiKnowledgeResponse.confidence || 0}`);
      console.log(`   └─ Sources: ${aiKnowledgeResponse.sources?.length || 0}`);
      console.log(`   └─ Reply length: ${aiKnowledgeResponse.reply?.length || 0} chars`);

    } catch (ragError) {
      clearTimeout(timeoutId);

      if (cancelledByStudent) {
        await discardCancelledTurn();
        return;
      }

      if (ragError.name === 'AbortError') {
        console.error(` [CHAT-SEND] RAG service request aborted (timeout)`);
      } else if (ragError.code === 'ECONNREFUSED') {
        console.error(` [CHAT-SEND] RAG service connection refused - service may be down`);
      } else if (ragError.code === 'ENOTFOUND') {
        console.error(` [CHAT-SEND] RAG service not found at: ${AI_SERVICE_URL}`);
      } else {
        console.error(` [CHAT-SEND] RAG service error:`, ragError.message);
      }

      // No canned answer: remove the student's message so a retry doesn't
      // save it twice, and tell the frontend it can retry. A timeout,
      // refused connection or 502/503/504 usually means the AI service is
      // waking up after being idle.
      if (userMessageSaved && studentMessage._id) {
        try {
          await chatHistoryDB.deleteOne({ _id: studentMessage._id });
        } catch (dbError) {
          console.error(` [CHAT-SEND] Failed to remove unanswered message:`, dbError.message);
        }
      }

      const wakingUp =
        ragError.name === 'AbortError' ||
        ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(ragError.code) ||
        [502, 503, 504].includes(ragError.status);

      const processingTime = Date.now() - startTime;
      console.log(` [CHAT-SEND] AI unavailable (${wakingUp ? 'waking up' : 'error'}) after ${processingTime}ms`);

      return res.status(503).json({
        success: false,
        error: wakingUp ? 'AI_WAKING_UP' : 'AI_UNAVAILABLE',
        retryable: true,
        message: wakingUp
          ? 'Cerkyl is waking up. This can take up to a minute.'
          : "Cerkyl couldn't answer that just now. Please try again.",
        conversation_id: conversation_id,
        processing_time: processingTime
      });
    }

    if (cancelledByStudent) {
      await discardCancelledTurn();
      return;
    }

    const aiMessage = {
      user_id: userId,
      conversation_id: conversation_id,
      message: aiKnowledgeResponse.reply,
      is_bot: true,
      created_at: new Date(),
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString(),
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0
    };

    try {
      await chatHistoryDB.insertOne(aiMessage);
      console.log(` [CHAT-SEND] AI response saved to MongoDB`);
    } catch (dbError) {
      console.error(` [CHAT-SEND] Failed to save AI response:`, dbError.message);
      console.error(`   └─ Database error details:`, dbError);
    }

    // Give the conversation a real title as soon as it has an answer, and
    // retry on later messages if an earlier attempt didn't stick.
    try {
      const chatSessionsDB = await getCollection('conversations');
      const conversation = await chatSessionsDB.findOne(
        { _id: conversation_id },
        { projection: { title: 1, user_id: 1 } }
      );
      const ownedByOther = conversation?.user_id != null && String(conversation.user_id) !== String(userId);

      if (
        !ownedByOther &&
        !isSmallTalkMessage(message) &&
        isGenericTitle(conversation?.title) &&
        !titlesInProgress.has(conversation_id)
      ) {
        titlesInProgress.add(conversation_id);
        console.log(`[TITLE-GEN] Generating title for conversation ${conversation_id}`);

        setImmediate(async () => {
          try {
            const userMessages = await chatHistoryDB
              .find(
                { conversation_id, user_id: userId, is_bot: false },
                { sort: { created_at: 1 }, projection: { message: 1 } }
              )
              .limit(10)
              .toArray();
            const firstSubstantive = userMessages.find((m) => !isSmallTalkMessage(m.message));
            const firstText = firstSubstantive?.message || message;
            const titleResult = await generateTitleWithFallback(
              firstText,
              aiKnowledgeResponse.reply,
              university_name,
              () => titleFromMessage(firstText)
            );

            // Only fill in a missing or generic title; never overwrite one
            // that was saved meanwhile.
            const latest = await chatSessionsDB.findOne({ _id: conversation_id }, { projection: { title: 1 } });
            if (latest && !isGenericTitle(latest.title)) {
              console.log(`[TITLE-GEN] Title already set meanwhile: "${latest.title}"`);
              return;
            }

            await chatSessionsDB.updateOne(
              { _id: conversation_id },
              {
                $set: {
                  title: titleResult.title,
                  title_generated_at: new Date(),
                  title_method: titleResult.method,
                  updated_at: new Date(),
                  user_id: userId
                },
                $setOnInsert: {
                  created_at: new Date(),
                  last_message: '',
                  message_count: 0
                }
              },
              { upsert: true }
            );
            console.log(` [TITLE-GEN] Saved title: "${titleResult.title}" (method: ${titleResult.method})`);
          } catch (titleError) {
            console.error(` [TITLE-GEN] Failed to generate title:`, titleError.message);
          } finally {
            titlesInProgress.delete(conversation_id);
          }
        });
      }
    } catch (titleCheckError) {
      console.error(` [TITLE-GEN] Error checking for title generation:`, titleCheckError.message);
    }

    const processingTime = Date.now() - startTime;
    console.log(`[CHAT-SEND] Total processing time: ${processingTime}ms`);
    console.log(` [CHAT-SEND] Response sent successfully to client`);

    res.json({
      success: true,
      message: aiKnowledgeResponse.reply,
      reply: aiKnowledgeResponse.reply,
      conversation_id: conversation_id,
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0,
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString(),
      processing_time: processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(` [CHAT-SEND] Critical error (after ${processingTime}ms):`, error);
    console.error(` [CHAT-SEND] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      error: 'SEND_FAILED',
      retryable: true,
      message: "Your message couldn't be sent. Please try again.",
      conversation_id: req.body?.conversation_id
    });
  }
});

router.post("/send-stream", authMiddleware, rateLimiters.chatRateLimit, validateChatPayload, async (req, res) => {
  const startTime = Date.now();
  let userMessageSaved = false;
  let sseStarted = false;

  const sendSseEvent = (eventName, payload) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const { message, conversation_id, university_name, user_context } = req.body;
    const userId = req.user.id;

    console.log(` [CHAT-STREAM] User ${userId} sending message (${message?.length || 0} chars) to conversation ${conversation_id}`);

    if (!message || !conversation_id) {
      return res.status(400).json({
        success: false,
        message: "Message and conversation_id are required"
      });
    }

    const chatHistoryDB = await getCollection('messages');

    // Load recent conversation turns BEFORE inserting the current message.
    let chatHistoryForAI = [];
    try {
      const userIdCandidatesHist = [userId];
      if (/^[a-fA-F0-9]{24}$/.test(userId)) {
        try { userIdCandidatesHist.push(new ObjectId(userId)); } catch (e) {}
      }
      const convIdCandidatesHist = [conversation_id];
      if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
        try { convIdCandidatesHist.push(new ObjectId(conversation_id)); } catch (e) {}
      }

      const priorMessages = await chatHistoryDB
        .find({
          conversation_id: { $in: convIdCandidatesHist },
          user_id: { $in: userIdCandidatesHist }
        })
        .sort({ sequence: -1, created_at: -1 })
        .limit(20)
        .toArray();

      chatHistoryForAI = priorMessages
        .reverse()
        .map(m => ({ role: m.is_bot ? 'assistant' : 'user', content: m.message || '' }));
    } catch (historyError) {
      console.error(` [CHAT-STREAM] Failed to load chat history:`, historyError.message);
    }

    const coachOpening = typeof user_context?.coach_opening === 'string'
      ? user_context.coach_opening.trim().slice(0, 1000)
      : '';
    if (coachOpening && chatHistoryForAI.length === 0) {
      chatHistoryForAI = [{ role: 'assistant', content: coachOpening }];
    }

    let assessmentContext = {};
    try {
      const userProfilesDB = await getCollection('user_profiles');
      const profileIdCandidates = [userId];
      if (/^[a-fA-F0-9]{24}$/.test(userId)) {
        try { profileIdCandidates.push(new ObjectId(userId)); } catch (e) {}
      }

      const userProfile = await userProfilesDB.findOne({
        user_id: { $in: profileIdCandidates }
      });

      if (userProfile) {
        assessmentContext = {
          assessment_data: userProfile.preferences || null,
          university_matches: userProfile.university_matches || null,
          ai_recommendations: userProfile.ai_recommendations || null
        };
      }
    } catch (profileError) {
      console.error(` [CHAT-STREAM] Failed to load assessment profile:`, profileError.message);
    }

    const studentMessage = {
      user_id: userId,
      conversation_id: conversation_id,
      message: message,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString()
    };

    try {
      await chatHistoryDB.insertOne(studentMessage);
      userMessageSaved = true;
    } catch (dbError) {
      console.error(` [CHAT-STREAM] Failed to save user message:`, dbError);
    }

    const knowledgeRequestPayload = {
      message: message,
      conversation_id: conversation_id,
      university_name: university_name || null,
      chat_history: chatHistoryForAI,
      user_context: {
        ...assessmentContext,
        ...(user_context || {}),
        user_id: userId,
        preferred_university: university_name,
        timestamp: new Date().toISOString()
      }
    };

    const streamEndpoint = AI_SERVICE_URL.endsWith('/respond')
      ? AI_SERVICE_URL.replace(/\/respond$/, '/respond-stream')
      : `${AI_SERVICE_URL.replace(/\/$/, '')}/respond-stream`;

    console.log(` [CHAT-STREAM] Connecting to RAG stream endpoint: ${streamEndpoint}`);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`[CHAT-STREAM] RAG stream connection timeout after 30s, aborting`);
      abortController.abort();
    }, 30000);

    let cancelledByStudent = false;
    res.on('close', () => {
      if (!res.writableFinished) {
        cancelledByStudent = true;
        abortController.abort();
      }
    });

    const deleteStudentMessage = async () => {
      if (userMessageSaved && studentMessage._id) {
        try {
          await chatHistoryDB.deleteOne({ _id: studentMessage._id });
          userMessageSaved = false;
        } catch (dbError) {
          console.error(` [CHAT-STREAM] Failed to remove unsaved message:`, dbError.message);
        }
      }
    };

    let knowledgeServiceResponse;
    try {
      knowledgeServiceResponse = await fetch(streamEndpoint, {
        method: "POST",
        headers: aiServiceHeaders({
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "x-user-id": userId,
        }),
        body: JSON.stringify(knowledgeRequestPayload),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      if (!knowledgeServiceResponse.ok) {
        const errorText = await knowledgeServiceResponse.text().catch(() => 'Unknown error');
        const statusError = new Error(`RAG stream returned ${knowledgeServiceResponse.status}: ${errorText}`);
        statusError.status = knowledgeServiceResponse.status;
        throw statusError;
      }
    } catch (ragError) {
      clearTimeout(timeoutId);

      if (cancelledByStudent) {
        await deleteStudentMessage();
        return;
      }

      await deleteStudentMessage();

      if (ragError.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'STREAM_NOT_SUPPORTED',
          message: 'Streaming endpoint is not available.'
        });
      }

      const wakingUp =
        ragError.name === 'AbortError' ||
        ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(ragError.code) ||
        [502, 503, 504].includes(ragError.status);

      const processingTime = Date.now() - startTime;
      console.log(` [CHAT-STREAM] AI unavailable (${wakingUp ? 'waking up' : 'error'}) after ${processingTime}ms`);

      return res.status(503).json({
        success: false,
        error: wakingUp ? 'AI_WAKING_UP' : 'AI_UNAVAILABLE',
        retryable: true,
        message: wakingUp
          ? 'Cerkyl is waking up. This can take up to a minute.'
          : "Cerkyl couldn't answer that just now. Please try again.",
        conversation_id: conversation_id,
        processing_time: processingTime
      });
    }

    if (cancelledByStudent) {
      await deleteStudentMessage();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    sseStarted = true;

    let buffer = '';
    let accumulatedReply = '';
    let finalReply = '';
    let finalSources = [];
    let finalConfidence = 0.0;
    let finalTimestamp = new Date().toISOString();
    let streamErrorPayload = null;

    const processSseBlock = (block) => {
      const lines = block.split('\n');
      let eventName = 'message';
      const dataLines = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) return;
      const rawData = dataLines.join('\n');
      let parsed;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = { text: rawData };
      }

      if (eventName === 'meta') {
        finalSources = parsed.sources || [];
        finalConfidence = parsed.confidence || 0.0;
        sendSseEvent('meta', {
          sources: finalSources,
          confidence: finalConfidence
        });
      } else if (eventName === 'delta') {
        const chunkText = typeof parsed.text === 'string' ? parsed.text : '';
        if (chunkText) {
          accumulatedReply += chunkText;
          sendSseEvent('delta', { text: chunkText });
        }
      } else if (eventName === 'done') {
        finalReply = typeof parsed.reply === 'string' ? parsed.reply : accumulatedReply;
        if (Array.isArray(parsed.sources)) finalSources = parsed.sources;
        if (typeof parsed.confidence === 'number') finalConfidence = parsed.confidence;
        if (parsed.timestamp) finalTimestamp = parsed.timestamp;
      } else if (eventName === 'error') {
        streamErrorPayload = parsed;
      }
    };

    try {
      for await (const rawChunk of knowledgeServiceResponse.body) {
        if (cancelledByStudent) break;
        buffer += Buffer.isBuffer(rawChunk) ? rawChunk.toString('utf8') : String(rawChunk);
        buffer = buffer.replace(/\r\n/g, '\n');

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (block.trim()) {
            processSseBlock(block);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }

      if (!cancelledByStudent && buffer.trim()) {
        processSseBlock(buffer);
      }
    } catch (streamErr) {
      if (cancelledByStudent) {
        await deleteStudentMessage();
        if (!res.writableEnded) res.end();
        return;
      }

      console.error(` [CHAT-STREAM] Upstream stream error:`, streamErr.message);
      await deleteStudentMessage();

      const wakingUp =
        streamErr.name === 'AbortError' ||
        ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(streamErr.code);

      sendSseEvent('error', {
        success: false,
        error: wakingUp ? 'AI_WAKING_UP' : 'AI_UNAVAILABLE',
        retryable: true,
        message: wakingUp
          ? 'Cerkyl is waking up. This can take up to a minute.'
          : "Cerkyl couldn't finish answering that just now. Please try again.",
        conversation_id: conversation_id
      });
      if (!res.writableEnded) res.end();
      return;
    }

    if (cancelledByStudent) {
      await deleteStudentMessage();
      if (!res.writableEnded) res.end();
      return;
    }

    const replyToSave = finalReply || accumulatedReply;
    if (streamErrorPayload || !replyToSave) {
      await deleteStudentMessage();
      sendSseEvent('error', {
        success: false,
        error: streamErrorPayload?.error || 'AI_UNAVAILABLE',
        retryable: streamErrorPayload?.retryable ?? true,
        message: streamErrorPayload?.message || "Cerkyl couldn't answer that just now. Please try again.",
        conversation_id: conversation_id
      });
      if (!res.writableEnded) res.end();
      return;
    }

    const aiMessage = {
      user_id: userId,
      conversation_id: conversation_id,
      message: replyToSave,
      is_bot: true,
      created_at: new Date(),
      timestamp: finalTimestamp,
      sources: finalSources,
      confidence: finalConfidence
    };

    try {
      await chatHistoryDB.insertOne(aiMessage);
      console.log(` [CHAT-STREAM] AI response saved to MongoDB`);
    } catch (dbError) {
      console.error(` [CHAT-STREAM] Failed to save AI response:`, dbError.message);
    }

    // Background title generation (same as /send)
    try {
      const chatSessionsDB = await getCollection('conversations');
      const conversation = await chatSessionsDB.findOne(
        { _id: conversation_id },
        { projection: { title: 1, user_id: 1 } }
      );
      const ownedByOther = conversation?.user_id != null && String(conversation.user_id) !== String(userId);

      if (
        !ownedByOther &&
        !isSmallTalkMessage(message) &&
        isGenericTitle(conversation?.title) &&
        !titlesInProgress.has(conversation_id)
      ) {
        titlesInProgress.add(conversation_id);
        setImmediate(async () => {
          try {
            const userMessages = await chatHistoryDB
              .find(
                { conversation_id, user_id: userId, is_bot: false },
                { sort: { created_at: 1 }, projection: { message: 1 } }
              )
              .limit(10)
              .toArray();
            const firstSubstantive = userMessages.find((m) => !isSmallTalkMessage(m.message));
            const firstText = firstSubstantive?.message || message;
            const titleResult = await generateTitleWithFallback(
              firstText,
              replyToSave,
              university_name,
              () => titleFromMessage(firstText)
            );

            const latest = await chatSessionsDB.findOne({ _id: conversation_id }, { projection: { title: 1 } });
            if (latest && !isGenericTitle(latest.title)) {
              return;
            }

            await chatSessionsDB.updateOne(
              { _id: conversation_id },
              {
                $set: {
                  title: titleResult.title,
                  title_generated_at: new Date(),
                  title_method: titleResult.method,
                  updated_at: new Date(),
                  user_id: userId
                },
                $setOnInsert: {
                  created_at: new Date(),
                  last_message: '',
                  message_count: 0
                }
              },
              { upsert: true }
            );
          } catch (titleError) {
            console.error(` [TITLE-GEN] Failed to generate title:`, titleError.message);
          } finally {
            titlesInProgress.delete(conversation_id);
          }
        });
      }
    } catch (titleCheckError) {
      console.error(` [TITLE-GEN] Error checking for title generation:`, titleCheckError.message);
    }

    const processingTime = Date.now() - startTime;
    sendSseEvent('done', {
      success: true,
      reply: replyToSave,
      message: replyToSave,
      conversation_id: conversation_id,
      sources: finalSources,
      confidence: finalConfidence,
      timestamp: finalTimestamp,
      processing_time: processingTime
    });
    if (!res.writableEnded) res.end();

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(` [CHAT-STREAM] Critical error (after ${processingTime}ms):`, error);

    if (sseStarted) {
      sendSseEvent('error', {
        success: false,
        error: 'SEND_FAILED',
        retryable: true,
        message: "Your message couldn't be sent. Please try again.",
        conversation_id: req.body?.conversation_id
      });
      if (!res.writableEnded) res.end();
    } else {
      res.status(500).json({
        success: false,
        error: 'SEND_FAILED',
        retryable: true,
        message: "Your message couldn't be sent. Please try again.",
        conversation_id: req.body?.conversation_id
      });
    }
  }
});

router.post("/send-message-demo", async (req, res) => {
  try {
    const { message, conversation_id, university_name } = req.body;
    const userId = req.user?.id || "demo-user";

    if (!message || !conversation_id) {
      return res.status(400).json({ 
        success: false,
        message: "Message and conversation_id are required" 
      });
    }

    const knowledgeRequestPayload = {
      message: message,
      conversation_id: conversation_id,
      university_name: university_name || null,
      user_context: {
        user_id: userId,
        preferred_university: university_name
      }
    };

    const knowledgeServiceResponse = await fetch(AI_SERVICE_URL, {
      method: "POST",
      headers: aiServiceHeaders({
        "Content-Type": "application/json",
        "x-user-id": userId,
      }),
      body: JSON.stringify(knowledgeRequestPayload),
    });

    const aiKnowledgeResponse = await knowledgeServiceResponse.json();

    const chatHistoryDB = await getCollection("messages");

    await chatHistoryDB.insertOne({
      user_id: userId,
      conversation_id: conversation_id,
      message: message,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString()
    });

    await chatHistoryDB.insertOne({
      user_id: userId,
      conversation_id: conversation_id,
      message: aiKnowledgeResponse.reply,
      is_bot: true,
      created_at: new Date(),
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString(),
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0
    });

    try {
      const chatSessionsDB = await getCollection('conversations');
      
      const messageCount = await chatHistoryDB.countDocuments({
        conversation_id: conversation_id,
        user_id: userId
      });

      console.log(`[DEMO-TITLE] Message count for conversation ${conversation_id}: ${messageCount}`);

      if (messageCount === 2) {
        console.log(`[DEMO-TITLE] First exchange! Generating title...`);
        
        const convIdCandidates = [conversation_id];
        if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
          try { convIdCandidates.push(new ObjectId(conversation_id)); } catch (e) {}
        }
        
        const conversation = await chatSessionsDB.findOne({
          _id: { $in: convIdCandidates }
        });

        const hasCustomTitle = conversation?.title && 
                              conversation.title !== 'New Conversation' && 
                              conversation.title !== 'Untitled Conversation' &&
                              !conversation.title.startsWith('conv_');

        if (!hasCustomTitle) {
          console.log(`🏷️ [DEMO-TITLE] Generating title from: "${message.substring(0, 50)}..."`);
          
          setImmediate(async () => {
            try {
              const titleResult = await generateTitleWithFallback(
                message, // First user message
                aiKnowledgeResponse.reply, // First bot reply
                university_name,
                () => {
                  const cleanMsg = message.trim();
                  const firstSentence = cleanMsg.match(/^[^.!?]+/)?.[0] || cleanMsg;
                  return firstSentence.length > 60 
                    ? firstSentence.substring(0, 60).trim() + '...' 
                    : firstSentence;
                }
              );

              const updateResult = await chatSessionsDB.updateOne(
                { _id: { $in: convIdCandidates } },
                { 
                  $set: { 
                    title: titleResult.title,
                    title_generated_at: new Date(),
                    title_method: titleResult.method,
                    updated_at: new Date(),
                    user_id: userId
                  },
                  $setOnInsert: {
                    created_at: new Date(),
                    last_message: '',
                    message_count: 0
                  }
                },
                { upsert: true } // 
              );

              if (updateResult.upsertedCount > 0) {
                console.log(` [DEMO-TITLE] Created conversation with title: "${titleResult.title}" (${titleResult.method})`);
              } else {
                console.log(` [DEMO-TITLE] Updated conversation with title: "${titleResult.title}" (${titleResult.method})`);
              }
            } catch (titleError) {
              console.error(` [DEMO-TITLE] Failed:`, titleError.message);
            }
          });
        } else {
          console.log(`[DEMO-TITLE] Has custom title: "${conversation.title}"`);
        }
      } else {
        console.log(`[DEMO-TITLE] Not first exchange (count: ${messageCount})`);
      }
    } catch (titleCheckError) {
      console.error(` [DEMO-TITLE] Error:`, titleCheckError.message);
    }

    res.json({
      success: true,
      message: aiKnowledgeResponse.reply,
      reply: aiKnowledgeResponse.reply,
      conversation_id: conversation_id,
      sources: aiKnowledgeResponse.sources || [],
      confidence: aiKnowledgeResponse.confidence || 0.0,
      timestamp: aiKnowledgeResponse.timestamp || new Date().toISOString()
    });

  } catch (error) {
    console.error(" Chat error:", error);
    res.status(500).json({ 
      success: false,
      message: "I'm having some technical issues right now. Please try again.",
      conversation_id: req.body.conversation_id
    });
  }
});

router.post("/conversations/:id/generate-title", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { firstUserMessage, firstBotReply, universityContext, fallbackTitle } = req.body;

    console.log('Generating LLM title from FIRST user message for conversation:', conversationId);
    console.log('   └─ First user message:', firstUserMessage?.substring(0, 100));

    if (!firstUserMessage || firstUserMessage.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'First user message is required and must be at least 5 characters'
      });
    }

    const result = await generateTitleWithFallback(
      firstUserMessage,
      firstBotReply,
      universityContext,

      () => fallbackTitle || firstUserMessage.substring(0, 50).trim()
    );

    console.log(' Generated title:', result.title, '(method:', result.method + ')');

    const chatSessionsDB = await getCollection("conversations");
    await chatSessionsDB.updateOne(
      { _id: conversationId },
      { 
        $set: { 
          title: result.title,
          title_generated_at: new Date(),
          title_method: result.method
        } 
      }
    );

    console.log(' Updated conversation title in database');

    res.json({
      success: true,
      title: result.title,
      method: result.method
    });

  } catch (error) {
    console.error(' Error generating conversation title:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      title: req.body.fallbackTitle || 'Untitled Conversation'
    });
  }
});

export default router;
