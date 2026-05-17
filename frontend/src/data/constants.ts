/**
 * Constants and Mock Data
 * Description: Centralized location for all mock data and constants
 * Integration: Replace with real data from backend APIs
 */

export const UNIVERSITIES_DATA = [
  {
    id: "1",
    universityName: "KNUST",
    fullName: "Kwame Nkrumah University of Science & Technology",
    location: "Kumasi, Ashanti Region",
    established: 1952,
    studentCount: "50,000+",
    type: "public",
    programs: ["Engineering", "Medicine", "Agriculture", "Business", "Science"],
    logo: "/university-logos/knust-logo.png",
    formPrice: "₵290",
    buyPrice: "₵290",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Ghana's premier science and technology university"
  },
  {
    id: "2",
    universityName: "UG",
    fullName: "University of Ghana",
    location: "Legon, Greater Accra",
    established: 1948,
    studentCount: "40,000+",
    type: "public",
    programs: ["Arts", "Social Sciences", "Business", "Medicine", "Law"],
    logo: "/university-logos/ug-logo.png",
    formPrice: "₵240",
    buyPrice: "₵240",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Ghana's oldest and most prestigious university"
  },
  {
    id: "3",
    universityName: "UCC",
    fullName: "University of Cape Coast",
    location: "Cape Coast, Central Region",
    established: 1962,
    studentCount: "25,000+",
    type: "public",
    programs: ["Education", "Arts", "Science", "Business", "Agriculture"],
    logo: "/university-logos/ucc-logo.png",
    formPrice: "₵220",
    buyPrice: "₵220",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Leading university in education and research"
  },
  {
    id: "4",
    universityName: "UDS",
    fullName: "University for Development Studies",
    location: "Tamale, Northern Region",
    established: 1992,
    studentCount: "15,000+",
    type: "public",
    programs: ["Development Studies", "Agriculture", "Medicine", "Education"],
    logo: "/university-logos/uds-logo.jpg",
    formPrice: "₵200",
    buyPrice: "₵200",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Focus on development and community engagement"
  },
  {
    id: "5",
    universityName: "UENR",
    fullName: "University of Energy and Natural Resources",
    location: "Sunyani, Brong-Ahafo Region",
    established: 2011,
    studentCount: "8,000+",
    type: "public",
    programs: ["Energy", "Natural Resources", "Engineering", "Agriculture"],
    logo: "/university-logos/uenr-logo.png",
    formPrice: "₵180",
    buyPrice: "₵180",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Specialized in energy and natural resources"
  },
  {
    id: "6",
    universityName: "UEW",
    fullName: "University of Education, Winneba",
    location: "Winneba, Central Region",
    established: 1992,
    studentCount: "30,000+",
    type: "public",
    programs: ["Education", "Arts", "Science", "Business", "Agriculture"],
    logo: "/university-logos/uew-logo.png",
    formPrice: "₵210",
    buyPrice: "₵210",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Premier teacher education institution"
  },
  {
    id: "7",
    universityName: "UMaT",
    fullName: "University of Mines and Technology",
    location: "Tarkwa, Western Region",
    established: 2004,
    studentCount: "6,000+",
    type: "public",
    programs: ["Mining Engineering", "Geological Engineering", "Environmental Engineering", "Computer Science"],
    logo: "/university-logos/umat-logo.jpg",
    formPrice: "₵190",
    buyPrice: "₵190",
    deadline: "2026-12-31",
    isAvailable: true,
    description: "Specialized in mining and technology"
  },
  {
    id: "8",
    universityName: "UHAS",
    fullName: "University of Health and Allied Sciences",
    location: "Ho, Volta Region",
    established: 2011,
    studentCount: "4,000+",
    type: "public",
    programs: ["Medicine", "Nursing", "Public Health", "Allied Health Sciences"],
    logo: "/university-logos/uhas-logo.png",
    formPrice: "₵230",
    buyPrice: "₵230",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Leading health sciences university"
  },
  {
    id: "9",
    universityName: "GCTU",
    fullName: "Ghana Communication Technology University",
    location: "Accra, Greater Accra",
    established: 2005,
    studentCount: "8,000+",
    type: "public",
    programs: ["ICT", "Communication Studies", "Business", "Engineering"],
    logo: "/university-logos/gctu-logo.png",
    formPrice: "₵220",
    buyPrice: "₵220",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Specialized in communication and technology"
  },
  {
    id: "10",
    universityName: "TTU",
    fullName: "Takoradi Technical University",
    location: "Takoradi, Western Region",
    established: 1954,
    studentCount: "12,000+",
    type: "public",
    programs: ["Engineering", "Built Environment", "Applied Sciences", "Business"],
    logo: "/university-logos/ttu-logo.jpg",
    formPrice: "₵170",
    buyPrice: "₵170",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Technical education and applied sciences"
  },
  {
    id: "11",
    universityName: "UPSA",
    fullName: "University of Professional Studies, Accra",
    location: "Accra, Greater Accra",
    established: 1965,
    studentCount: "20,000+",
    type: "public",
    programs: ["Business", "Accounting", "Finance", "Marketing", "Management"],
    logo: "/university-logos/upsa-logo.jpg",
    formPrice: "₵220",
    buyPrice: "₵220",
    deadline: "2025-12-31",
    isAvailable: true,
    description: "Leading professional studies and business education"
  }
];

