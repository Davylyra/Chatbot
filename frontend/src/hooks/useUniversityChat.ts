import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";

interface UniversityChatOptions {
  name: string;
  fullName: string;
  logo?: string;
}

export const useUniversityChat = () => {
  const navigate = useNavigate();
  const { currentConversation, saveCurrentConversation } = useAppStore();

  const startUniversityChat = (university: UniversityChatOptions) => {
    if (currentConversation) {
      saveCurrentConversation();
    }

    navigate("/chat", {
      state: {
        universityContext: {
          name: university.name,
          fullName: university.fullName,
          logo: university.logo,
        },
        forceNewConversation: true,
        initialMessage: `Tell me about ${university.fullName} - their programs, admission requirements, and application process.`,
      },
    });
  };

  return { startUniversityChat };
};
