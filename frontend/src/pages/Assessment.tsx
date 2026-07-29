import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiStar,
  FiBookOpen,
  FiTarget,
  FiUpload,
  FiAward,
  FiBriefcase,
  FiCompass,
  FiMapPin,
  FiSearch,
  FiInfo,
  FiRefreshCw,
  FiFileText,
  FiZap,
  FiCheckCircle,
} from "react-icons/fi";
import { LuSparkles } from "react-icons/lu";
import Navbar from "../components/Navbar";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import {
  assessmentService,
  type AssessmentQuestion,
} from "../services/assessmentService";
import { parseWassceResult } from "../services/ocrService";
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";

interface AssessmentData {
  bestSubject: string[];
  shsProgram: string;
  wassceGrade: string;
  interests: string[];
  careerGoals: string;
  preferredLocation: string;
}

const STEP_METADATA: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    description: string;
    tip: string;
  }
> = {
  shsProgram: {
    label: "SHS Major",
    icon: FiBookOpen,
    description: "What High School program did you complete?",
    tip: "Your SHS program determines prerequisite eligibility for specialized university faculties in Ghana.",
  },
  bestSubject: {
    label: "Strong Subjects",
    icon: FiAward,
    description: "Select the subjects you perform best in",
    tip: "Select 3 or more subjects to calculate your competitive aggregate for university cut-off points.",
  },
  wassceGrade: {
    label: "WASSCE Slip",
    icon: FiFileText,
    description: "Enter grades or upload your result slip",
    tip: "Ghanaian public universities evaluate your 3 Core subjects + 3 best Electives (e.g. Aggregate 6 to 24).",
  },
  interests: {
    label: "Career Fields",
    icon: FiBriefcase,
    description: "Choose up to 3 career fields of interest",
    tip: "Selecting multiple interests helps our AI find multidisciplinary and dual-degree options.",
  },
  careerGoals: {
    label: "Aspirations",
    icon: FiCompass,
    description: "What are your primary career goals?",
    tip: "Be specific! For example: 'I want to become a Cloud Architect' or 'Work in Medical Research'.",
  },
  preferredLocation: {
    label: "Location",
    icon: FiMapPin,
    description: "Where in Ghana would you like to study?",
    tip: "Consider university campus atmosphere, proximity to home, and housing options.",
  },
};

const GRADE_PRESETS = [
  "Core: A1, A1, B2 | Electives: A1, B2, B3 (Agg: 10)",
  "Core: A1, B2, B3 | Electives: B2, C4, C5 (Agg: 17)",
  "Core: B2, B3, C4 | Electives: C5, C6, C6 (Agg: 26)",
];