export const ASSESSMENT_QUESTIONS = [
  {
    id: "shsProgram",
    question: "What program did you study?",
    type: "single" as const,
    options: [
      "General Science",
      "General Arts",
      "Business (Accounting/Management)",
      "Visual Arts",
      "Home Economics",
      "Agricultural Science",
      "Technical (Engineering Science)",
      "Technical (Building & Construction)",
      "Technical (Applied Electricity/Electronics)",
      "Technical (Woodwork/Metalwork)",
      "Hospitality & Tourism"
    ]
  },
  {
    id: "bestSubject",
    question: "What are your best subjects? (Select all that apply)",
    type: "multiple" as const,
    options: [
      "Mathematics",
      "English Language",
      "Science (Physics, Chemistry, Biology)",
      "Social Studies",
      "ICT/Computer Science",
      "Business Studies",
      "Art & Design",
      "French",
      "Economics",
      "Geography",
      "History",
      "Religious Studies"
    ]
  },
  {
    id: "wassceGrade",
    question: "What grade did you get in WASSCE?",
    type: "text" as const,
    placeholder: "e.g., Aggregate 12, or list your grades (A1, B2, C6, etc.)"
  },
  {
    id: "interests",
    question: "What career fields interest you most? (Select up to 3)",
    type: "multiple" as const,
    options: [
      "Engineering & Technology",
      "Medicine & Health Sciences",
      "Business & Finance",
      "Education & Teaching",
      "Law & Legal Studies",
      "Agriculture & Environmental Science",
      "Arts & Humanities",
      "Computer Science & IT",
      "Architecture & Design",
      "Communication & Media",
      "Social Work & Psychology",
      "Sports & Physical Education"
    ]
  },
  {
    id: "careerGoals",
    question: "What are your main career goals?",
    type: "text" as const,
    placeholder: "e.g., I want to become a software engineer and work in tech industry"
  },
  {
    id: "preferredLocation",
    question: "Where would you prefer to study?",
    type: "single" as const,
    options: [
      "Greater Accra Region",
      "Ashanti Region (Kumasi)",
      "Central Region",
      "Western Region",
      "Northern Region",
      "Volta Region",
      "Eastern Region",
      "Bono Region",
      "No preference"
    ]
  },
];

export const PAYMENT_METHODS = [
  { 
    name: "MTN Mobile Money", 
    color: "bg-yellow-500",
    code: "MTN",
    description: "Pay with MTN Mobile Money"
  },
  { 
    name: "Vodafone Cash", 
    color: "bg-red-500",
    code: "VODAFONE",
    description: "Pay with Vodafone Cash"
  },
  { 
    name: "AirtelTigo Money", 
    color: "bg-blue-500",
    code: "AIRTELTIGO",
    description: "Pay with AirtelTigo Money"
  }
];

