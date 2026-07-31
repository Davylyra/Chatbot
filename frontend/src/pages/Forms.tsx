import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle,
  FiShoppingCart,
  FiZap,
  FiShield,
  FiFileText,
  FiFilter,
  FiArrowRight,
  FiSearch,
} from "react-icons/fi";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import FormCard from "../components/FormCard";
import PaymentModal from "../components/PaymentModal";
import EnhancedSearch from "../components/EnhancedSearch";
import { useAppStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { useSidebarNav } from "../hooks/useSidebarNav";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import PullToRefreshIndicator from "../components/PullToRefreshIndicator";
import { PAYMENT_METHODS } from "../data/constants";
import { contentService, type PageContent } from "../services/contentService";

const Forms: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { isDesktop, sidebarOpen, toggleSidebar, closeSidebar } = useSidebarNav();
  const { forms, loadForms, purchaseForm, addTransaction, addNotification } =
    useAppStore();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(forms.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "available" | "closing_soon">("all");
  const [paymentStatus, setPaymentStatus] = useState<
    "success" | "error" | "verifying" | null
  >(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageContent, setPageContent] = useState<PageContent | null>(null);

  // Handle Paystack redirect callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trxref = params.get("trxref") || params.get("reference");
    if (!trxref) return;

    // Clean URL immediately
    navigate("/forms", { replace: true });

    const verifyPayment = async () => {
      setPaymentStatus("verifying");
      setPaymentMessage("Verifying your Mobile Money transaction...");

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/payments/verify/${trxref}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const result = await response.json();
        const status = result?.data?.status || result?.status;

        const pendingForm = JSON.parse(
          localStorage.getItem("pending_payment_form") || "null"
        );
        localStorage.removeItem("pending_payment_form");

        if (result.success && status === "success") {
          if (pendingForm) {
            await purchaseForm(pendingForm.id);
            const now = new Date();
            const amountValue =
              typeof pendingForm.formPrice === "number"
                ? pendingForm.formPrice
                : parseFloat(
                    String(pendingForm.formPrice).replace(/[^0-9.]/g, "")
                  ) || 0;

            addTransaction({
              id: trxref,
              universityName: pendingForm.universityName,
              fullName: pendingForm.fullName,
              type: "Form Purchase",
              date: now.toLocaleDateString(),
              time: now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              status: "completed",
              paymentMethod: "Mobile Money",
              amount: `GHC ${amountValue.toFixed(2)}`,
              currency: "GHS",
              reference: trxref,
            });

            addNotification({
              title: "Payment Successful",
              message: `Your payment for ${pendingForm.universityName} form was successful. Serial Number & PIN issued.`,
              type: "success",
              category: "payment",
              priority: "high",
              timestamp: new Date().toISOString(),
              createdAt: new Date(),
              isRead: false,
            });
          }

          setPaymentStatus("success");
          setPaymentMessage(
            `Payment confirmed! Voucher issued for ${pendingForm?.universityName || "your form"}.`
          );
          setTimeout(() => setPaymentStatus(null), 6000);
        } else if (status === "failed") {
          setPaymentStatus("error");
          setPaymentMessage("Transaction was declined by telecom network. Please try again.");
          setTimeout(() => setPaymentStatus(null), 6000);
        } else {
          setPaymentStatus("error");
          setPaymentMessage("Payment processing. Check your transactions page shortly.");
          setTimeout(() => setPaymentStatus(null), 6000);
        }
      } catch {
        setPaymentStatus("error");
        setPaymentMessage("Could not verify payment status. Please check your transaction history.");
        setTimeout(() => setPaymentStatus(null), 6000);
      }
    };

    verifyPayment();
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loadFormsData = async () => {
      if (forms.length === 0) {
        setIsLoading(true);
        try {
          await loadForms();
        } catch {
          setError("Failed to load forms. Please try again.");
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };

    loadFormsData();
  }, [forms.length, loadForms]);

  useEffect(() => {
    const loadPageContent = async () => {
      try {
        const content = await contentService.getPageContent("forms");
        setPageContent(content);
      } catch (error) {
        console.error("Failed to load page content:", error);
      }
    };

    loadPageContent();
  }, []);

  const handleRefresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      await loadForms();
    } catch {
      setError("Failed to refresh forms. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [loadForms]);

  const { isRefreshing, pullDistance, canRefresh } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    resistance: 0.5,
    enabled: !isLoading && !error,
  });

  const paymentMethods = PAYMENT_METHODS;

  const filteredForms = useMemo(() => {
    let result = [...forms];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (form) =>
          form.universityName.toLowerCase().includes(q) ||
          form.fullName.toLowerCase().includes(q)
      );
    }

    // Category tab filter
    if (activeTab === "available") {
      result = result.filter((f) => f.isAvailable && f.status !== "expired");
    } else if (activeTab === "closing_soon") {
      result = result.filter(
        (f) =>
          f.daysUntilDeadline !== undefined &&
          f.daysUntilDeadline > 0 &&
          f.daysUntilDeadline <= 30
      );
    }

    return result;
  }, [searchQuery, forms, activeTab]);

  const availableCount = useMemo(
    () => forms.filter((f) => f.isAvailable && f.status !== "expired").length,
    [forms]
  );

  const closingSoonCount = useMemo(
    () =>
      forms.filter(
        (f) =>
          f.daysUntilDeadline !== undefined &&
          f.daysUntilDeadline > 0 &&
          f.daysUntilDeadline <= 30
      ).length,
    [forms]
  );

  const handleBuyForm = useCallback((form: any) => {
    setSelectedForm(form);
    setShowPaymentModal(true);
  }, []);

  const handlePaymentError = (message: string) => {
    setPaymentStatus("error");
    setPaymentMessage(message || "Unable to complete payment.");
    setTimeout(() => setPaymentStatus(null), 5000);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isDesktop={isDesktop}
      />
      <div
        className={`flex-1 flex flex-col h-full overflow-y-auto text-slate-900 dark:text-white transition-colors duration-200 ${
          theme === "dark" ? "bg-slate-950" : "bg-slate-50"
        }`}
      >
        {/* Pull to Refresh Indicator */}
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          canRefresh={canRefresh}
          threshold={80}
          theme={theme}
        />

        <Navbar
          title="BUY ADMISSION FORMS"
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={true}
          onMenuClick={toggleSidebar}
        />

        <main className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 pb-24">
        {/* Payment Verification Banner */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              className={`p-4 mb-6 rounded-2xl border flex items-center space-x-3 shadow-lg transition-colors ${
                paymentStatus === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300"
                  : paymentStatus === "error"
                  ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/60 dark:border-red-800 dark:text-red-300"
                  : "bg-primary-50 border-primary-200 text-primary-800 dark:bg-primary-950/60 dark:border-primary-800 dark:text-primary-300"
              }`}
            >
              {paymentStatus === "success" ? (
                <FiCheckCircle className="w-6 h-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : paymentStatus === "error" ? (
                <FiAlertCircle className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400" />
              ) : (
                <FiRefreshCw className="w-6 h-6 shrink-0 animate-spin text-primary-600" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{paymentMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Section Banner */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-10 mb-8 shadow-2xl relative overflow-hidden">
          {/* Background Decorative Blur Circle */}
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center space-x-2 mb-3">
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-primary-500/30 text-primary-300 border border-primary-400/30 backdrop-blur-md flex items-center gap-1.5">
                <FiZap className="w-3.5 h-3.5 text-primary-400" />
                Instant Digital Delivery
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Buy Ghanaian University Admission Forms
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mt-2 leading-relaxed">
              Purchase genuine e-vouchers for UG, KNUST, UCC, and top tertiary institutions instantly via Mobile Money (MTN, Telecel, AT). Receive your Serial Number & PIN immediately.
            </p>

            {/* Quick Stat Chips */}
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 text-xs font-semibold">
                <FiShoppingCart className="w-4 h-4 text-primary-400" />
                <span>{forms.length} Active Forms</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 text-xs font-semibold">
                <FiShield className="w-4 h-4 text-emerald-400" />
                <span>MoMo & Visa Verified</span>
              </div>
              <button
                onClick={() => navigate("/transactions")}
                className="bg-white text-slate-900 hover:bg-slate-100 transition-colors px-4 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md ml-auto sm:ml-0"
              >
                <FiFileText className="w-3.5 h-3.5 text-primary-600" />
                <span>My Vouchers</span>
                <FiArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-3xl text-center border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 shadow-lg max-w-md mx-auto"
          >
            <FiAlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-red-900 dark:text-red-300">
              Error Loading Forms
            </h3>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1 mb-4">
              {error}
            </p>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 mx-auto"
            >
              <FiRefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>Try Again</span>
            </button>
          </motion.div>
        )}

        {/* Loading Skeleton State */}
        {isLoading && !error && (
          <div className="space-y-6 mb-8">
            <div className="flex items-center space-x-2 text-xs font-bold text-primary-600 dark:text-primary-400 animate-pulse px-1">
              <FiRefreshCw className="w-4 h-4 animate-spin" />
              <span>Fetching tertiary admission forms...</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div
                  key={idx}
                  className={`rounded-3xl p-6 border animate-pulse flex flex-col justify-between space-y-5 ${
                    theme === "dark"
                      ? "bg-slate-900/60 border-slate-800"
                      : "bg-white border-slate-200/80 shadow-xs"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="w-13 h-13 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" />
                        </div>
                      </div>
                      <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-full shrink-0" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 my-5 p-3.5 rounded-2xl bg-slate-100/60 dark:bg-slate-800/40">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-md w-12" />
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded-md w-16" />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-md w-12" />
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded-md w-16" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex space-x-2">
                    <div className="flex-1 h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                    <div className="w-12 h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {!isLoading && !error && (
          <>
            {/* Search & Filter Toolbar Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              {/* Filter Tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide py-1">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                    activeTab === "all"
                      ? "bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  All Forms ({forms.length})
                </button>
                <button
                  onClick={() => setActiveTab("available")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                    activeTab === "available"
                      ? "bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Available Now ({availableCount})
                </button>
                <button
                  onClick={() => setActiveTab("closing_soon")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                    activeTab === "closing_soon"
                      ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Closing Soon ({closingSoonCount})
                </button>
              </div>

              {/* Search Box */}
              <div className="w-full md:w-80">
                <EnhancedSearch
                  data={forms}
                  searchFields={["universityName", "fullName"]}
                  placeholder="Search universities & forms..."
                  onResultSelect={() => {}}
                  onSearch={setSearchQuery}
                  showSuggestions={true}
                  theme={theme}
                />
              </div>
            </div>

            {/* Mobile Money Carrier Bar */}
            <div className="p-4 mb-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center space-x-2">
                <FiShield className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {pageContent?.sections.find((s) => s.id === "payment-methods-title")?.title ||
                    "Supported Mobile Money Networks:"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {paymentMethods.map((method) => (
                  <span
                    key={method.name}
                    className={`${method.color} text-white px-3 py-1 rounded-lg text-[11px] font-bold shadow-xs`}
                  >
                    {method.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Form Cards Grid */}
            {filteredForms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredForms.map((form, index) => (
                  <FormCard
                    key={form.universityName || index}
                    universityName={form.universityName}
                    fullName={form.fullName}
                    formPrice={form.formPrice}
                    currency={form.currency || "GHS"}
                    deadline={form.deadline}
                    isAvailable={form.isAvailable}
                    onBuyClick={() => handleBuyForm(form)}
                    logo={form.logo}
                    status={form.status || "available"}
                    daysUntilDeadline={form.daysUntilDeadline}
                    lastUpdated={form.lastUpdated}
                  />
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md max-w-lg mx-auto"
              >
                <FiSearch className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  No Forms Found
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  {searchQuery
                    ? `No admission forms match "${searchQuery}".`
                    : "No forms currently match the selected filter tab."}
                </p>
                {(searchQuery || activeTab !== "all") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setActiveTab("all");
                    }}
                    className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-md"
                  >
                    Reset Search & Filters
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Payment Modal */}
      {selectedForm && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          formData={{
            id: selectedForm.id,
            universityName: selectedForm.universityName,
            fullName: selectedForm.fullName,
            formPrice: selectedForm.formPrice,
          }}
          onSuccess={() => {}}
          onError={handlePaymentError}
        />
      )}
      </div>
    </div>
  );
};

export default Forms;