const Assessment: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, isAuthenticated, updateProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [optionSearch, setOptionSearch] = useState("");
  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    bestSubject: [],
    shsProgram: "",
    wassceGrade: "",
    interests: [],
    careerGoals: "",
    preferredLocation: "",
  });
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, removeToast, showWarning, showError, showSuccess } =
    useToast();

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoading(true);
        const dynamicQuestions =
          await assessmentService.getAssessmentQuestions();
        setQuestions(dynamicQuestions);
      } catch (err) {
        console.error("Failed to load questions:", err);
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, []);

  // Reset option search filter when changing step
  useEffect(() => {
    setOptionSearch("");
  }, [currentStep]);

  const currentQuestion = questions[currentStep];
  const isLastStep = currentStep === questions.length - 1;
  const isFirstStep = currentStep === 0;

  const currentMeta =
    (currentQuestion && STEP_METADATA[currentQuestion.id]) || {
      label: `Step ${currentStep + 1}`,
      icon: FiTarget,
      description: "Answer the question below",
      tip: "Your answers help tailor program recommendations.",
    };

  const StepIcon = currentMeta.icon;

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    try {
      setIsOcrLoading(true);
      const { wassceGrade } = await parseWassceResult(file);

      setAssessmentData((prev) => ({
        ...prev,
        wassceGrade: wassceGrade || prev.wassceGrade,
      }));

      if (wassceGrade) {
        showSuccess(
          "Result Slip Parsed!",
          "Grades successfully extracted from your WASSCE slip.",
          4000
        );
      }

      if (wassceGrade && wassceGrade.split(",").length < 8) {
        showWarning(
          "Review Extracted Grades",
          "We extracted partial grades. Please verify the text box and adjust any missing values manually.",
          5000
        );
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      if (error.message === "NO_GRADES_FOUND") {
        showWarning(
          "No Grades Detected",
          "Could not detect clear grades. Please ensure your result image is well-lit or enter grades manually.",
          5000
        );
      } else {
        showError(
          "Scan Failed",
          "Failed to scan document. Please try again with a clearer image or type your grades.",
          5000
        );
      }
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleAnswer = (answer: string | string[]) => {
    setAssessmentData((prev) => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handleNext = async () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setSubmitting(true);
      try {
        if (isAuthenticated && user && assessmentData.interests?.length > 0) {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
          const token = localStorage.getItem("token");

          if (token && API_BASE_URL) {
            try {
              await fetch(`${API_BASE_URL}/profile/update`, {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  interests: assessmentData.interests,
                }),
              });
            } catch (err) {
              console.error("Failed to update profile interests:", err);
            }
          }
        }

        const chatMessage =
          await assessmentService.sendAssessmentToChat(assessmentData);

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        const token = localStorage.getItem("token");
        if (API_BASE_URL) {
          try {
            await fetch(`${API_BASE_URL}/assessments/submit`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                userId: isAuthenticated && user ? user.id : "anonymous",
                assessmentData: {
                  subjects: assessmentData.bestSubject,
                  shsProgram: assessmentData.shsProgram,
                  wassceGrade: assessmentData.wassceGrade,
                  interests: assessmentData.interests,
                  careerGoals: assessmentData.careerGoals,
                  preferredLocation: assessmentData.preferredLocation,
                },
              }),
            });
          } catch (err) {
            console.error("Failed to save assessment to database:", err);
          }
        }

        localStorage.setItem("assessmentCompleted", "true");
        if (isAuthenticated && updateProfile) {
          updateProfile({ assessmentCompleted: true });
        }

        setTimeout(() => {
          navigate("/chat", {
            state: {
              assessmentData,
              initialMessage: chatMessage,
              userContext: {
                is_assessment_result: true,
                assessment_data: assessmentData,
              },
            },
          });
        }, 1200);
      } catch (error) {
        console.error("Failed to send assessment to chat:", error);

        const fallbackMessage = `I just completed my assessment. My strong subjects are ${assessmentData.bestSubject?.join(", ") || "various subjects"} and I studied ${assessmentData.shsProgram || "an SHS program"}. I obtained ${assessmentData.wassceGrade || "good grades"} in WASSCE. I'm interested in ${assessmentData.interests?.join(", ") || "multiple fields"} and my career goal is to ${assessmentData.careerGoals || "pursue higher education"}. Could you help me with university recommendations?`;

        setTimeout(() => {
          navigate("/chat", {
            state: {
              assessmentData,
              initialMessage: fallbackMessage,
              userContext: {
                is_assessment_result: true,
                assessment_data: assessmentData,
              },
            },
          });
        }, 1200);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const isAnswerValid = () => {
    if (!currentQuestion) return false;
    const currentAnswer =
      assessmentData[currentQuestion.id as keyof AssessmentData];
    if (currentQuestion.type === "multiple") {
      return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    }
    return currentAnswer && currentAnswer.toString().trim() !== "";
  };

  const getProgressPercentage = () => {
    return questions.length > 0
      ? ((currentStep + 1) / questions.length) * 100
      : 0;
  };

  // Filtered options if option search is typed
  const filteredOptions = currentQuestion?.options
    ? currentQuestion.options.filter((opt) =>
        opt.toLowerCase().includes(optionSearch.toLowerCase().trim())
      )
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200 flex flex-col">
        <Navbar
          title="PROGRAM ASSESSMENT"
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={false}
        />

        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-sm p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4"
          >
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-primary-500/20 animate-ping" />
              <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 text-white">
                <FiRefreshCw className="w-7 h-7 animate-spin" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Preparing Your Assessment
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Loading smart questions for Ghanaian universities...
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200 flex flex-col">
        <Navbar
          title="PROGRAM ASSESSMENT"
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={false}
        />

        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/40 shadow-xl space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
              <FiTarget className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Assessment Unavailable
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Unable to load assessment questions right now. Please check your network connection.
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-primary-600/20 transition-all active:scale-95"
            >
              Return Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-200 flex flex-col relative overflow-x-hidden">
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />

      <Navbar
        title="PROGRAM ASSESSMENT"
        showBackButton={true}
        onBackClick={() => navigate("/")}
        showMenuButton={false}
      />

      {/* Submitting Loading Modal Overlay */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6"
            >
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-primary-500/30 animate-spin border-t-primary-600" />
                <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/40 text-white">
                  <LuSparkles className="w-7 h-7 animate-pulse" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Analyzing Your Profile...
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Matching your WASSCE grades and career goals with entry requirements across UG, KNUST, UCC, and leading Ghanaian universities.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/60 py-2.5 px-4 rounded-xl border border-primary-200 dark:border-primary-800">
                <FiZap className="w-4 h-4 animate-bounce" />
                <span>Redirecting to AI Academic Advisor...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 md:px-8 md:py-8 flex flex-col justify-between">
        {/* Top Header & Interactive Stepper */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary-100 text-primary-700 dark:bg-primary-950/80 dark:text-primary-300 border border-primary-200 dark:border-primary-800 mb-1">
                <LuSparkles className="w-3.5 h-3.5" />
                AI Career & Admission Matcher
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Find Your Ideal Degree
              </h1>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Step {currentStep + 1} of {questions.length}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs">
                {Math.round(getProgressPercentage())}%
              </span>
            </div>
          </div>

          {/* Stepper Timeline Pills */}
          <div className="mb-8 overflow-x-auto scrollbar-hide py-1">
            <div className="flex items-center gap-2 min-w-max">
              {questions.map((q, idx) => {
                const meta = STEP_METADATA[q.id] || {
                  label: `Step ${idx + 1}`,
                  icon: FiTarget,
                };
                const Icon = meta.icon;
                const isCompleted = idx < currentStep;
                const isActive = idx === currentStep;

                return (
                  <button
                    key={q.id}
                    onClick={() => idx < currentStep && setCurrentStep(idx)}
                    disabled={idx > currentStep}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                      isActive
                        ? "bg-primary-600 text-white border-primary-500 shadow-md shadow-primary-600/25 ring-2 ring-primary-500/30"
                        : isCompleted
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 cursor-pointer hover:bg-emerald-100"
                        : "bg-white dark:bg-slate-900/60 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {isCompleted ? (
                      <FiCheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Icon className="w-4 h-4 shrink-0" />
                    )}
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smooth Progress Bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full mb-8 overflow-hidden">
            <motion.div
              className="bg-primary-600 h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${getProgressPercentage()}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>

          {/* Question Card Container */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none mb-6 relative overflow-hidden"
            >
              {/* Top Accent Icon & Title */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-950/80 border border-primary-200 dark:border-primary-800/80 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0 shadow-xs">
                  <StepIcon className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                    Question {currentStep + 1} of {questions.length}
                  </span>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                    {currentQuestion.question}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {currentMeta.description}
                  </p>
                </div>
              </div>

              {/* Option Filter Search Bar for long option lists */}
              {currentQuestion.options && currentQuestion.options.length > 8 && (
                <div className="relative mb-4">
                  <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={optionSearch}
                    onChange={(e) => setOptionSearch(e.target.value)}
                    placeholder={`Filter ${currentQuestion.options.length} options...`}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition-all"
                  />
                  {optionSearch && (
                    <button
                      onClick={() => setOptionSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Answer Content */}
              <div className="space-y-3">
                {currentQuestion.type === "text" ? (
                  <div className="space-y-4">
                    <textarea
                      value={
                        (assessmentData[
                          currentQuestion.id as keyof AssessmentData
                        ] as string) || ""
                      }
                      onChange={(e) => handleAnswer(e.target.value)}
                      placeholder={
                        currentQuestion.placeholder || "Type your response..."
                      }
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 resize-none transition-all"
                      rows={4}
                    />

                    {/* WASSCE Result Slip OCR Drag & Drop Zone */}
                    {currentQuestion.id === "wassceGrade" && (
                      <div className="space-y-3">
                        <div
                          onDragEnter={handleDrag}
                          onDragLeave={handleDrag}
                          onDragOver={handleDrag}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center ${
                            dragActive
                              ? "border-primary-500 bg-primary-50/80 dark:bg-primary-950/40"
                              : "border-slate-300 dark:border-slate-700 hover:border-primary-400 bg-slate-50/50 dark:bg-slate-800/30"
                          }`}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                          />

                          <div className="flex flex-col items-center justify-center space-y-2">
                            <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-950/80 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-xs">
                              {isOcrLoading ? (
                                <FiRefreshCw className="w-6 h-6 animate-spin" />
                              ) : (
                                <FiUpload className="w-6 h-6" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                {isOcrLoading
                                  ? "Scanning WASSCE Document..."
                                  : "Upload Result Slip (AI Auto-Fill)"}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Drag & drop or click to upload photo of your statement of results
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Quick Presets / Examples */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 block mb-1.5">
                            Or pick a quick format template:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {GRADE_PRESETS.map((preset, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleAnswer(preset)}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : currentQuestion.options ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-hide">
                    {filteredOptions.length === 0 ? (
                      <div className="col-span-full py-8 text-center text-slate-400 text-xs font-medium">
                        No options matching "{optionSearch}"
                      </div>
                    ) : (
                      filteredOptions.map((option, index) => {
                        const currentAnswer =
                          assessmentData[
                            currentQuestion.id as keyof AssessmentData
                          ];
                        const isSelected =
                          currentQuestion.type === "multiple"
                            ? Array.isArray(currentAnswer) &&
                              currentAnswer.includes(option)
                            : currentAnswer === option;

                        return (
                          <motion.button
                            key={index}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                              if (currentQuestion.type === "multiple") {
                                const currentArray = Array.isArray(
                                  currentAnswer
                                )
                                  ? currentAnswer
                                  : [];
                                const isAlreadySelected =
                                  currentArray.includes(option);

                                // If interest question, max 3 choices
                                if (
                                  currentQuestion.id === "interests" &&
                                  !isAlreadySelected &&
                                  currentArray.length >= 3
                                ) {
                                  showWarning(
                                    "Limit Reached",
                                    "You can select up to 3 career fields.",
                                    3000
                                  );
                                  return;
                                }

                                const newArray = isAlreadySelected
                                  ? currentArray.filter(
                                      (item) => item !== option
                                    )
                                  : [...currentArray, option];
                                handleAnswer(newArray);
                              } else {
                                handleAnswer(option);
                              }
                            }}
                            className={`p-4 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between gap-3 ${
                              isSelected
                                ? "bg-primary-50 dark:bg-primary-950/60 border-primary-500 text-primary-900 dark:text-primary-200 shadow-sm ring-1 ring-primary-500/30"
                                : "bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            <span className="font-semibold text-xs leading-relaxed">
                              {option}
                            </span>
                            <div
                              className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-primary-600 border-primary-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                              }`}
                            >
                              {isSelected && <FiCheck className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>

              {/* Selection Info Footer */}
              {currentQuestion.type === "multiple" && (
                <div className="mt-4 p-3 rounded-2xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-200/60 dark:border-primary-900/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300 font-medium">
                    <FiInfo className="w-4 h-4 shrink-0" />
                    <span>
                      {currentQuestion.id === "bestSubject"
                        ? "Select all subjects you excel in"
                        : currentQuestion.id === "interests"
                        ? "Select up to 3 career fields"
                        : "Select all options that apply"}
                    </span>
                  </div>
                  {Array.isArray(
                    assessmentData[currentQuestion.id as keyof AssessmentData]
                  ) && (
                    <span className="px-2 py-0.5 rounded-md bg-primary-600 text-white font-bold text-[11px]">
                      {
                        (
                          assessmentData[
                            currentQuestion.id as keyof AssessmentData
                          ] as string[]
                        ).length
                      }{" "}
                      Selected
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Proactive Tip Card */}
          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-start gap-3 text-xs mb-6">
            <FiZap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
              <strong className="font-bold">Pro Tip:</strong> {currentMeta.tip}
            </p>
          </div>
        </div>

        {/* Navigation Buttons Row */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <motion.button
            whileHover={{ scale: isFirstStep ? 1 : 1.02 }}
            whileTap={{ scale: isFirstStep ? 1 : 0.98 }}
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all ${
              isFirstStep
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-transparent"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-xs"
            }`}
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: !isAnswerValid() ? 1 : 1.02 }}
            whileTap={{ scale: !isAnswerValid() ? 1 : 0.98 }}
            onClick={handleNext}
            disabled={!isAnswerValid()}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs transition-all shadow-md active:scale-95 ${
              isAnswerValid()
                ? "bg-primary-600 hover:bg-primary-700 text-white shadow-primary-600/30"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none"
            }`}
          >
            <span>{isLastStep ? "Send to AI Chat" : "Continue"}</span>
            {!isLastStep ? (
              <FiArrowRight className="w-4 h-4" />
            ) : (
              <FiStar className="w-4 h-4 fill-white" />
            )}
          </motion.button>
        </div>
      </main>
    </div>
  );
};

export default Assessment;
