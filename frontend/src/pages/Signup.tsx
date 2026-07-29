import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FiMail,
  FiLock,
  FiUser,
  FiEye,
  FiEyeOff,
  FiArrowRight,
  FiCheck,
  FiAlertCircle,
  FiLogIn,
} from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAutoCloseError } from "../hooks/useAutoCloseError";
import EmailVerificationModal from "../components/EmailVerificationModal";
import AuthLayout from "../components/AuthLayout";

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const { sendSignupVerification, verifySignup, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Auto-dismiss general error after 5 seconds
  useAutoCloseError(
    errors.submit || null,
    () => {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.submit;
        return newErrors;
      });
    },
    5000,
  );

  const handleSendVerification = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    } else if (!formData.email.toLowerCase().endsWith("@gmail.com")) {
      newErrors.email = "Email must be a Gmail address (@gmail.com)";
    }

    const passwordErrors: string[] = [];
    if (formData.password.length < 8) {
      passwordErrors.push("at least 8 characters");
    }
    if (!/[a-z]/.test(formData.password)) {
      passwordErrors.push("lowercase letter");
    }
    if (!/[A-Z]/.test(formData.password)) {
      passwordErrors.push("uppercase letter");
    }
    if (!/[0-9]/.test(formData.password)) {
      passwordErrors.push("number");
    }
    if (!/[!@#$%^&*]/.test(formData.password)) {
      passwordErrors.push("special character (!@#$%^&*)");
    }

    if (passwordErrors.length > 0) {
      newErrors.password = `Password needs: ${passwordErrors.join(", ")}`;
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setErrors({});

      const result = await sendSignupVerification(formData.email);
      if (result.success) {
        setIsVerificationModalOpen(true);
      } else {
        if (result.errors && Array.isArray(result.errors)) {
          const backendErrors: { [key: string]: string } = {};
          for (const error of result.errors) {
            if (error.includes("Email") || error.includes("@gmail"))
              backendErrors.email = error;
            else backendErrors.submit = error;
          }
          if (Object.keys(backendErrors).length > 0) {
            setErrors(backendErrors);
          } else {
            setErrors({
              submit: result.message || "Failed to send verification code",
            });
          }
        } else {
          setErrors({
            submit: result.message || "Failed to send verification code",
          });
        }
      }
    } catch (error: any) {
      setErrors({
        submit:
          error.message ||
          "Failed to send verification code. Please try again.",
      });
    }
  };

  const handleVerifyCode = async (verificationCode: string) => {
    try {
      const result = await verifySignup(
        formData.email,
        verificationCode,
        formData.name,
        formData.password,
      );

      if (result.success) {
        setFormData({
          name: "",
          email: "",
          password: "",
          confirmPassword: "",
        });

        setTimeout(() => {
          navigate("/login", {
            state: {
              signupSuccess: true,
              message: "Account created successfully! Please log in.",
            },
          });
        }, 1500);
      } else {
        throw new Error(result.message || "Verification failed");
      }
    } catch (error: any) {
      throw error;
    }
  };

  const handleResendCode = async () => {
    try {
      const result = await sendSignupVerification(formData.email);
      if (!result.success) {
        setErrors({ submit: result.message || "Failed to resend code" });
      }
    } catch (error: any) {
      setErrors({ submit: error.message || "Failed to resend code" });
    }
  };

  // Password requirement checks for visual indicators
  const reqLength = formData.password.length >= 8;
  const reqUpper = /[A-Z]/.test(formData.password);
  const reqLower = /[a-z]/.test(formData.password);
  const reqNumber = /[0-9]/.test(formData.password);
  const reqSpecial = /[!@#$%^&*]/.test(formData.password);

  return (
    <AuthLayout
      title="Begin Your Academic Journey"
      subtitle="Create your account to unlock personalized university recommendations, application forms, and smart AI guidance."
      badgeText="Create Account"
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm"
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Create Account
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Fill in your information to get started with CERKYL
          </p>
        </div>

        {/* Global Error Banner */}
        {errors.submit && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60"
          >
            <p className="text-sm font-medium text-red-800 dark:text-red-300 flex items-center">
              <FiAlertCircle className="w-4 h-4 mr-2 flex-shrink-0 text-red-600 dark:text-red-400" />
              {errors.submit}
            </p>
          </motion.div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSendVerification} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Full name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiUser className="w-5 h-5" />
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                className={`w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.name
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 dark:border-slate-700 focus:ring-primary-600/30 focus:border-primary-600"
                } rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 transition-colors`}
                required
              />
            </div>
            {errors.name && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
                {errors.name}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                @gmail.com only
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiMail className="w-5 h-5" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your.email@gmail.com"
                className={`w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.email
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 dark:border-slate-700 focus:ring-primary-600/30 focus:border-primary-600"
                } rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 transition-colors`}
                required
              />
            </div>
            {errors.email && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiLock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Create password"
                className={`w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.password
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 dark:border-slate-700 focus:ring-primary-600/30 focus:border-primary-600"
                } rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 transition-colors`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <FiEyeOff className="w-5 h-5" />
                ) : (
                  <FiEye className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
                {errors.password}
              </p>
            )}

            {/* Password Criteria Checklist */}
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
              <p className="font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Password requirements:
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <span className={`flex items-center gap-1 ${reqLength ? "text-green-600 dark:text-green-400 font-medium" : "text-slate-400"}`}>
                  <FiCheck className={`w-3.5 h-3.5 ${reqLength ? "opacity-100" : "opacity-40"}`} /> Min 8 chars
                </span>
                <span className={`flex items-center gap-1 ${reqUpper ? "text-green-600 dark:text-green-400 font-medium" : "text-slate-400"}`}>
                  <FiCheck className={`w-3.5 h-3.5 ${reqUpper ? "opacity-100" : "opacity-40"}`} /> Uppercase (A-Z)
                </span>
                <span className={`flex items-center gap-1 ${reqLower ? "text-green-600 dark:text-green-400 font-medium" : "text-slate-400"}`}>
                  <FiCheck className={`w-3.5 h-3.5 ${reqLower ? "opacity-100" : "opacity-40"}`} /> Lowercase (a-z)
                </span>
                <span className={`flex items-center gap-1 ${reqNumber ? "text-green-600 dark:text-green-400 font-medium" : "text-slate-400"}`}>
                  <FiCheck className={`w-3.5 h-3.5 ${reqNumber ? "opacity-100" : "opacity-40"}`} /> Number (0-9)
                </span>
                <span className={`flex items-center gap-1 col-span-2 ${reqSpecial ? "text-green-600 dark:text-green-400 font-medium" : "text-slate-400"}`}>
                  <FiCheck className={`w-3.5 h-3.5 ${reqSpecial ? "opacity-100" : "opacity-40"}`} /> Special char (!@#$%^&*)
                </span>
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Confirm password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <FiLock className="w-5 h-5" />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm password"
                className={`w-full pl-11 pr-11 py-3 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.confirmPassword
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 dark:border-slate-700 focus:ring-primary-600/30 focus:border-primary-600"
                } rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-base focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 transition-colors`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                {showConfirmPassword ? (
                  <FiEyeOff className="w-5 h-5" />
                ) : (
                  <FiEye className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors duration-150 flex items-center justify-center text-base shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Create Account
                <FiArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>
        </form>

        {/* Existing account link */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 inline-flex items-center ml-1 transition-colors"
            >
              Sign in <FiLogIn className="w-4 h-4 ml-1" />
            </button>
          </p>
        </div>
      </motion.div>

      {/* Email Verification Modal */}
      <EmailVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        onVerified={handleVerifyCode}
        onResendCode={handleResendCode}
        userEmail={formData.email}
      />
    </AuthLayout>
  );
};

export default Signup;