// Comprehensive FAQ Data Structure for Ghanaian University Applicants
export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: FAQItem[] = [
  {
    id: "faq-apply",
    question: "How do I apply for university admission?",
    answer:"Applying for university admission in Ghana involves obtaining a voucher from the university’s portal or designated outlets, then creating an account on the admissions portal with the voucher details. You complete the application form with personal information, academic records, programme choices, and upload required documents such as WASSCE results, birth certificate, passport photos, and ID. Some programmes may demand extra documents, exams, or interviews. After paying the processing fee via mobile money, bank transfer, or online platforms, you submit the application and receive a reference number to track your status. It’s best to apply early, especially for competitive courses, and always check specific programme requirements."  },
  {
    id: "faq-requirements",
    question: "What are the admission requirements?",
    answer:"Admission requirements for Ghanaian universities differ by institution and programme. For undergraduate study, applicants generally need a Senior High School Certificate (WASSCE, GBCE, SSSCE, or equivalent) with at least six credits including English and Mathematics. Science programmes like Medicine, Pharmacy, and Engineering require credits in subjects such as Physics, Chemistry, Biology, and Elective Mathematics, while Business programmes emphasize Mathematics, Economics, and Business-related subjects. Arts and Humanities often require credits in languages, Literature, History, or Government. Competitive courses, especially Medicine, demand higher grades (aggregate below 12). Technical and vocational programmes may accept NVTI or City and Guilds qualifications. Postgraduate applicants need at least a Second Class Lower Bachelor’s degree, while mature applicants (25+) may qualify through work experience and exams. International students must present equivalent qualifications and may need English proficiency tests (TOEFL/IELTS). Some universities also conduct aptitude or entrance exams. Always check the specific university’s prospectus for updated requirements."  },
  {
    id: "faq-payment",
    question: "How do I pay for application forms?",
    answer:"Payment for university application forms in Ghana can be made through mobile money, bank deposits, online card payments, or physical vouchers. Mobile money is the most common option, using services like MTN, Vodafone, or AirtelTigo. Applicants can also pay at designated banks and keep the deposit slip as proof. Some universities accept Visa or Mastercard payments through secure online gateways. Alternatively, vouchers with unique serial numbers and PINs can be purchased from accredited outlets such as banks, educational centers, or campus bookshops. Fees typically range from GHS 150–300 for undergraduate programmes and GHS 200–500 for postgraduate programmes. After payment, applicants should securely keep their transaction reference, receipt, or voucher details for verification. Since fees are non-refundable, it’s important to confirm eligibility before making payment and contact the admissions office promptly if any issues arise."  },
  {
    id: "faq-deadlines",
    question: "When are application deadlines?",
    answer:"Application deadlines for Ghanaian universities differ by institution, programme, and academic year. Public universities usually open applications between March and May for the next academic year starting in August or September, with most deadlines falling between October and December. Competitive programmes like Medicine, Pharmacy, Nursing, Law, and Engineering often close earlier, around September or October. Private universities may have multiple intakes in January, May, and September. Postgraduate deadlines vary depending on the intake system, with many opening between November and March. Some universities use rolling admissions until programmes are filled, while others set fixed deadlines. Applicants are advised to apply at least a month before the deadline to avoid issues, as late applications may attract extra fees. Always check the specific university’s website or admissions portal for updated deadlines and consider setting reminders to manage multiple applications efficiently."  },
  {
    id: "faq-track",
    question: "How do I track my application status?",
    answer: "Tracking your university application status in Ghana is done mainly through online portals.After submission, you receive a unique reference number or application ID, which is used to log in and check updates.On the admissions portal, you can view statuses such as Received,Under Review, Pending Documentation, Shortlisted, Admitted, or Not Successful.Some universities provide detailed progress updates, including document checks and evaluations.Updates are also sent via SMS or email, so ensure your contact details are correct and monitored.For programmes with entrance exams or interviews, schedules and requirements are posted on the portal.If admitted, you can download your admission letter with details on fees, registration, and required documents.Universities also publish admission lists online and on notice boards. If your status doesn’t change or you face technical issues, contact the admissions office with your reference number.Keep all documents and receipts organized, and check your status regularly, especially during peak admission periods between July and September."
  }
];

