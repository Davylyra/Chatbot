/**
 * Constants and Mock Data
 * Description: Centralized location for all mock data and constants
 * Integration: Replace with real data from backend APIs
 */

// University data - TODO: Replace with API data
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
    deadline: "2025-12-31",
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

// Assessment questions - TODO: Replace with API data
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

// Payment methods - TODO: Replace with API data
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
    answer: "Applying for university admission in Ghana follows a systematic process. First, you must obtain the application form (voucher) from your chosen university either through their online portal or by purchasing a voucher from designated vendor outlets across the country. Most public universities in Ghana participate in the centralized application system coordinated by the Ghana Tertiary Education Commission. After acquiring your voucher, you will create an account on the university's admissions portal using your voucher serial number and PIN. Complete all required sections of the application form, including personal information, educational background, programme choices, and supporting documents. Required documents typically include your WASSCE results slip, birth certificate, passport photographs, and identification documents. Some programmes may require additional documentation such as recommendation letters or health certificates. Upon completion, submit your application online and pay the requisite processing fee through the accepted payment methods (mobile money, bank transfer, or online payment platforms). After submission, you will receive an acknowledgement receipt and a reference number. Keep this reference number secure as you will need it to track your application status. It is advisable to apply early, as some competitive programmes fill up quickly. Always verify the specific requirements for your chosen programme, as certain courses like Medicine, Nursing, and Engineering may have additional entry examinations or interviews."
  },
  {
    id: "faq-requirements",
    question: "What are the admission requirements?",
    answer: "Admission requirements for Ghanaian universities vary depending on the institution and programme of study. For undergraduate programmes, the minimum general requirement is a Senior High School Certificate (WASSCE, GBCE, SSSCE, or equivalent) with at least six credits (grades A1 to C6), which must include English Language and Mathematics. Specific programmes have additional subject requirements. Science-based programmes such as Medicine, Pharmacy, and Engineering typically require credits in Physics, Chemistry, Biology, and Elective Mathematics. Business programmes generally require credits in Mathematics, Economics, and Business Management or related subjects. Arts and Humanities programmes may require credits in languages, Literature, History, or Government. Some competitive programmes set higher grade requirements, with Medicine often requiring aggregate scores below 12 (mostly A1 and B2 grades). Technical and vocational programmes may accept NVTI certificates or City and Guilds qualifications in addition to WASSCE. For postgraduate programmes, applicants need a good Bachelor's degree (at least Second Class Lower Division) from an accredited institution. Mature applicants who are 25 years and above may be considered based on their work experience and qualifying examinations even without the standard certificates. International students must have qualifications equivalent to Ghana's WASSCE and may need to provide English language proficiency test results such as TOEFL or IELTS. Some universities conduct aptitude tests or entrance examinations for specific programmes. Always consult the specific university's admissions office or prospectus for detailed requirements for your chosen programme, as requirements are subject to periodic review and updates."
  },
  {
    id: "faq-payment",
    question: "How do I pay for application forms?",
    answer: "Payment for university application forms in Ghana can be made through several convenient methods to accommodate applicants nationwide. Mobile money is the most popular payment option, allowing you to pay instantly using MTN Mobile Money, Vodafone Cash, AirtelTigo Money, or any other recognized mobile money service. To pay via mobile money, access the university's admissions portal, select the mobile money payment option, enter your mobile money number, and authorize the transaction using your mobile money PIN. You will receive instant confirmation upon successful payment. Bank transfer and direct bank deposits are also accepted. You can visit any branch of the designated banks listed by the university and pay the form fee into the specified account, ensuring you retain your deposit slip as proof of payment. Some universities accept online payments via credit or debit cards (Visa, Mastercard) through secure payment gateways integrated into their portals. For applicants who prefer physical vouchers, you can purchase application vouchers from accredited vendor outlets located across regional capitals and major towns. These outlets include selected banks, educational centers, and university campus bookshops. The voucher contains a unique serial number and PIN code that you will use to access the online application form. Application fees vary by university, typically ranging from GHS 150 to GHS 300 for undergraduate programmes and GHS 200 to GHS 500 for postgraduate programmes. After payment, save your transaction reference number, receipt, or voucher details securely. This information may be required for verification during the application process or if any payment issues arise. If you encounter payment difficulties, contact the university's admissions office immediately with your transaction details for assistance. Note that application fees are generally non-refundable, so ensure you meet all eligibility requirements before making payment."
  },
  {
    id: "faq-deadlines",
    question: "When are application deadlines?",
    answer: "Application deadlines for Ghanaian universities vary by institution, programme, and academic year. For undergraduate admissions, most public universities open their application portals between March and May for admission into the following academic year, which typically begins in August or September. The main application period usually runs from May to December, with most deadlines falling between October and December. However, early applicants are often given priority consideration, especially for competitive programmes. Private universities may have multiple intake periods, with some offering admissions two or three times annually, typically in January, May, and September. For competitive programmes such as Medicine, Pharmacy, Nursing, Law, and Engineering, deadlines tend to be earlier, often closing by September or October, as these programmes require additional processing time for entrance examinations and interviews. Postgraduate programme deadlines vary significantly depending on whether the programme follows a trimester, semester, or annual intake system. Regular postgraduate admissions generally open between November and March for programmes starting in August or September. Some universities offer rolling admissions, meaning applications are processed on a first-come-first-served basis until the programme is filled, while others have fixed deadlines. It is important to note that meeting the deadline does not guarantee admission, as spaces are limited and selection is competitive. We strongly advise applicants to submit their applications at least one month before the stated deadline to avoid technical issues, payment delays, or missing documentation. Late applications may be considered on a case-by-case basis for programmes with available spaces, but this often incurs additional late fees. For the most accurate and current deadline information, regularly check the specific university's official website or admissions portal, as deadlines may change from year to year. Setting up email or SMS alerts from the university can help ensure you do not miss important deadline updates. If you are applying to multiple universities, create a personal deadline calendar to manage your applications efficiently."
  },
  {
    id: "faq-track",
    question: "How do I track my application status?",
    answer: "Tracking your university application status in Ghana has become streamlined through online portals and digital communication systems. After submitting your application, you will receive a unique reference number or application ID. This reference number is your primary tool for checking your application status throughout the admissions process. To track your application, visit the admissions portal of the university where you applied and locate the 'Check Application Status' or 'Track Application' section. Log in using your email address, phone number, or application reference number along with the password you created during registration. Once logged in, you will see the current status of your application, which may display as 'Received,' 'Under Review,' 'Pending Documentation,' 'Shortlisted,' 'Admitted,' or 'Not Successful.' Some universities provide detailed tracking that shows each stage of the application review process, including document verification, academic evaluation, and final decision. Universities typically send status updates via SMS and email to the contact details you provided during application. Ensure your phone number and email address are correct and check them regularly, including your spam folder. For programmes requiring entrance examinations or interviews, the portal will display schedules, venues, and requirements. If you are admitted, the portal will show your admission letter, which you can download and print. The letter will contain important information about programme details, fee payment instructions, registration deadlines, and required documents for enrollment. Most universities publish admission lists on their websites and notice boards, categorized by programme and applicant name or application number. You can also call the university's admissions hotline for status inquiries, though portal checking is more efficient. If your status remains unchanged for an extended period or you encounter technical difficulties accessing the portal, contact the admissions office via email or phone with your application reference number for assistance. Keep all application documents, receipts, and correspondence organized in a dedicated folder for easy reference. Remember that admission decisions take time, particularly for competitive programmes. Be patient and check your status regularly, especially during peak admission periods between July and September."
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

// Mock transactions - TODO: Replace with API data
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

// Mock recent chats - TODO: Replace with API data
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
