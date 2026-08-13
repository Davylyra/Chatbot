/**
 * Formatters Utility
 * Description: Utility functions for formatting prices, dates, and other data
 * Integration: Used throughout the app for consistent data display
 */

export interface PriceFormatOptions {
  currency?: string;
  locale?: string;
  showSymbol?: boolean;
  precision?: number;
}

export interface DateFormatOptions {
  format?: "short" | "medium" | "long" | "relative";
  locale?: string;
  includeTime?: boolean;
}

/**
 * Format price with proper currency and locale.
 * Accepts null/undefined for a price that hasn't been set yet - returns a
 * plain "not yet announced" string rather than formatting 0 or NaN as if
 * it were a real, confirmed price.
 */
export const formatPrice = (
  amount: number | null | undefined,
  options: PriceFormatOptions = {},
): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "Not yet announced";
  }

  const {
    currency = "GHS",
    locale = "en-GH",
    showSymbol = true,
    precision = 2,
  } = options;

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });

    const formatted = formatter.format(amount);

    // For Ghanaian Cedi, use ₵ symbol instead of GHS
    if (currency === "GHS" && showSymbol) {
      return formatted.replace("GHS", "₵");
    }

    return formatted;
  } catch {
    return `${currency} ${amount.toFixed(precision)}`;
  }
};

/**
 * Format date with various options.
 * Accepts null/undefined for a date that hasn't been set yet.
 *
 * IMPORTANT: this must check for null/undefined BEFORE constructing
 * `new Date(dateString)` - `new Date(null)` does not throw or produce an
 * invalid date, it silently resolves to the Unix epoch (1 Jan 1970), which
 * would previously have rendered as if it were a real, confirmed date.
 */
export const formatDate = (
  dateString: string | null | undefined,
  options: DateFormatOptions = {},
): string => {
  if (!dateString) {
    return "Not yet announced";
  }

  const { format = "medium", locale = "en-GH", includeTime = false } = options;

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    const now = new Date();
    const diffInDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (format === "relative") {
      if (diffInDays === 0) return "Today";
      if (diffInDays === 1) return "Tomorrow";
      if (diffInDays === -1) return "Yesterday";
      if (diffInDays > 0 && diffInDays <= 7)
        return `In ${diffInDays} day${diffInDays > 1 ? "s" : ""}`;
      if (diffInDays < 0 && diffInDays >= -7)
        return `${Math.abs(diffInDays)} day${Math.abs(diffInDays) > 1 ? "s" : ""} ago`;
    }

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month:
        format === "short" ? "short" : format === "long" ? "long" : "numeric",
      day: "numeric",
    };

    if (includeTime) {
      formatOptions.hour = "2-digit";
      formatOptions.minute = "2-digit";
    }

    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  } catch (error) {
    return "Invalid Date";
  }
};

/**
 * Format deadline with status indicator.
 * Accepts null/undefined for a deadline that hasn't been announced yet -
 * returns a distinct "not_set" status rather than treating an unset
 * deadline as if it were a real date decades in the past (see formatDate).
 * daysLeft is null in that case since there's nothing to count down to.
 */
export const formatDeadline = (
  deadline: string | null | undefined,
): {
  formatted: string;
  status: "expired" | "urgent" | "warning" | "normal" | "not_set";
  daysLeft: number | null;
} => {
  if (!deadline) {
    return {
      formatted: "Deadline not yet announced",
      status: "not_set",
      daysLeft: null,
    };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);

  if (isNaN(deadlineDate.getTime())) {
    return {
      formatted: "Deadline not yet announced",
      status: "not_set",
      daysLeft: null,
    };
  }

  const daysLeft = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  let status: "expired" | "urgent" | "warning" | "normal" = "normal";

  if (daysLeft < 0) {
    status = "expired";
  } else if (daysLeft <= 3) {
    status = "urgent";
  } else if (daysLeft <= 7) {
    status = "warning";
  }

  const formatted = formatDate(deadline, { format: "medium" });

  return {
    formatted,
    status,
    daysLeft,
  };
};

/**
 * Format form status for display
 */
export const formatFormStatus = (
  status: string,
): {
  text: string;
  color: string;
  bgColor: string;
} => {
  switch (status) {
    case "available":
      return {
        text: "Available",
        color: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/30",
      };
    case "expired":
      return {
        text: "Expired",
        color: "text-red-600 dark:text-red-400",
        bgColor: "bg-red-100 dark:bg-red-900/30",
      };
    case "not_yet_open":
      return {
        text: "Not Yet Open",
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
      };
    case "sold_out":
      return {
        text: "Sold Out",
        color: "text-orange-600 dark:text-orange-400",
        bgColor: "bg-orange-100 dark:bg-orange-900/30",
      };
    default:
      return {
        text: "Unknown",
        color: "text-gray-600 dark:text-gray-400",
        bgColor: "bg-gray-100 dark:bg-gray-900/30",
      };
  }
};

/**
 * Format currency symbol
 */
export const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    GHS: "₵",
    USD: "$",
    EUR: "€",
    GBP: "£",
    NGN: "₦",
    KES: "KSh",
    ZAR: "R",
  };

  return symbols[currency] || currency;
};

/**
 * Parse price string to number
 */
export const parsePrice = (priceString: string): number => {
  const cleaned = priceString.replace(/[^\d.,]/g, "");
  return parseFloat(cleaned.replace(",", ".")) || 0;
};

/**
 * Format large numbers (e.g., student counts)
 */
export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
};

/**
 * Format file size
 */
export const formatFileSize = (bytes: number): string => {
  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) return "0 Bytes";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
};

/**
 * Format phone number (Ghana format)
 */
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    return `+233 ${cleaned.slice(1, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }

  if (cleaned.length === 13 && cleaned.startsWith("233")) {
    return `+233 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
  }

  return phone; // Return original if format not recognized
};
