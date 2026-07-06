import { getCollection } from "../config/db.js";
import axios from "axios";
import { ObjectId } from "mongodb";
import multer from "multer";
import fs from "fs";
import path from "path";

export const getAllChats = async (req, res) => {
  try {
    const studentId = req.user.id;
    const conversationCollection = await getCollection("conversations");
    const activeConversations = await conversationCollection
      .find({ user_id: studentId })
      .sort({ created_at: -1 })
      .toArray();

    res.json({ 
      success: true, 
      data: activeConversations.map(conv => ({
        id: conv._id.toString(),
        title: conv.title,
        created_at: conv.created_at || conv.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch chats" });
  }
};

export const createChat = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { title } = req.body;
    const conversationCollection = await getCollection('conversations');

    const chatSession = {
      user_id: studentId,
      title: title || 'New Conversation',
      created_at: new Date(),
      updated_at: new Date(),
      message_count: 0
    };

    const insertionRecord = await conversationCollection.insertOne(chatSession);

    res.json({
      success: true,
      data: {
        id: insertionRecord.insertedId.toString(),
        title: chatSession.title,
        created_at: chatSession.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create chat" });
  }
};

export const getChatMessages = async (req, res) => {
  try {
    const { id: chatId } = req.params;
    const studentId = req.user.id;
    const chatHistoryCollection = await getCollection("messages");

    const messageThread = await chatHistoryCollection
      .find({ conversation_id: chatId, user_id: studentId })
      .sort({ sequence: 1, created_at: 1 })
      .toArray();

    const uniqueSignatures = new Set();
    const distinctMessages = messageThread.filter(msg => {
      const timeReference = msg.created_at || msg.createdAt;
      const signature = `${chatId}|${msg.is_bot}|${msg.message}|${Math.floor(new Date(timeReference).getTime() / 1000)}`;
      if (uniqueSignatures.has(signature)) return false;
      uniqueSignatures.add(signature);
      return true;
    });

    res.json({
      success: true,
      data: distinctMessages.map(msg => ({
        id: msg._id.toString(),
        message: msg.message,
        is_bot: msg.is_bot,
        created_at: msg.created_at || msg.createdAt,
        timestamp: (msg.created_at || msg.createdAt).toISOString(),
        sources: msg.sources || [],
        confidence: msg.confidence || 0
      })),
      metadata: {
        total: messageThread.length,
        deduped: distinctMessages.length,
        duplicates_removed: messageThread.length - distinctMessages.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

export const sendMessageToRag = async (req, res) => {
  try {
    const { message: studentQuery, conversation_id, university_name } = req.body;
    const studentId = req.user.id;

    if (!studentQuery || !conversation_id) {
      return res.status(400).json({ success: false, message: "Message and conversation_id are required" });
    }

    const messageArchive = await getCollection('messages');
    let threadIdentifier = conversation_id;
    if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      try { threadIdentifier = new ObjectId(conversation_id); } catch { threadIdentifier = conversation_id; }
    }

    const timeThreshold = new Date(Date.now() - 2000);
    const existingDuplicate = await messageArchive.findOne({
      user_id: studentId,
      conversation_id,
      message: studentQuery,
      is_bot: false,
      created_at: { $gte: timeThreshold }
    });
    
    if (existingDuplicate) {
      return res.status(409).json({ success: false, message: "This message was already sent. Please wait for a response.", isDuplicate: true });
    }

    await messageArchive.insertOne({
      user_id: studentId,
      conversation_id,
      message: studentQuery,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString()
    });

    let studentProfile = null;
    try {
      const profileCollection = await getCollection('user_assessments');
      let studentObjId = null;
      if (/^[a-fA-F0-9]{24}$/.test(studentId)) {
        try { studentObjId = new ObjectId(studentId); } catch {}
      }
      
      const searchParams = studentObjId ? { $or: [{ user_id: studentObjId }, { user_id: studentId }] } : { user_id: studentId };
      const assessmentRecord = await profileCollection.findOne(searchParams, { sort: { created_at: -1 } });
      if (assessmentRecord?.assessment_data) {
        studentProfile = assessmentRecord.assessment_data;
      }
    } catch {}

    let contextThread = [];
    try {
      const priorExchanges = await messageArchive.find({ conversation_id })
        .sort({ created_at: -1 })
        .limit(20)
        .toArray();
      
      contextThread = priorExchanges.reverse().map(exchange => ({
        role: exchange.is_bot ? 'assistant' : 'user',
        content: exchange.message
      }));
      
      if (contextThread.length > 0 && contextThread[contextThread.length - 1].content === studentQuery) {
        contextThread.pop();
      }
    } catch {}

    let processedPrompt = studentQuery;
    if (req.body?.user_context?.is_coach_mode) {
      const coachDirective = contextThread.length === 0 
        ? `[SYSTEM NOTE: Act strictly as a Socratic career coach. Ask me one question at a time to uncover my strengths. Do not list universities yet.]\n\nUser: ` 
        : `[SYSTEM NOTE: Continue acting strictly as a Socratic career coach. Uncover my strengths. Keep answers short.]\n\nUser: `;
      processedPrompt = coachDirective + studentQuery;
    }

    const aiPayload = {
      message: processedPrompt,
      conversation_id,
      university_name: university_name || null,
      chat_history: contextThread,
      user_context: {
        ...(req.body?.user_context || {}),
        user_id: studentId,
        preferred_university: university_name,
        assessment_data: studentProfile || req.body?.user_context?.assessment_data,
        conversation_history_length: contextThread.length
      }
    };

    const ragServiceCall = await axios.post(process.env.AI_SERVICE_URL || "http://localhost:8000/respond", aiPayload, {
      headers: { "Content-Type": "application/json", "x-user-id": studentId },
      timeout: 30000
    });

    const ragContent = ragServiceCall.data;
    
    let structuredResponse = ragContent.reply || "I'm here to help with Ghanaian university information.";
    if (!ragContent.reply || ragContent.reply.length < 10) {
      structuredResponse = `**University Information** 🎓\n\n${ragContent.reply || 'I apologize, I did not fully understand your question.'}\n\n**💡 Tip:** Try asking about specific universities like UG, KNUST, or UCC.`;
    }

    await messageArchive.insertOne({
      user_id: studentId,
      conversation_id,
      message: structuredResponse,
      is_bot: true,
      created_at: new Date(),
      timestamp: ragContent.timestamp || new Date().toISOString(),
      sources: ragContent.sources || [],
      confidence: ragContent.confidence || 0.0,
      rag_metadata: {
        source_count: ragContent.sources?.length || 0,
        processing_time: ragContent.processing_time,
        model_used: ragContent.model_used || 'hybrid-rag'
      }
    });

    const threadCollection = await getCollection('conversations');
    const totalExchanges = await messageArchive.countDocuments({ conversation_id });
    
    let dynamicTitle = null;
    if (totalExchanges === 2) {
      try {
        const { generateTitleWithFallback } = await import('../utils/llmTitleGenerator.js');
        const generatedHeader = await generateTitleWithFallback(studentQuery, structuredResponse, university_name, () => studentQuery.substring(0, 50).trim());
        dynamicTitle = generatedHeader.title;
      } catch {
        const cleanPrompt = studentQuery.trim();
        dynamicTitle = cleanPrompt.length > 50 ? cleanPrompt.substring(0, 50).trim() + '...' : cleanPrompt;
      }
    }
    
    const updateOperations = {
      last_message: structuredResponse.substring(0, 100),
      updated_at: new Date(),
      message_count: totalExchanges
    };
    if (dynamicTitle) updateOperations.title = dynamicTitle;
    
    await threadCollection.updateOne(
      { _id: conversation_id, user_id: studentId },
      { $set: updateOperations, $setOnInsert: { created_at: new Date(), user_id: studentId, title: 'New Conversation' } },
      { upsert: true }
    );

    res.json({
      success: true,
      message: structuredResponse,
      reply: structuredResponse,
      conversation_id,
      conversation_title: dynamicTitle,
      sources: ragContent.sources || [],
      confidence: ragContent.confidence || 0.0,
      timestamp: ragContent.timestamp || new Date().toISOString(),
      metadata: {
        university_context: university_name,
        response_type: ragContent.confidence > 0.85 ? 'local_knowledge' : 'hybrid_search',
        processing_info: ragContent.processing_info,
        message_count: totalExchanges
      }
    });

  } catch (error) {
    const errorFeedback = error.response?.status === 500 ? "Ei, the AI service dey down small. Please try again in a few minutes."
      : error.response?.status === 404 ? "I no fit find the information you dey look for. Please try a different question."
      : error.code === 'ECONNREFUSED' ? "The AI service no dey respond right now. Please try again later."
      : "I get some technical wahala right now. Please try again or contact support.";

    res.status(error.response?.status || 500).json({ 
      success: false,
      message: errorFeedback,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      conversation_id: req.body.conversation_id
    });
  }
};

export const sendDemoMessage = async (req, res) => {
  try {
    const { message: demoQuery, conversation_id } = req.body;
    if (!demoQuery || !conversation_id) {
      return res.status(400).json({ success: false, message: "Message and conversation_id are required" });
    }

    const aiEndpoint = process.env.AI_SERVICE_URL || "http://localhost:8000";
    
    try {
      const serviceResponse = await axios.post(`${aiEndpoint}/respond`, {
        message: demoQuery,
        conversation_id,
        user_context: { user_id: 'demo_user', demo_mode: true, timestamp: new Date().toISOString() }
      }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });

      res.json({
        success: true,
        reply: serviceResponse.data.reply || "I'm here to help with Ghanaian university information!",
        sources: serviceResponse.data.sources || [],
        confidence: serviceResponse.data.confidence || 0.5,
        processing_time: serviceResponse.data.processing_time || 0,
        demo_mode: true
      });
    } catch {
      res.json({
        success: true,
        reply: generateDemoFallbackResponse(demoQuery),
        sources: [{"source": "Local Knowledge", "type": "fallback"}],
        confidence: 0.3,
        demo_mode: true
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to process your message. Please try again.", demo_mode: true });
  }
};

const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const uploadHandler = multer({ 
  storage: storageConfig,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const isValidFormat = /jpeg|jpg|png|gif|pdf|doc|docx|txt|rtf/.test(path.extname(file.originalname).toLowerCase()) && 
                          /jpeg|jpg|png|gif|pdf|doc|docx|txt|rtf/.test(file.mimetype);
    if (isValidFormat) return cb(null, true);
    cb(new Error('Only images, PDFs, and documents are allowed!'));
  }
});

export const uploadMiddleware = uploadHandler.array('files', 5);

export const sendMessageWithFiles = async (req, res) => {
  try {
    const { message: studentCaption, conversation_id, university_name } = req.body;
    const studentId = req.user?.id || 'demo_user';
    const uploadedFiles = req.files || [];

    if (!studentCaption && uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: "Either message or files are required" });
    }

    const conversationArchive = await getCollection('chats');
    const messageArchive = await getCollection('messages');

    let threadIdentifier = conversation_id;
    if (/^[a-fA-F0-9]{24}$/.test(conversation_id)) {
      try { threadIdentifier = new ObjectId(conversation_id); } catch {}
    }

    const fileRecords = uploadedFiles.map(fileItem => ({
      originalName: fileItem.originalname,
      filename: fileItem.filename,
      mimetype: fileItem.mimetype,
      size: fileItem.size,
      path: fileItem.path
    }));

    let aggregatedMessage = studentCaption || '';
    if (uploadedFiles.length > 0) {
      const summary = uploadedFiles.map(f => `📎 ${f.originalname} (${(f.size/1024).toFixed(1)}KB)`).join('\n');
      aggregatedMessage = studentCaption ? `${studentCaption}\n\n${summary}` : summary;
    }

    await messageArchive.insertOne({
      user_id: studentId,
      conversation_id: threadIdentifier,
      message: aggregatedMessage,
      is_bot: false,
      created_at: new Date(),
      timestamp: new Date().toISOString(),
      attachments: fileRecords
    });

    const filePayload = {
      message: studentCaption || `User sent ${uploadedFiles.length} file(s)`,
      conversation_id,
      university_name: university_name || null,
      files: fileRecords,
      user_context: {
        user_id: studentId,
        preferred_university: university_name,
        has_attachments: uploadedFiles.length > 0,
        file_types: uploadedFiles.map(f => f.mimetype),
        conversation_history_length: await messageArchive.countDocuments({ conversation_id })
      }
    };

    const serviceInteraction = await axios.post(
      process.env.AI_SERVICE_URL || "http://localhost:8000/respond", 
      filePayload, 
      { headers: { "Content-Type": "application/json", "x-user-id": studentId }, timeout: 30000 }
    );

    const serviceResult = serviceInteraction.data;

    await messageArchive.insertOne({
      user_id: studentId,
      conversation_id: threadIdentifier,
      message: serviceResult.reply,
      is_bot: true,
      created_at: new Date(),
      timestamp: serviceResult.timestamp || new Date().toISOString(),
      sources: serviceResult.sources || [],
      confidence: serviceResult.confidence || 0.0,
      rag_metadata: {
        source_count: serviceResult.sources?.length || 0,
        processing_time: serviceResult.processing_time,
        model_used: serviceResult.model_used || 'hybrid-rag',
        processed_files: uploadedFiles.length
      }
    });

    await conversationArchive.updateOne(
      { user_id: studentId, conversation_id: threadIdentifier },
      {
        $set: {
          last_message: serviceResult.reply.substring(0, 100),
          last_updated: new Date(),
          message_count: await messageArchive.countDocuments({ conversation_id }),
          has_attachments: true
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: serviceResult.reply,
      reply: serviceResult.reply,
      conversation_id,
      sources: serviceResult.sources || [],
      confidence: serviceResult.confidence || 0.0,
      timestamp: serviceResult.timestamp || new Date().toISOString(),
      files_processed: uploadedFiles.length,
      metadata: {
        university_context: university_name,
        response_type: serviceResult.confidence > 0.85 ? 'local_knowledge' : 'hybrid_search',
        processing_info: serviceResult.processing_info,
        attachments: fileRecords
      }
    });

  } catch (error) {
    const feedbackMsg = error.response?.status === 500 ? "The AI service is having trouble processing your files. Please try again."
      : error.response?.status === 404 ? "I couldn't process the information in your files. Please try a different format."
      : error.code === 'ECONNREFUSED' ? "The AI service is not responding right now. Please try again later."
      : "There was an issue processing your files. Please try again or contact support.";

    res.status(error.response?.status || 500).json({ 
      success: false,
      message: feedbackMsg,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      conversation_id: req.body.conversation_id
    });
  }
};

export const getHistory = async (req, res) => {
  const { userId: studentId } = req.params;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid userId parameter' });
  }
  try {
    const threadCollection = await getCollection('messages');
    const aggregationPipeline = [
      { $match: { user_id: studentId } },
      { $sort: { conversation_id: 1, timestamp: 1 } },
      { $group: {
          _id: '$conversation_id',
          title: { $first: '$message' },
          last_active: { $max: '$timestamp' },
          message_count: { $sum: 1 }
      }},
      { $sort: { last_active: -1 } }
    ];
    
    const executionCursor = threadCollection.aggregate(aggregationPipeline);
    const historyManifest = [];
    for await (const threadItem of executionCursor) {
      historyManifest.push({
        conversation_id: threadItem._id?.toString ? threadItem._id.toString() : String(threadItem._id),
        title: (threadItem.title || 'Untitled conversation').slice(0, 120),
        last_active_date: threadItem.last_active instanceof Date ? threadItem.last_active.toISOString() : String(threadItem.last_active || ''),
        message_count: Number(threadItem.message_count || 0)
      });
    }
    return res.json({ success: true, history: historyManifest });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch conversation history' });
  }
};

export const getConversationDetails = async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid conversationId parameter' });
  }
  try {
    const detailsCollection = await getCollection('messages');
    let searchId = conversationId;
    if (/^[a-fA-F0-9]{24}$/.test(conversationId)) {
      try { searchId = new ObjectId(conversationId); } catch {}
    }
    
    const messageCursor = detailsCollection.find({ conversation_id: searchId }).sort({ timestamp: 1 });
    const compiledMessages = [];
    for await (const messageEntry of messageCursor) {
      const timeReference = messageEntry.timestamp instanceof Date ? messageEntry.timestamp.toISOString() : String(messageEntry.timestamp || '');
      if (messageEntry.message && messageEntry.is_bot === false) {
        compiledMessages.push({ role: 'user', content: messageEntry.message, timestamp: timeReference });
      } else if (messageEntry.message && messageEntry.is_bot === true) {
        compiledMessages.push({ role: 'assistant', content: messageEntry.message, timestamp: timeReference, meta: { confidence: messageEntry.confidence, sources: messageEntry.sources || [] } });
      }
    }
    return res.json({ success: true, conversation_id: conversationId, messages: compiledMessages });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch conversation thread' });
  }
};

function generateDemoFallbackResponse(message) {
  const normalizedQuery = message.toLowerCase();
  
  if (['hello', 'hi', 'hey'].some(greeting => normalizedQuery.includes(greeting))) {
    return `Hello! 👋 Welcome to CERKYL - your AI assistant for Ghanaian university admissions!\n\nI can help you with:\n🎓 University information (UG, KNUST, UCC, UDS, etc.)\n📚 Program details and requirements\n💰 Fees and costs\n📝 Application procedures\n📞 Contact information\n🎯 Scholarship opportunities\n\nWhat would you like to know about Ghanaian universities?`;
  }
  
  if (['university of ghana', 'ug', 'legon'].some(term => normalizedQuery.includes(term))) {
    return `**University of Ghana (Legon) 🎓**\n\n**Location:** Legon, Accra\n**Established:** 1948\n**Motto:** "Integri Procedamus" (Let us proceed with integrity)\n\n**🔥 Popular Programs:**\n• **Computer Science** - 4 years, GHS 8,500/year\n• **Medicine** - 6 years, GHS 15,000/year  \n• **Business Administration** - 4 years, GHS 6,500/year\n• **Law** - 4 years, GHS 7,500/year\n• **Engineering** - 4 years, GHS 10,000/year\n\n**📋 General Requirements:**\nWASSCE with 6 credits (A1-C6) including English & Mathematics\n\n**📞 Contact Info:**\n• Phone: +233-30-213-8501\n• Email: admissions@ug.edu.gh\n• Website: www.ug.edu.gh\n\n**📅 Application Deadline:** March 31st (next academic year)\n**💳 Application Fee:** GHS 200\n\nWould you like specific information about any program?`;
  }
  
  if (['knust', 'kumasi', 'kwame nkrumah'].some(term => normalizedQuery.includes(term))) {
    return `**KNUST - Kwame Nkrumah University of Science and Technology 🔧**\n\n**Location:** Kumasi, Ashanti Region\n**Established:** 1952\n**Motto:** "Technology for Development and Progress"\n\n**🔥 Popular Programs:**\n• **Computer Engineering** - 4 years, GHS 9,500/year\n• **Civil Engineering** - 4 years, GHS 12,000/year\n• **Medicine** - 6 years, GHS 18,000/year\n• **Architecture** - 5 years, GHS 10,000/year\n• **Mechanical Engineering** - 4 years, GHS 11,000/year\n\n**📋 Requirements:**\nWASSCE with strong Math & Science subjects (A1-C6)\n\n**📞 Contact Info:**\n• Phone: +233-32-206-0331\n• Email: admissions@knust.edu.gh\n• Website: www.knust.edu.gh\n\n**📅 Application Deadline:** April 15th\n**💳 Application Fee:** GHS 250\n\nKNUST is Ghana's premier technology university! What program interests you?`;
  }
  
  if (['fee', 'cost', 'money', 'tuition'].some(term => normalizedQuery.includes(term))) {
    return `**💰 University Fees in Ghana (2025/2026)**\n\n**🎓 University of Ghana:**\n• Arts/Business: GHS 7,000 - 8,500/year\n• Science: GHS 9,000 - 13,000/year\n• Medicine: GHS 16,000/year\n• Accommodation: GHS 2,800 - 4,200/year\n\n**🔧 KNUST:**\n• Engineering: GHS 10,000 - 13,000/year\n• Medicine: GHS 19,000/year\n• Architecture: GHS 11,000/year\n• Accommodation: GHS 3,800 - 5,500/year\n\n**🎓 UCC (Cape Coast):**\n• Education: GHS 6,000 - 8,500/year\n• Business: GHS 6,500 - 9,500/year\n• Accommodation: GHS 2,500 - 3,800/year\n\n**📝 Additional Costs:**\n• Application fees: GHS 200 - 300\n• Registration: GHS 500 - 800\n• Library/Lab fees: GHS 100 - 300\n\n**💡 Pro Tip:** Fees change annually. Always confirm current rates with university admissions offices!\n\nNeed info about a specific university or program?`;
  }
  
  return `**Welcome to CERKYL🎓**\n\nI'm here to help with Ghanaian university admissions. Here's what I can help you with:\n\n**🏫 Top Universities:**\n• University of Ghana (Legon)\n• KNUST (Kumasi)  \n• University of Cape Coast\n• University for Development Studies (Tamale)\n• UPSA (Accra)\n\n**📚 Information I Provide:**\n• Admission requirements\n• Program details & duration\n• Fees & costs\n• Application deadlines\n• Contact information\n• Scholarship opportunities\n\n**💬 Try asking:**\n• "Tell me about Computer Science at UG"\n• "What are KNUST engineering requirements?"\n• "How much are UCC fees?"\n• "When is the application deadline for UDS?"\n\nWhat would you like to know? I'm here to help! 😊`;
}
