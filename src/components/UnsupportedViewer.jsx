import React from "react";
import { FileText } from "lucide-react";
import LessonHeader from "./LessonHeader";

const UnsupportedViewer = ({
  selectedLesson,
  fileUrl,
  isCompleted,
  onToggleComplete,
  onBack,
}) => (
  <div className="flex flex-col h-full w-full">
    <LessonHeader
      title={selectedLesson.title}
      onBack={onBack}
      showComplete
      isCompleted={isCompleted}
      onToggleComplete={onToggleComplete}
    />
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-500" />
        <h3 className="text-xl font-semibold mb-2">
          Tipo de arquivo não suportado
        </h3>
        <p className="text-sm">
          Este tipo de arquivo não pode ser visualizado diretamente.
        </p>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white"
        >
          <FileText className="w-4 h-4 mr-2" />
          Baixar arquivo
        </a>
      </div>
    </div>
  </div>
);

export default UnsupportedViewer;
