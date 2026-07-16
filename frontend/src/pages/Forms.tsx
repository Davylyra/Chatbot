import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiRefreshCw, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import Navbar from "../components/Navbar";
import FormCard from "../components/FormCard";
import PaymentModal from "../components/PaymentModal";
import EnhancedSearch from "../components/EnhancedSearch";
// FormCardSkeleton removed - app loads instantly
import { useAppStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import PullToRefreshIndicator from "../components/PullToRefreshIndicator";
import { PAYMENT_METHODS } from "../data/constants";
import { contentService, type PageContent } from "../services/contentService";

const Forms: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "success" | "error" | "verifying" | null
  >(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const { forms, loadForms, purchaseForm, addTransaction, addNotification } =
    useAppStore();

  // Handle Paystack redirect callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trxref = params.get("trxref") || params.get("reference");
    if (!trxref) return;

    // Clean URL immediately
    navigate("/forms", { replace: true });

    const verifyPayment = async () => {
      setPaymentStatus("verifying");
      setPaymentMessage("Verifying your payment...");

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/payments/verify/${trxref}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        const result = await response.json();
        const status = result?.data?.status || result?.status;

        const pendingForm = JSON.parse(
          localStorage.getItem("pending_payment_form") || "null",
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
                    String(pendingForm.formPrice).replace(/[^0-9.]/g, ""),
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
              message: `Your payment for the ${pendingForm.universityName} admission form was successful.`,
              type: "success",
              category: "payment",
              priority: "high",
              timestamp: new Date().toISOString(),
              createdAt: new Date(),
              isRead: false,
            });
          }

          setPaymentStatus("success");
          setPaymentMessage(`Successfully purchased form for ${pendingForm?.universityName || "your university"}`);
          setTimeout(() => setPaymentStatus(null), 5000);
        } else if (status === "failed") {
          setPaymentStatus("error");
          setPaymentMessage("Payment was declined. Please try again.");
          setTimeout(() => setPaymentStatus(null), 5000);
        } else {
          setPaymentStatus("error");
          setPaymentMessage("Payment is still processing. Check back shortly.");
          setTimeout(() => setPaymentStatus(null), 5000);
        }
      } catch {
        setPaymentStatus("error");
        setPaymentMessage("Could not verify payment. Check your transaction history.");
        setTimeout(() => setPaymentStatus(null), 5000);
      }
    };

    verifyPayment();
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loadFormsData = async () => {
      if (forms.length === 0) {
        try {
          await loadForms();
        } catch {
          setError("Failed to load forms. Please try again.");
        }
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

    try {
      await loadForms();
    } catch {
      setError("Failed to refresh forms. Please try again.");
    }
  }, [loadForms]);

  const { isRefreshing, pullDistance, canRefresh } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    resistance: 0.5,
    enabled: !isLoading && !error,
  });

  const paymentMethods = PAYMENT_METHODS;

  const handleSearchResultSelect = (_selectedForm: any) => {};

  const filteredForms = useMemo(
    () =>
      searchQuery
        ? forms.filter(
            (form) =>
              form.universityName
                .toLowerCase()
                .includes(searchQuery.toLowerCase()) ||
              form.fullName.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : forms,
    [searchQuery, forms],
  );

  const handleBuyForm = useCallback((form: any) => {
    setSelectedForm(form);
    setShowPaymentModal(true);
  }, []);

  // Payment success is now handled by the Paystack redirect callback above
  const handlePaymentSuccess = (_reference: string) => {};

  const handlePaymentError = (message: string) => {
    setPaymentStatus("error");
    setPaymentMessage(message || "Unable to complete payment.");
    setTimeout(() => setPaymentStatus(null), 5000);
  };

  return (
    <div
      className={`min-h-screen ${
        theme === "dark"
          ? "bg-gradient-to-b from-transparent via-gray-800/50 to-gray-800"
          : "bg-gradient-to-b from-transparent via-white/50 to-white"
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
        showMenuButton={false}
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Payment Status Banner */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`p-4 mb-6 rounded-xl border flex items-center space-x-3 shadow-sm transition-colors ${
                paymentStatus === "success"
                  ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                  : paymentStatus === "error"
                  ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                  : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
              }`}
            >
              {paymentStatus === "success" ? (
                <FiCheckCircle className="w-6 h-6 flex-shrink-0" />
              ) : paymentStatus === "error" ? (
                <FiAlertCircle className="w-6 h-6 flex-shrink-0" />
              ) : (
                <FiRefreshCw className="w-6 h-6 flex-shrink-0 animate-spin" />
              )}
              <span className="font-medium text-sm">{paymentMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* App loads instantly - no loading states */}

        {/* Error State - Only show if critical */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div
              className={`p-6 rounded-2xl text-center border ${
                theme === "dark"
                  ? "bg-red-900/20 border-red-700/50"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <FiAlertCircle
                className={`w-8 h-8 mx-auto mb-3 ${
                  theme === "dark" ? "text-red-400" : "text-red-600"
                }`}
              />
              <h3
                className={`text-lg font-semibold mb-2 ${
                  theme === "dark" ? "text-red-400" : "text-red-600"
                }`}
              >
                Error Loading Forms
              </h3>
              <p
                className={`text-sm mb-4 ${theme === "dark" ? "text-red-300" : "text-red-700"}`}
              >
                {error}
              </p>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center space-x-2 mx-auto"
              >
                <FiRefreshCw
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span>Try Again</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Main Content - Only show when not loading and no error */}
        {!isLoading && !error && (
          <>
            {/* Enhanced Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <EnhancedSearch
                data={forms}
                searchFields={["universityName", "fullName"]}
                placeholder="Search universities and forms..."
                onResultSelect={handleSearchResultSelect}
                onSearch={setSearchQuery}
                showSuggestions={true}
                theme={theme}
              />
            </motion.div>

            {/* Payment Methods */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={` rounded-2xl p-4 mb-6 border transition-all duration-200 ${
                theme === "dark"
                  ? "glass-card-unified-dark"
                  : "glass-card-unified"
              }`}
            >
              <h3
                className={`font-semibold mb-3 transition-colors duration-200 ${
                  theme === "dark" ? "text-white" : "text-gray-800"
                }`}
              >
                {pageContent?.sections.find(
                  (s) => s.id === "payment-methods-title",
                )?.title || "Secure Mobile Money Payment"}
              </h3>
              <p
                className={`text-sm mb-4 transition-colors duration-200 ${
                  theme === "dark" ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {pageContent?.sections.find(
                  (s) => s.id === "payment-methods-title",
                )?.content || "Make payments via"}
              </p>
              <div className="flex space-x-3">
                {paymentMethods.map((method, index) => (
                  <motion.div
                    key={method.name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className={`${method.color} text-white px-4 py-2 rounded-lg text-sm font-medium`}
                  >
                    {method.name}
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Forms List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-4"
            >
              {filteredForms.length > 0 ? (
                filteredForms.map((form, index) => (
                  <motion.div
                    key={form.universityName}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                  >
                    <FormCard
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
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <div
                    className={`text-lg font-medium mb-2 ${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {searchQuery
                      ? "No forms found matching your search."
                      : pageContent?.sections.find(
                          (s) => s.id === "empty-state",
                        )?.content || "No admission forms available."}
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className={`text-sm transition-colors duration-200 ${
                        theme === "dark"
                          ? "text-primary-400 hover:text-primary-300"
                          : "text-primary-600 hover:text-primary-700"
                      }`}
                    >
                      Clear search
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </div>

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
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
    </div>
  );
};

export default Forms;
