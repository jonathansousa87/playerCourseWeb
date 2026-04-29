import React, { createContext, useContext } from "react";

const CourseContext = createContext(null);

export const CourseProvider = ({ value, children }) => (
  <CourseContext.Provider value={value}>{children}</CourseContext.Provider>
);

export const useCourse = () => {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error("useCourse must be used within a CourseProvider");
  }
  return context;
};
