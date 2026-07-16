/**
 * PRODUCTION-READY PAYMENT MODAL - Paystack Redirect Integration
 * Redirects user to Paystack checkout in the same tab
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiX, FiCreditCard, FiAlertCircle } from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    id: string;
    universityName: string;
    fullName: string;
    formPrice: number | string;
  };
  onSuccess: (reference: string) => void;
  onError: (error: string) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  formData,
  onError,
}) => {
  const { theme } = useTheme();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const initializePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      const token = localStorage.getItem("token");
      if (!token) throw new Error("Please log in to make a payment");

      const storedUser = localStorage.getItem("user");
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;

      // Store selected form info so we can show success on return
      localStorage.setItem(
        "pending_payment_form",
        JSON.stringify({
          id: formData.id,
          universityName: formData.universityName,
          fullName: formData.fullName,
          formPrice: formData.formPrice,
        }),
      );

      const response = await fetch(`${API_BASE_URL}/payments/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: parsedUser?.email || "",
          formId: formData.id,
          amount:
            typeof formData.formPrice === "string"
              ? parseFloat(formData.formPrice.replace(/[^0-9.]/g, ""))
              : formData.formPrice,
          paymentMethod: "mobile_money",
          callbackUrl: `${window.location.origin}/forms`,
          metadata: {
            universityName: formData.universityName,
            formName: formData.fullName,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Payment initialization failed");
      }

      const paymentInitResponse = await response.json();

      if (
        !paymentInitResponse.success ||
        !paymentInitResponse.data?.authorization_url
      ) {
        throw new Error(
          paymentInitResponse.message || "Invalid payment response",
        );
      }

      // Redirect in same tab — Paystack will redirect back to /forms after payment
      window.location.href = paymentInitResponse.data.authorization_url;
    } catch (paymentError: any) {
      console.error("Payment initialization error:", paymentError);
      setError(paymentError.message || "Failed to initialize payment");
      setProcessing(false);
      onError(paymentError.message);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    initializePayment();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
            theme === "dark" ? "bg-gray-800" : "bg-white"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between p-6 border-b ${
              theme === "dark" ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div>
              <h3
                className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}
              >
                Complete Payment
              </h3>
              <p
                className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
              >
                {formData.universityName}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={processing}
              aria-label="Close payment modal"
              className={`p-2 rounded-lg transition-colors ${
                theme === "dark"
                  ? "hover:bg-gray-700 text-gray-400"
                  : "hover:bg-gray-100 text-gray-600"
              } ${processing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Amount Display */}
            <div
              className={`p-4 rounded-lg text-center ${
                theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
            >
              <p
                className={`text-sm mb-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
              >
                Amount to Pay
              </p>
              <p
                className={`text-3xl font-bold ${
                  theme === "dark" ? "text-green-400" : "text-green-600"
                }`}
              >
                GH₵{" "}
                {typeof formData.formPrice === "string"
                  ? formData.formPrice.replace(/[^0-9.]/g, "")
                  : formData.formPrice.toFixed(2)}
              </p>
            </div>

            <p
              className={`text-sm text-center ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              You will be redirected to Paystack to complete payment securely.
            </p>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start space-x-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={processing}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-all ${
                processing
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-primary-600 hover:bg-primary-700 active:scale-95"
              }`}
            >
              {processing ? (
                <span className="flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                  />
                  Redirecting to Paystack...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <FiCreditCard className="w-5 h-5 mr-2" />
                  Pay GH₵{" "}
                  {typeof formData.formPrice === "string"
                    ? formData.formPrice.replace(/[^0-9.]/g, "")
                    : formData.formPrice.toFixed(2)}
                </span>
              )}
            </button>

            {/* Security Notice */}
            <p
              className={`text-xs text-center ${
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Secured by Paystack. Your payment information is safe and
              encrypted.
            </p>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PaymentModal;
