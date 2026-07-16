export const getTimeBasedGreeting = (): string => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  } else if (hour >= 17 && hour < 20) {
    return "Good evening";
  } else {
    return "Good night";
  }
};

export const getPersonalizedGreeting = (
  userName?: string,
): {
  greeting: string;
  message: string;
} => {
  const timeGreeting = getTimeBasedGreeting();

  if (userName && userName !== "Guest User") {
    return {
      greeting: `${timeGreeting}, ${userName}`,
      message: getWelcomeBackMessage(userName),
    };
  } else if (userName === "Guest User") {
    return {
      greeting: "Welcome",
      message: "Let's help you find the perfect university.",
    };
  } else {
    return {
      greeting: "Welcome",
      message: "Let's help you find the perfect university.",
    };
  }
};

const getWelcomeBackMessage = (userName: string): string => {
  const messages = [
    `Welcome back, ${userName}! Ready to explore university options?`,
    `Great to see you again, ${userName}! What can I help you with today?`,
    `Hello ${userName}! Ready to continue your university journey?`,
    `Welcome back! How can I assist you with your university search today?`,
  ];

  const hash = userName.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  return messages[Math.abs(hash) % messages.length];
};

export const getContextualGreeting = (
  userName?: string,
  lastActivity?: string,
): string => {
  if (!userName) {
    return "Welcome! Let's get started with your university search.";
  }

  if (!lastActivity) {
    return getPersonalizedGreeting(userName).message;
  }

  const contextualMessages = {
    chat: `Welcome back, ${userName}! Ready to continue our conversation?`,
    forms: `Hello ${userName}! Need help with more university forms?`,
    assessment: `Hi ${userName}! Want to explore more program recommendations?`,
    universities: `Welcome back, ${userName}! Ready to discover more universities?`,
  };

  return (
    contextualMessages[lastActivity as keyof typeof contextualMessages] ||
    getPersonalizedGreeting(userName).message
  );
};

export default {
  getTimeBasedGreeting,
  getPersonalizedGreeting,
  getContextualGreeting,
};
