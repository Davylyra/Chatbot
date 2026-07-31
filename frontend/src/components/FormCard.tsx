import React, { memo } from "react";
import { motion } from "framer-motion";
import {
  FiShoppingCart,
  FiCalendar,
  FiMessageCircle,
  FiClock,
} from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import {
  formatDeadline,
  formatFormStatus,
  getCurrencySymbol,
} from "../utils/formatters";
import { useUniversityChat } from "../hooks/useUniversityChat";

interface FormCardProps {
  universityName: string;
  fullName: string;
  formPrice: number | string;
  currency?: string;
  deadline: string;
  isAvailable: boolean;
  onBuyClick: () => void;
  logo?: string;
  status?: "available" | "expired" | "not_yet_open" | "sold_out";
  daysUntilDeadline?: number;
  lastUpdated?: string;
}

const FormCard: React.FC<FormCardProps> = memo(
  ({
    universityName,
    fullName,
    formPrice,
    currency = "GHS",
    deadline,
    isAvailable,
    onBuyClick,
    logo,
    status = "available",
    daysUntilDeadline,
    lastUpdated: _lastUpdated,
  }) => {
    const { theme } = useTheme();
    const { startUniversityChat } = useUniversityChat();

    const isDisabled = !isAvailable || status === "expired";

    const handleChatClick = () => {
      startUniversityChat({
        name: universityName,
        fullName: fullName,
        logo: logo,
      });
    };

    const formStatusObj = formatFormStatus(status);
    const deadlineObj = formatDeadline(deadline);

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.25 }}
        className={`group relative p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between ${
          theme === "dark"
            ? "bg-slate-900/80 hover:bg-slate-900 border-slate-800/90 shadow-xl hover:border-primary-500/50 hover:shadow-primary-500/10"
            : "bg-white hover:bg-slate-50/80 border-slate-200/80 shadow-md hover:border-primary-300 hover:shadow-xl"
        }`}
      >
        {/* Header Row */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center space-x-3 min-w-0">
              {logo ? (
                <div className="w-13 h-13 rounded-2xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-105 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 p-2 shadow-xs shrink-0">
                  <img
                    src={logo}
                    alt={`${universityName} logo`}
                    className="w-9 h-9 object-contain rounded-xl"
                  />
                </div>
              ) : (
                <div className="w-13 h-13 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md shrink-0">
                  {universityName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-lg text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {universityName}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium">
                  {fullName}
                </p>
              </div>
            </div>

            {/* Status Pill */}
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider shrink-0 shadow-2xs ${formStatusObj.bgColor} ${formStatusObj.color}`}
            >
              {formStatusObj.text}
            </span>
          </div>

          {/* Form Details Grid */}
          <div className="grid grid-cols-2 gap-3 my-5 p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            {/* Price Box */}
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-center font-extrabold text-xs shrink-0">
                {getCurrencySymbol(currency)}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-semibold">
                  Form Voucher
                </span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {typeof formPrice === "number"
                    ? `${getCurrencySymbol(currency)} ${formPrice.toFixed(2)}`
                    : formPrice}
                </span>
              </div>
            </div>

            {/* Deadline Box */}
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary-100 dark:bg-primary-950/80 text-primary-600 dark:text-primary-400 border border-primary-200/80 dark:border-primary-800/80 flex items-center justify-center shrink-0">
                <FiCalendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-semibold">
                  Deadline
                </span>
                <span className="font-bold text-xs text-slate-900 dark:text-white block truncate">
                  {deadlineObj.formatted}
                </span>
                {daysUntilDeadline !== undefined && (
                  <span
                    className={`text-[10px] font-extrabold flex items-center gap-1 ${
                      daysUntilDeadline < 0
                        ? "text-red-500"
                        : daysUntilDeadline <= 14
                        ? "text-amber-500"
                        : "text-emerald-500"
                    }`}
                  >
                    <FiClock className="w-2.5 h-2.5" />
                    {daysUntilDeadline < 0
                      ? `Expired (${Math.abs(daysUntilDeadline)}d ago)`
                      : `${daysUntilDeadline} days left`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleChatClick}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60"
            title={`Ask AI Advisor about ${universityName}`}
          >
            <FiMessageCircle className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            <span>AI Advisor</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: isDisabled ? 1 : 1.02 }}
            whileTap={{ scale: isDisabled ? 1 : 0.98 }}
            onClick={onBuyClick}
            disabled={isDisabled}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 shadow-md ${
              !isDisabled
                ? "bg-primary-600 hover:bg-primary-700 text-white shadow-primary-600/25 active:scale-95"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none"
            }`}
          >
            <FiShoppingCart className="w-3.5 h-3.5" />
            <span>{isDisabled ? "Closed" : "Buy Form"}</span>
          </motion.button>
        </div>
      </motion.div>
    );
  }
);

FormCard.displayName = "FormCard";

export default FormCard;
