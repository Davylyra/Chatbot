import React from "react";
import ChatSidebar from "./ChatSidebar";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  isDesktop?: boolean;
}

// Every page now uses the same sidebar as the chat page (chats in the
// middle, account menu at the bottom). The non-chat pages listen for
// "toggleMainSidebar" to expand it.
const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isDesktop = false }) => (
  <ChatSidebar
    isOpen={isOpen}
    onClose={onClose}
    isDesktop={isDesktop}
    toggleEvent="toggleMainSidebar"
  />
);

export default Sidebar;