// Help and support sections - Updated to reference comprehensive FAQs
export const HELP_SECTIONS = [
  {
    title: "Frequently Asked Questions",
    items: [
      "How do I apply for university admission?",
      "What are the admission requirements?",
      "How do I pay for application forms?",
      "When are application deadlines?",
      "How do I track my application status?"
    ]
  },
  {
    title: "Contact Support",
    items: [
      "Live Chat Support",
      "Email Support", 
      "Phone Support",
      "WhatsApp Support"
    ]
  }
];

export const MOCK_TRANSACTIONS = [
  {
    id: "1",
    universityName: "KNUST",
    fullName: "Kwame Nkrumah University of Science & Technology",
    type: "purchase",
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleDateString(),
    time: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleTimeString(),
    status: "completed" as const,
    paymentMethod: "MTN Mobile Money",
    amount: "₵290",
    currency: "₵",
    reference: "TXN001"
  },
  {
    id: "2",
    universityName: "UG",
    fullName: "University of Ghana",
    type: "purchase",
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(),
    time: new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleTimeString(),
    status: "pending" as const,
    paymentMethod: "Vodafone Cash",
    amount: "₵240",
    currency: "₵",
    reference: "TXN002"
  },
  {
    id: "3",
    universityName: "UCC",
    fullName: "University of Cape Coast",
    type: "refund",
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleTimeString(),
    status: "completed" as const,
    paymentMethod: "AirtelTigo Money",
    amount: "₵220",
    currency: "₵",
    reference: "TXN003"
  }
];

export const MOCK_RECENT_CHATS = [
  {
    id: "1",
    title: "KNUST Engineering Programs",
    lastMessage: "What are the requirements for Computer Engineering?",
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    messageCount: 5,
    universityContext: "KNUST",
    unreadCount: 0
  },
  {
    id: "2",
    title: "UG Business School",
    lastMessage: "Tell me about the MBA program",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    messageCount: 8,
    universityContext: "UG",
    unreadCount: 2
  },
  {
    id: "3",
    title: "General University Guidance",
    lastMessage: "How do I choose the right university?",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    messageCount: 12,
    universityContext: undefined,
    unreadCount: 0
  }
];

// App configuration constants - Now managed by configService
// These are fallback values only, actual values come from dynamic configuration
export const APP_CONFIG = {
  name: "Glinax Chatbot", // Will be replaced by configService.getConfig('app.name')
  version: "1.0.0", // Will be replaced by configService.getConfig('app.version')
  description: "AI-powered university admission assistant for Ghana", // Will be replaced by configService.getConfig('app.description')
  supportEmail: "support@glinax.com", // Will be replaced by configService.getConfig('contact.support_email')
  supportPhone: "+233 123 456 789", // Will be replaced by configService.getConfig('contact.support_phone')
  website: "https://glinax.com", // Will be replaced by configService.getConfig('contact.website')
  socialMedia: {
    twitter: "@glinax_gh", // Will be replaced by configService.getConfig('social.twitter')
    facebook: "Glinax Ghana", // Will be replaced by configService.getConfig('social.facebook')
    instagram: "@glinax_gh" // Will be replaced by configService.getConfig('social.instagram')
  }
};

