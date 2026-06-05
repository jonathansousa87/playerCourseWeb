import React, { useEffect, useState } from "react";
import LessonHeader from "./LessonHeader";

const useHTMLContent = (selectedLesson, selectedCourse) => {
  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    if (!selectedLesson || !selectedLesson.title.endsWith(".html")) return;

    const fileUrl = `/cursos/${selectedCourse.title}/${selectedLesson.path}`;

    fetch(fileUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        let content;
        try {
          content = new TextDecoder("utf-8").decode(buffer);
        } catch {
          content = new TextDecoder("iso-8859-1").decode(buffer);
        }

        content = content.replace(/\r\n/g, "\n");

        const hasCharset =
          content.includes("charset=") ||
          content.match(/<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/) !==
            null;

        let processedContent = content;

        if (!hasCharset) {
          if (content.includes("<head>")) {
            processedContent = content.replace(
              "<head>",
              '<head><meta charset="UTF-8">'
            );
          } else if (content.includes("<html>")) {
            processedContent = content.replace(
              "<html>",
              '<html><head><meta charset="UTF-8"></head>'
            );
          } else {
            processedContent =
              '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' +
              content +
              "</body></html>";
          }
        }

        if (
          hasCharset &&
          !content.includes('charset="UTF-8"') &&
          !content.includes("charset=UTF-8")
        ) {
          processedContent = processedContent.replace(
            /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i,
            '<meta charset="UTF-8">'
          );
        }

        const finalContent = processedContent.replace(
          /<\/head>/i,
          `<style>
            body { margin: 0 auto; padding: 40px; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; }
            p { font-size: 16px; margin-bottom: 1em; }
            h1 { font-size: 28px; margin-bottom: 1em; }
            h2 { font-size: 24px; margin-bottom: 1em; }
            h3 { font-size: 20px; margin-bottom: 1em; }
            code { font-size: 15px; background-color: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
            pre { background-color: #f4f4f4; padding: 15px; border-radius: 8px; overflow-x: auto; }
            pre code { background-color: transparent; padding: 0; }
            ul, ol { margin-bottom: 1em; padding-left: 2em; }
            li { margin-bottom: 0.5em; }
          </style></head>`
        );

        setHtmlContent(finalContent);
      })
      .catch((error) => {
        console.error("Erro ao carregar HTML:", error);
        setHtmlContent(
          "<h1>Erro ao carregar o conteúdo</h1><p>Não foi possível carregar o arquivo HTML.</p>"
        );
      });
  }, [selectedLesson, selectedCourse]);

  return htmlContent;
};

const handleIframeLoad = (e) => {
  try {
    const doc = e.target.contentDocument || e.target.contentWindow.document;
    if (!doc) return;

    const metaCharset = doc.querySelector("meta[charset]");
    if (!metaCharset) {
      const meta = doc.createElement("meta");
      meta.setAttribute("charset", "UTF-8");
      const head = doc.head || doc.getElementsByTagName("head")[0];
      if (head && head.firstChild) {
        head.insertBefore(meta, head.firstChild);
      }
    }

    const style = doc.createElement("style");
    style.textContent = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6; padding: 3rem 4rem; margin: 0; background: #ffffff; color: #333;
        max-width: 100%; box-sizing: border-box;
      }
      h1, h2, h3, h4, h5, h6 { color: #2d3748; margin-top: 1.5rem; margin-bottom: 1rem; }
      h1 { font-size: 2rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.25rem; }
      p { margin-bottom: 1rem; }
      ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
      li { margin-bottom: 0.5rem; }
      code { background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-family: 'Courier New', monospace; }
      pre { background: #1a202c; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 4px solid #4299e1; padding-left: 1rem; margin: 1rem 0; color: #4a5568; font-style: italic; }
      img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0; }
      table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
      th, td { border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; }
      th { background: #f7fafc; font-weight: 600; }
      a { color: #4299e1; text-decoration: none; }
      a:hover { text-decoration: underline; }
    `;
    const head = doc.head || doc.getElementsByTagName("head")[0];
    if (head) head.appendChild(style);
  } catch (error) {
    console.error("Erro ao ajustar charset do iframe:", error);
  }
};

const HTMLViewer = ({
  selectedLesson,
  selectedCourse,
  isCompleted,
  onToggleComplete,
  onBack,
}) => {
  const htmlContent = useHTMLContent(selectedLesson, selectedCourse);

  return (
    <div className="flex flex-col h-full">
      <LessonHeader
        title={selectedLesson.title}
        onBack={onBack}
        showComplete
        isCompleted={isCompleted}
        onToggleComplete={onToggleComplete}
      />
      <div className="flex-1 bg-gray-100 relative overflow-auto p-8">
        <div
          className="mx-auto bg-white shadow-xl rounded-lg"
          style={{ width: "1000px", minHeight: "100%" }}
        >
          <iframe
            srcDoc={htmlContent}
            className="w-full border-0 rounded-lg"
            style={{ height: "calc(100vh - 160px)", minHeight: "600px" }}
            title={selectedLesson.title}
            allowFullScreen
            sandbox="allow-same-origin allow-scripts allow-popups"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
};

export default HTMLViewer;
