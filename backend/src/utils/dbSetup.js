/*
 Ensures all collections are created and receiving data properly
 */

import { getDatabase, getCollection } from '../config/db.js';

const REQUIRED_COLLECTIONS = {
    'chats': 'Store individual chat messages between users and AI',
    'users': 'Store user account information and authentication data',
    'conversations': 'Store chat session metadata and conversation context',
    'rag_logs': 'Store AI processing logs and analytics for monitoring',
    'forms': 'Store form submissions and university applications',
    'payments': 'Store Paystack payment transactions and status',
    'universities': 'Store comprehensive university information and programs',
    'sessions': 'Store user authentication sessions and tokens',
    'signup_verifications': 'Store temporary signup verification codes (auto-expires after 10 minutes)'
};

async function createCollectionsAndVerifyData() {
    console.log(' Setting up CERKYL Database Collections...\n');
    
    try {
        const db = await getDatabase();
        console.log('Connected to MongoDB Atlas');
        
        const existingCollections = await db.listCollections().toArray();
        const existingNames = existingCollections.map(col => col.name);
        console.log(' Existing collections:', existingNames);
        
        console.log('\nCreating/Verifying Required Collections:');
        for (const [collectionName, purpose] of Object.entries(REQUIRED_COLLECTIONS)) {
            try {
                if (!existingNames.includes(collectionName)) {
                    await db.createCollection(collectionName);
                    console.log(`Created: ${collectionName} - ${purpose}`);
                } else {
                    console.log(`✓ Exists: ${collectionName} - ${purpose}`);
                }
            } catch (error) {
                console.log(` Issue with ${collectionName}: ${error.message}`);
            }
        }
        
        console.log('\n Creating Performance Indexes...');
        await createIndexes(db);
        
        console.log('\n Testing Data Insertion...');
        await testDataInsertion(db);
        
        console.log('\nVerifying Collection Data Capability...');
        await verifyCollections(db);
        
        console.log('\n Cleaning up test data...');
        await cleanupTestData(db);
        
        console.log('\n Database setup completed successfully!');
        
    } catch (error) {
        console.error(' Database setup error:', error);
        throw error;
    }
}

async function createIndexes(db) {
    try {
        // Chats collection 
        await db.collection('chats').createIndex({ "user_id": 1, "conversation_id": 1 });
        await db.collection('chats').createIndex({ "created_at": -1 });
        await db.collection('chats').createIndex({ "is_bot": 1 });
        console.log(' Chats indexes created');
        
        // Users collection 
        try {
            await db.collection('users').createIndex({ "email": 1 }, { unique: true });
        } catch (e) {
            console.log('  (Email index already exists)');
        }
        await db.collection('users').createIndex({ "verified": 1 });
        await db.collection('users').createIndex({ "created_at": -1 });
        console.log(' Users indexes created');
        
        // Conversations collection 
        await db.collection('conversations').createIndex({ "user_id": 1 });
        await db.collection('conversations').createIndex({ "updated_at": -1 });
        await db.collection('conversations').createIndex({ "is_active": 1 });
        console.log(' Conversations indexes created');
        
        // RAG logs collection 
        await db.collection('rag_logs').createIndex({ "timestamp": -1 });
        await db.collection('rag_logs').createIndex({ "confidence": -1 });
        await db.collection('rag_logs').createIndex({ "conversation_id": 1 });
        console.log(' RAG logs indexes created');
        
        // Payments collection 
        await db.collection('payments').createIndex({ "user_id": 1 });
        await db.collection('payments').createIndex({ "status": 1 });
        try {
            await db.collection('payments').createIndex({ "transaction_id": 1 }, { unique: true });
        } catch (e) {
            console.log('  (Transaction ID index already exists)');
        }
        console.log(' Payments indexes created');
        
        // Sessions collection 
        await db.collection('sessions').createIndex({ "user_id": 1 });
        await db.collection('sessions').createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 });
        console.log(' Sessions indexes created');
        
        try {
            await db.collection('signup_verifications').createIndex({ "email": 1 }, { unique: true });
        } catch (e) {
            console.log('  (Email index already exists)');
        }
        await db.collection('signup_verifications').createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 });
        console.log(' Signup verifications indexes created');
        
    } catch (error) {
        console.error(' Index creation error:', error.message);
    }
}

