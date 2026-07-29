import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMessageCircle,
  FiShoppingCart,
  FiUsers,
  FiSearch,
  FiStar,
  FiX,
  FiArrowRight,
  FiCheckCircle,
  FiCompass,
  FiBookOpen,
  FiShield,
} from "react-icons/fi";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import LazyImage from "../components/LazyImage";
import { useAppStore } from "../store";
import { useAuth } from "../contexts/AuthContext";
import { getTimeBasedGreeting } from "../utils/greetings";
import { useGuestLimitations } from "../hooks/useGuestLimitations";
import GuestLimitationModal from "../components/GuestLimitationModal";
import { contentService, type PageContent } from "../services/contentService";

const Home: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setError] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<PageContent | null>(null);

  const navigate = useNavigate();
  const { user, isAuthenticated, isGuest } = useAuth();
  const { loadForms, forms, currentConversation, saveCurrentConversation } =
    useAppStore();
  const {
    showLimitationModal,
    limitationData,
    checkGuestAccess,
    closeLimitationModal,
  } = useGuestLimitations();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const updateScreenMode = () => {
      setIsDesktop(mediaQuery.matches);
      setSidebarOpen(mediaQuery.matches);
    };

    updateScreenMode();
    mediaQuery.addEventListener("change", updateScreenMode);

    const handleToggle = () => setSidebarOpen((prev) => !prev);
    window.addEventListener("toggleMainSidebar", handleToggle);

    return () => {
      mediaQuery.removeEventListener("change", updateScreenMode);
      window.removeEventListener("toggleMainSidebar", handleToggle);
    };
  }, []);

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (isAuthenticated && forms.length === 0) {
          await loadForms();
        }
      } catch {
        setError("Failed to load data. Please try again.");
      }
    };

    loadInitialData();
  }, [isAuthenticated, forms.length, loadForms]);

  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent("home");
        setPageContent(content);
      } catch (error) {
        console.error("Failed to load page content:", error);
      }
    };

    loadPageContent();
  }, []);

  const allUniversities =
    forms.length > 0
      ? forms.slice(0, 6)
      : [
          {
            id: "1",
            universityName: "KNUST",
            fullName: "Kwame Nkrumah Univ. of Science & Technology",
            logo: "/university-logos/knust-logo.png",
          },
          {
            id: "2",
            universityName: "UG",
            fullName: "University of Ghana, Legon",
            logo: "/university-logos/ug-logo.png",
          },
          {
            id: "3",
            universityName: "UCC",
            fullName: "University of Cape Coast",
            logo: "/university-logos/ucc-logo.png",
          },
          {
            id: "4",
            universityName: "UDS",
            fullName: "University for Development Studies",
            logo: "/university-logos/uds-logo.png",
          },
          {
            id: "5",
            universityName: "GCTU",
            fullName: "Ghana Communication Technology University",
            logo: "/university-logos/gctu-logo.png",
          },
          {
            id: "6",
            universityName: "UEW",
            fullName: "University of Education, Winneba",
            logo: "/university-logos/uew-logo.png",
          },
        ];

  const filteredUniversities = useMemo(
    () =>
      searchQuery
        ? allUniversities.filter(
            (university) =>
              university.universityName
                .toLowerCase()
                .includes(searchQuery.toLowerCase()) ||
              university.fullName
                .toLowerCase()
                .includes(searchQuery.toLowerCase()),
          )
        : allUniversities.slice(0, 6),
    [searchQuery, allUniversities],
  );

  const displayUniversities = useMemo(
    () => (searchOpen ? filteredUniversities : allUniversities.slice(0, 6)),
    [searchOpen, filteredUniversities, allUniversities],
  );

  const handleStartChatWithPrompt = (initialPrompt?: string) => {
    if (checkGuestAccess("chat")) {
      if (currentConversation) {
        saveCurrentConversation();
      }
      navigate("/chat", {
        state: {
          forceNewConversation: true,
          ...(initialPrompt ? { initialMessage: initialPrompt } : {}),
        },
      });
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleSidebarClose}
        isDesktop={isDesktop}
      />

      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <Navbar
          logoSrc="/cerkyl-logo.png"
          logoAlt="CERKYL"
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
          showProfileButton={true}
          onProfileClick={() => navigate("/profile")}
        />

        <div className="flex-1 overflow-y-auto scrollbar-hide relative pb-24">
          <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
            {/* Hero Welcome Banner */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm relative overflow-hidden"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                      <FiStar className="w-3.5 h-3.5 mr-1 text-primary-600 dark:text-primary-400" />
                      Ghana Admission Hub
                    </span>

                    {isGuest && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {pageContent?.sections.find(
                          (s) => s.id === "guest-mode-notice",
                        )?.content || "Guest Mode"}
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {`${getTimeBasedGreeting()}, `}
                    <span className="text-primary-600 dark:text-primary-400">
                      {isGuest ? "Future Student" : user?.name || "Student"}
                    </span>
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                    {pageContent?.sections.find((s) => s.id === "welcome-message")
                      ?.content ||
                      "Your intelligent AI guide for Ghana university admissions, program selection, entry cut-off points, and official application vouchers."}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <FiCheckCircle className="text-green-500 w-4 h-4" /> 10+ Public Universities
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FiCheckCircle className="text-green-500 w-4 h-4" /> Instant E-Vouchers
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FiCheckCircle className="text-green-500 w-4 h-4" /> 24/7 AI Advisor
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0">
                  <button
                    onClick={() => handleStartChatWithPrompt()}
                    className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 text-sm"
                  >
                    <FiMessageCircle className="w-4 h-4" />
                    Ask AI Advisor
                  </button>

                  <button
                    onClick={() => navigate("/forms")}
                    className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-3 px-6 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-sm"
                  >
                    <FiShoppingCart className="w-4 h-4" />
                    Buy E-Forms
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Main Action Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: AI Chat Assistant */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-primary-300 dark:hover:border-primary-800 transition-colors"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-950/80 border border-primary-200 dark:border-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4">
                    <FiMessageCircle className="w-6 h-6" />
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    {pageContent?.sections.find((s) => s.id === "start-chat-button")
                      ?.content || "AI Admissions Chat"}
                  </h2>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    Ask any question regarding cut-off points, requirements, fee structures, accommodation, or program eligibility.
                  </p>

                  {/* Suggested Prompts */}
                  <div className="space-y-2 mb-6">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Popular Questions:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          handleStartChatWithPrompt(
                            "What are the KNUST cut-off points for Nursing & Engineering?",
                          )
                        }
                        className="text-xs py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-primary-50 dark:bg-slate-800 dark:hover:bg-primary-950/50 text-slate-700 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-300 border border-slate-200 dark:border-slate-700 transition-colors text-left"
                      >
                        KNUST cut-off points?
                      </button>
                      <button
                        onClick={() =>
                          handleStartChatWithPrompt(
                            "What are the admission requirements for Legon Business School?",
                          )
                        }
                        className="text-xs py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-primary-50 dark:bg-slate-800 dark:hover:bg-primary-950/50 text-slate-700 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-300 border border-slate-200 dark:border-slate-700 transition-colors text-left"
                      >
                        Legon Business School requirements
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleStartChatWithPrompt()}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                >
                  Start New Chat
                  <FiArrowRight className="w-4 h-4" />
                </button>
              </motion.div>

              {/* Card 2: E-Form Store */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 mb-4">
                    <FiShoppingCart className="w-6 h-6" />
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    {pageContent?.sections.find((s) => s.id === "buy-forms-button")
                      ?.content || "Official E-Voucher Store"}
                  </h2>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    Purchase genuine admission application e-pins for KNUST, UG, UCC, UDS, GCTU, UEW, and other accredited institutions.
                  </p>

                  <div className="space-y-2 mb-6">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Supported Payment Methods:
                    </p>
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        MTN MoMo
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        Telecel Cash
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        Visa / Mastercard
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate("/forms")}
                  className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                >
                  Browse Available Forms
                  <FiArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            </div>

            {/* Assessment Callout Banner */}
            {(!isAuthenticated
              ? localStorage.getItem("assessmentCompleted") !== "true"
              : !user?.assessmentCompleted) && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-6 shadow-sm"
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                      <FiStar className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {pageContent?.sections.find(
                          (s) => s.id === "program-recommendation-title",
                        )?.title || "Get Program Recommendations"}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-xl">
                        {pageContent?.sections.find(
                          (s) => s.id === "program-recommendation-title",
                        )?.content ||
                          "Enter your WASSCE / SSSCE grades and career interests to calculate your aggregate score and get instant program recommendations."}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (checkGuestAccess("assessment")) {
                        navigate("/assessment");
                      }
                    }}
                    className="w-full md:w-auto bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shrink-0 shadow-sm"
                  >
                    {pageContent?.sections.find(
                      (s) => s.id === "start-assessment-button",
                    )?.content || "Start Assessment"}
                    <FiArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* University Explorer Section */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6"
            >
              {/* Explorer Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400">
                    <FiUsers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {pageContent?.sections.find(
                        (s) => s.id === "university-sessions-title",
                      )?.content || "Explore Ghana Universities"}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select a university to inspect programs & requirements
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    onClick={() => setSearchOpen(!searchOpen)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 text-xs font-semibold"
                  >
                    {searchOpen ? <FiX className="w-4 h-4" /> : <FiSearch className="w-4 h-4" />}
                    {searchOpen ? "Close Search" : "Search Universities"}
                  </button>

                  <button
                    onClick={() => {
                      if (checkGuestAccess("universities")) {
                        navigate("/universities");
                      }
                    }}
                    className="p-2.5 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 hover:bg-primary-100 transition-colors text-xs font-semibold"
                  >
                    View All ({allUniversities.length})
                  </button>
                </div>
              </div>

              {/* Search Bar Input */}
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="relative">
                      <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by university name or full title..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 transition-colors"
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* University Cards Grid (Responsive 1col, 2col, 3col) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayUniversities.map((university, index) => (
                  <motion.div
                    key={university.id || university.universityName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      if (currentConversation) {
                        saveCurrentConversation();
                      }

                      navigate("/chat", {
                        state: {
                          universityContext: {
                            name: university.universityName,
                            fullName: university.fullName,
                            logo: university.logo,
                          },
                          forceNewConversation: true,
                          initialMessage: `Tell me about ${university.fullName} - their programs, admission requirements, and application process.`,
                        },
                      });
                    }}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-start space-x-3.5 mb-3">
                      <LazyImage
                        src={university.logo || "/university-logos/default-logo.png"}
                        alt={`${university.universityName} logo`}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs"
                        priority={false}
                        fallback={
                          <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
                            {university.universityName}
                          </div>
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <span className="inline-block text-xs font-bold text-primary-600 dark:text-primary-400 mb-0.5">
                          {university.universityName}
                        </span>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {university.fullName}
                        </h3>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      <span>Explore Admission</span>
                      <FiArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                ))}
              </div>

              {searchOpen && filteredUniversities.length === 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <p className="text-sm font-medium">No universities found matching "{searchQuery}"</p>
                </div>
              )}
            </motion.div>

            {/* Platform Feature Capabilities */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 shrink-0">
                  <FiCompass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cutoff Point Calculator</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Calculate aggregate WASSCE/SSSCE grades automatically.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 shrink-0">
                  <FiShield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Official E-Vouchers</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Verified application pins delivered straight to SMS/email.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 shrink-0">
                  <FiBookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Complete Program Specs</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Inspect degree course outlines and future career options.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Guest Limitation Modal */}
      <GuestLimitationModal
        isOpen={showLimitationModal}
        onClose={closeLimitationModal}
        feature={limitationData?.feature || ""}
        description={limitationData?.description || ""}
        benefits={limitationData?.benefits || []}
      />
    </div>
  );
};

export default Home;
