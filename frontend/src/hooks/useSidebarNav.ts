import { useState, useEffect } from "react";

export function useSidebarNav() {
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

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return {
    isDesktop,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    closeSidebar,
  };
}