async function testDataInsertion(db) {
    const testData = {
        users: {
            email: 'test@glinax.com',
            password: 'hashedpassword123',
            name: 'Test User',
            verified: true,
            created_at: new Date(),
            test_record: true
        },
        
        chats: {
            user_id: 'test_user_id',
            conversation_id: 'test_conversation',
            message: 'What are UG Computer Science fees?',
            is_bot: false,
            created_at: new Date(),
            timestamp: new Date().toISOString(),
            test_record: true
        },
        
        // Test rag_logs collection
        rag_logs: {
            query: 'Test query for database setup',
            response: 'Test response generated successfully',
            confidence: 0.95,
            sources: [{ source: 'test', type: 'setup' }],
            processing_time: 1.2,
            timestamp: new Date(),
            conversation_id: 'test_setup',
            model_used: 'setup_verification',
            test_record: true
        },
        
        universities: {
            name: 'University of Ghana',
            short_name: 'UG',
            location: 'Legon, Accra',
            established: 1948,
            programs: ['Computer Science', 'Medicine', 'Business'],
            contact: {
                phone: '+233-30-213-8501',
                email: 'admissions@ug.edu.gh'
            },
            updated_at: new Date(),
            test_record: true
        }
    };
    
    for (const [collectionName, testDoc] of Object.entries(testData)) {
        try {
            const result = await db.collection(collectionName).insertOne(testDoc);
            console.log(` ${collectionName}: Test data inserted (ID: ${result.insertedId.toString().substring(0,8)}...)`);
        } catch (error) {
            console.log(` ${collectionName}: Failed to insert test data - ${error.message}`);
        }
    }
}

async function verifyCollections(db) {
    console.log('Collection Status Report:');
    
    for (const collectionName of Object.keys(REQUIRED_COLLECTIONS)) {
        try {
            const count = await db.collection(collectionName).countDocuments();
            const indexes = await db.collection(collectionName).indexes();
            console.log(`   ${collectionName}: ${count} documents, ${indexes.length} indexes`);
        } catch (error) {
            console.log(`   ${collectionName}: Error - ${error.message}`);
        }
    }
}

async function cleanupTestData(db) {
    for (const collectionName of Object.keys(REQUIRED_COLLECTIONS)) {
        try {
            const result = await db.collection(collectionName).deleteMany({ test_record: true });
            if (result.deletedCount > 0) {
                console.log(`🧹 Cleaned ${result.deletedCount} test records from ${collectionName}`);
            }
        } catch (error) {
            console.log(` Cleanup error in ${collectionName}: ${error.message}`);
        }
    }
}

async function ensureDataFlow() {
    console.log('\nEnsuring Real Data Flow...');
    
    try {
        const db = await getDatabase();
        
        
        // 1. Add Ghana universities to the database
        const universitiesData = [
            {
                name: 'University of Ghana',
                short_name: 'UG',
                location: 'Legon, Accra',
                established: 1948,
                motto: 'Integri Procedamus',
                programs: {
                    'Computer Science': {
                        duration: '4 years',
                        requirements: 'WASSCE: Credits in English, Math, Physics, Elective Math + 2 subjects',
                        fees_2026: 'GHS 8,500 per year',
                        career_prospects: 'Software Developer, Data Scientist, IT Consultant'
                    }
                },
                contact: {
                    phone: '+233-30-213-8501',
                    email: 'admissions@ug.edu.gh',
                    address: 'University of Ghana, P.O. Box LG 25, Legon-Accra'
                },
                website: 'www.ug.edu.gh',
                updated_at: new Date(),
                data_source: 'glinax_setup'
            },
            {
                name: 'Kwame Nkrumah University of Science and Technology',
                short_name: 'KNUST',
                location: 'Kumasi, Ashanti Region',
                established: 1952,
                motto: 'Technology for Development and Progress',
                programs: {
                    'Computer Engineering': {
                        duration: '4 years',
                        requirements: 'WASSCE: A1-C6 in Math, Physics, Chemistry, English',
                        fees_2026: 'GHS 9,500 per year',
                        career_prospects: 'Software Engineer, Systems Analyst, Tech Lead'
                    }
                },
                contact: {
                    phone: '+233-32-206-0331',
                    email: 'admissions@knust.edu.gh',
                    address: 'KNUST, PMB, University Post Office, Kumasi'
                },
                website: 'www.knust.edu.gh',
                updated_at: new Date(),
                data_source: 'glinax_setup'
            }
        ];
        
        for (const uni of universitiesData) {
            await db.collection('universities').replaceOne(
                { short_name: uni.short_name },
                uni,
                { upsert: true }
            );
        }
        console.log(' University data inserted/updated');
        
        // 2. Create a sample conversation to test the flow
        const sampleConversation = {
            user_id: 'system_demo',
            title: 'System Setup Verification',
            university_context: 'University of Ghana',
            created_at: new Date(),
            updated_at: new Date(),
            message_count: 0,
            is_active: true,
            data_source: 'glinax_setup'
        };
        
        await db.collection('conversations').insertOne(sampleConversation);
        console.log(' Sample conversation created');
        
        console.log(' Real data flow established successfully!');
        
    } catch (error) {
        console.error(' Data flow setup error:', error);
    }
}

export {
    createCollectionsAndVerifyData,
    ensureDataFlow,
    REQUIRED_COLLECTIONS
};