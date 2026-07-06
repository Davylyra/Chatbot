
import { getCollection, connectDB, closeDB } from '../config/db.js';

async function createIndexes() {
  try {
    console.log(' Starting index creation...');
    
    await connectDB();
    
    
    // CONVERSATIONS COLLECTION INDEXES
    
    console.log('\n Creating indexes for conversations collection...');
    const conversationsCollection = await getCollection('conversations');
    
    await conversationsCollection.createIndex(
      { user_id: 1, updated_at: -1 },
      { name: 'user_conversations_by_updated' }
    );
    console.log(' Created index: user_conversations_by_updated');
    
    await conversationsCollection.createIndex(
      { _id: 1, user_id: 1 },
      { name: 'conversation_by_id_and_user' }
    );
    console.log(' Created index: conversation_by_id_and_user');
    
    await conversationsCollection.createIndex(
      { user_id: 1, created_at: -1 },
      { name: 'user_conversations_by_created' }
    );
    console.log(' Created index: user_conversations_by_created');
    
    
    // MESSAGES COLLECTION INDEXES
    console.log('\nCreating indexes for messages collection...');
    const messagesCollection = await getCollection('messages');
    
    await messagesCollection.createIndex(
      { conversation_id: 1, user_id: 1, sequence: 1, created_at: 1 },
      { name: 'conversation_messages_sorted' }
    );
    console.log(' Created index: conversation_messages_sorted');
    
    await messagesCollection.createIndex(
      { conversation_id: 1, is_bot: 1, created_at: 1 },
      { name: 'message_deduplication' }
    );
    console.log(' Created index: message_deduplication');
    
    await messagesCollection.createIndex(
      { conversation_id: 1, user_id: 1 },
      { name: 'conversation_message_count' }
    );
    console.log(' Created index: conversation_message_count');
    
    // NOTIFICATIONS COLLECTION INDEXES
    console.log('\nCreating indexes for notifications collection...');
    const notificationsCollection = await getCollection('notifications');
    
    await notificationsCollection.createIndex(
      { userId: 1, isRead: 1, fetchedAt: -1, createdAt: -1 },
      { name: 'user_notifications_sorted' }
    );
    console.log(' Created index: user_notifications_sorted');
    
    await notificationsCollection.createIndex(
      { expiresAt: 1 },
      { name: 'notification_expiration', expireAfterSeconds: 0 }
    );
    console.log(' Created index: notification_expiration (TTL)');
    
    await notificationsCollection.createIndex(
      { scheduledDeletionAt: 1 },
      { name: 'notification_scheduled_deletion' }
    );
    console.log(' Created index: notification_scheduled_deletion');
    
    await notificationsCollection.createIndex(
      { userId: 1, isRead: 1, expiresAt: 1 },
      { name: 'unread_count_query' }
    );
    console.log(' Created index: unread_count_query');
    
    // DUPLICATE PREVENTION: Unique compound index for admission notifications
    await notificationsCollection.createIndex(
      { userId: 1, title: 1, 'metadata.universityCode': 1 },
      { 
        name: 'unique_user_notification_university',
        partialFilterExpression: { 
          'metadata.universityCode': { $exists: true },
          category: 'admission_update'
        }
      }
    );
    console.log(' Created index: unique_user_notification_university (duplicate prevention)');
    
    // DISPLAY ALL INDEXES
    console.log('\n Verifying indexes...');
    
    const convIndexes = await conversationsCollection.indexes();
    console.log('\n Conversations indexes:', convIndexes.map(idx => idx.name).join(', '));
    
    const msgIndexes = await messagesCollection.indexes();
    console.log('Messages indexes:', msgIndexes.map(idx => idx.name).join(', '));
    
    const notifIndexes = await notificationsCollection.indexes();
    console.log('Notifications indexes:', notifIndexes.map(idx => idx.name).join(', '));
    
    console.log('\n All indexes created successfully!');
    console.log(' Database performance should be significantly improved.');
    
  } catch (error) {
    console.error(' Error creating indexes:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createIndexes()
    .then(() => {
      console.log('\n Index creation completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n Index creation failed:', error);
      process.exit(1);
    });
}

export default createIndexes;
