import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;

if (!MONGODB_URI) {
  console.error('CRITICAL: MONGODB_URI environment variable not set');
  throw new Error('MONGODB_URI is required but not set in environment variables');
}

if (!DB_NAME) {
  console.error('CRITICAL: DB_NAME environment variable not set');
  throw new Error('DB_NAME is required but not set in environment variables');
}

let client = null;
let db = null;

export const connectDB = async () => {
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      db = client.db(DB_NAME);
      console.log('Connected to MongoDB Atlas');
    }
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

export const getDB = async () => {
  if (!db) {
    try {
      await connectDB();
    } catch (error) {
      console.error('Database connection pending:', error.message);
      return null;
    }
  }
  return db;
};

export const closeDB = async () => {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
};

export const getCollection = async (collectionName) => {
  try {
    const database = await getDB();
    if (!database) {
      return null;
    }
    return database.collection(collectionName);
  } catch (error) {
    console.error(`Error getting collection ${collectionName}:`, error.message);
    return null;
  }
};

export const getClient = async () => {
  if (!client) {
    try {
      await connectDB();
    } catch (error) {
      console.error('Database connection pending:', error.message);
      return null;
    }
  }
  return client;
};

export default { connectDB, getDB, closeDB, getCollection, getClient };