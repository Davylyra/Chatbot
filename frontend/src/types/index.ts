// User and Authentication Types
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  avatar?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  conversationId?: string;
}

export interface SendMessageRequest {
  message: string;
  conversationId?: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
  conversationId: string;
}

// Forms Types
export interface UniversityForm {
  id: string;
  universityName: string;
  fullName: string;
  formPrice: number | string; // Support both for backward compatibility
  buyPrice?: string; // Optional for backward compatibility
  currency?: string;
  deadline: string;
  isAvailable: boolean;
  logo?: string;
  status?: 'available' | 'expired' | 'not_yet_open' | 'sold_out';
  daysUntilDeadline?: number;
  lastUpdated?: string;
}

export interface PurchaseFormRequest {
  formId: string;
  paymentMethod: 'mtn' | 'airtel' | 'telecel';
  phoneNumber: string;
}

export interface PurchaseFormResponse {
  transactionId: string;
  paymentUrl: string;
  status: 'pending' | 'completed' | 'failed';
}

// Transaction Types
export interface Transaction {
  id: string;
  universityName: string;
  fullName: string;
  type: string;
  date: string;
  time: string;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: string;
  amount: string;
  logo?: string;
}

// Unified Notification Types
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'payment' | 'application';
  category:
    | 'general'
    | 'payment'
    | 'application'
    | 'deadline'
    | 'scholarship'
    | 'admission_update'
    | 'form';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  timestamp: string; // ISO date string
  createdAt: Date;
  isRead: boolean;

  // Optional fields
  actionUrl?: string;
  link?: string;
  linkText?: string;
  metadata?: any;

  // Read/deletion tracking
  readAt?: Date;
  scheduledDeletionAt?: Date;

  // Real-time flags
  isRealTime?: boolean;

  firstAccessedAt?: Date;
  readMessageAccessibleUntil?: Date;
  readMessageAvailable?: boolean;

  // Source information
  source?: {
    type: string;
    url: string;
    confidence: string;
    verified: boolean;
  };
  university?: string;

  readNowUrl?: string;
  readNowExpiresAt?: Date | null;
  readNowActive?: boolean;
  fetchedAt?: Date;
  expiresAt?: Date | null;
  timeRemaining?: number;
}

export type NotificationData = Notification;

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: 'en' | 'tw' | 'ga' | 'ew';
  pushNotifications: boolean;
  emailUpdates: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}
