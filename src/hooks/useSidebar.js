import { useState } from "react";

const useSidebar = () => {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarLocked, setSidebarLocked] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState("right");

  const toggleSidebarPosition = () => {
    setSidebarPosition((prev) => (prev === "right" ? "left" : "right"));
  };

  return {
    sidebarVisible,
    setSidebarVisible,
    sidebarHovered,
    setSidebarHovered,
    sidebarLocked,
    setSidebarLocked,
    sidebarPosition,
    setSidebarPosition,
    toggleSidebarPosition,
  };
};

export default useSidebar;
