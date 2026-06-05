import React from "react";
import LessonHeader from "./LessonHeader";

const PDFViewer = ({ selectedLesson, fileUrl, isCompleted, onToggleComplete, onBack }) => (
  <div className="flex flex-col h-full w-full">
    <LessonHeader
      title={selectedLesson.title}
      onBack={onBack}
      showComplete
      isCompleted={isCompleted}
      onToggleComplete={onToggleComplete}
    />
    <div className="flex-1 bg-gray-100 overflow-auto">
      <div
        className="mx-auto bg-white shadow-xl max-w-[1000px] w-full"
        style={{ height: "100vh" }}
      >
        <object
          data={fileUrl}
          type="application/pdf"
          className="w-full h-full"
        >
          <iframe
            src={fileUrl}
            className="w-full h-full"
            title={selectedLesson.title}
          >
            <a href={fileUrl}>Download PDF</a>
          </iframe>
        </object>
      </div>
    </div>
  </div>
);

export default PDFViewer;