// Theme configuration - Now managed by configService
// These are fallback values only, actual values come from dynamic configuration
export const THEME_CONFIG = {
  primaryColor: "#3b82f6", // Will be replaced by configService.getConfig('ui.primary_color')
  secondaryColor: "#10b981", // Will be replaced by configService.getConfig('ui.secondary_color')
  accentColor: "#f59e0b", // Will be replaced by configService.getConfig('ui.accent_color')
  errorColor: "#ef4444", // Will be replaced by configService.getConfig('ui.error_color')
  successColor: "#10b981", // Will be replaced by configService.getConfig('ui.success_color')
  warningColor: "#f59e0b", // Will be replaced by configService.getConfig('ui.warning_color')
  infoColor: "#3b82f6" // Will be replaced by configService.getConfig('ui.info_color')
};

// API endpoints configuration - Now managed by configService
// These are fallback values only, actual values come from dynamic configuration
export const API_ENDPOINTS = {
  auth: {
    register: "/auth/register", // Will be replaced by dynamic config
    login: "/auth/login", // Will be replaced by dynamic config
    logout: "/auth/logout", // Will be replaced by dynamic config
    refresh: "/auth/refresh", // Will be replaced by dynamic config
    profile: "/auth/profile" // Will be replaced by dynamic config
  },
  chat: {
    sendMessage: "/chat/message", // Will be replaced by dynamic config
    conversations: "/chat/conversations", // Will be replaced by dynamic config
    deleteConversation: "/chat/conversations" // Will be replaced by dynamic config
  },
  forms: {
    list: "/forms", // Will be replaced by dynamic config
    purchase: "/forms/purchase", // Will be replaced by dynamic config
    userForms: "/forms/user" // Will be replaced by dynamic config
  },
  universities: {
    list: "/universities", // Will be replaced by dynamic config
    search: "/universities/search", // Will be replaced by dynamic config
    details: "/universities" // Will be replaced by dynamic config
  },
  assessment: {
    submit: "/assessment/submit", // Will be replaced by dynamic config
    results: "/assessment/results", // Will be replaced by dynamic config
    recommendations: "/assessment/recommendations" // Will be replaced by dynamic config
  },
  payments: {
    process: "/payments/process", // Will be replaced by dynamic config
    history: "/payments/history" // Will be replaced by dynamic config
  },
  notifications: {
    list: "/notifications", // Will be replaced by dynamic config
    markAsRead: "/notifications/read", // Will be replaced by dynamic config
    markAllAsRead: "/notifications/read-all" // Will be replaced by dynamic config
  }
};

// Form validation rules
export const VALIDATION_RULES = {
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: "Please enter a valid email address"
  },
  password: {
    required: true,
    minLength: 8,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    message: "Password must be at least 8 characters with uppercase, lowercase, and number"
  },
  phone: {
    required: true,
    pattern: /^(\+233|0)[0-9]{9}$/,
    message: "Please enter a valid Ghanaian phone number"
  },
  name: {
    required: true,
    minLength: 2,
    message: "Name must be at least 2 characters long"
  }
};

// Local storage keys
export const STORAGE_KEYS = {
  authToken: "glinax_auth_token",
  refreshToken: "glinax_refresh_token",
  userProfile: "glinax_user_profile",
  theme: "glinax_theme",
  language: "glinax_language",
  onboarding: "glinax_onboarding_complete"
};

// Error messages
export const ERROR_MESSAGES = {
  network: "Network error. Please check your connection and try again.",
  unauthorized: "You are not authorized to perform this action.",
  forbidden: "Access denied. Please contact support.",
  notFound: "The requested resource was not found.",
  serverError: "Server error. Please try again later.",
  validation: "Please check your input and try again.",
  timeout: "Request timed out. Please try again.",
  unknown: "An unexpected error occurred. Please try again."
};

// Success messages
export const SUCCESS_MESSAGES = {
  formPurchased: "Form purchased successfully!",
  profileUpdated: "Profile updated successfully!",
  messageSent: "Message sent successfully!",
  assessmentSubmitted: "Assessment submitted successfully!",
  notificationMarked: "Notification marked as read!",
  logout: "Logged out successfully!"
};
