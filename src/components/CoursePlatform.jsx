import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileCode,
  FileText,
  FolderOpen,
  MonitorPlay,
  Settings,
  Play,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import Collapsible from 'react-collapsible';

const getFileIcon = (filename) => {
  if (filename.match(/\.(mp4|webm|ts|m3u8)$/i)) {
    return <MonitorPlay className="w-5 h-5 mr-2 text-blue-500" />;
  } else if (filename.endsWith(".pdf")) {
    return <FileText className="w-5 h-5 mr-2 text-red-500" />;
  } else if (filename.endsWith(".html")) {
    return <FileCode className="w-5 h-5 mr-2 text-purple-500" />;
  }
  return <FileText className="w-5 h-5 mr-2 text-gray-500" />;
};


// Simplificado para lidar melhor com os cliques em subpastas
const ModuleItem = ({
  item,
  courseTitle,
  onSelectLesson,
  completedLessons,
  level = 0,
  expandedModules,
  toggleModuleExpansion,
  selectedLesson,
  videoDurations = {},
  loadingVideos = new Set(),
  formatTime,
  toggleLessonComplete,
}) => {
  const isModule = item.type === "module";
  const isExpanded = isModule && (expandedModules[item.path] || false);
  const isSelected = selectedLesson && selectedLesson.path === item.path;
  const isVideo = !isModule && item.title && item.title.match(/\.(mp4|webm|ts|m3u8)$/i);
  
  // Carregar duração do vídeo se for um vídeo - TEMPORARIAMENTE DESABILITADO
  // React.useEffect(() => {
  //   if (isVideo && !videoDurations[item.path]) {
  //     getVideoDuration(item.path);
  //   }
  // }, [isVideo, item.path, videoDurations, getVideoDuration]);

  const isCompleted = isModule
    ? item.content &&
      item.content.every((subItem) => {
        if (subItem.type === "lesson") {
          return completedLessons[courseTitle]?.[subItem.path] || false;
        }
        return false;
      })
    : completedLessons[courseTitle]?.[item.path] || false;

  // Renderizar um módulo (pasta)
  if (isModule) {
    const isSubModule = level > 0;
    const triggerElement = (
      <div className={`group relative flex items-center w-full px-4 py-4 transition-all duration-300 cursor-pointer ${
        isSubModule 
          ? 'border-l-2 border-t border-l-slate-600/40 border-t-slate-600/20' 
          : 'border-l-2 border-t border-l-transparent border-t-slate-700/20'
      } ${
        isCompleted
          ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-400/15 shadow-sm'
          : isExpanded 
            ? isSubModule 
              ? 'bg-gradient-to-r from-slate-700/30 to-slate-600/30 border-l-slate-500/60 shadow-sm'
              : 'bg-gradient-to-r from-slate-800/40 to-slate-700/40 shadow-sm'
            : isSubModule
              ? 'hover:bg-gradient-to-r hover:from-slate-700/20 hover:to-slate-600/20 hover:border-l-slate-500/50'
              : 'hover:bg-gradient-to-r hover:from-slate-800/30 hover:to-slate-700/30'
      }`}>
        <div className={`flex items-center justify-center w-8 h-8 transition-all duration-300 mr-4 ${
          isExpanded 
            ? isSubModule
              ? 'bg-slate-500/25 text-slate-300' 
              : 'bg-slate-600/30 text-slate-200'
            : 'bg-slate-700/40 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300'
        }`}>
          {isExpanded ? 
            <ChevronDown className="w-4 h-4 transition-transform duration-300" /> : 
            <ChevronRight className="w-4 h-4 transition-transform duration-300" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-base transition-colors duration-300 leading-tight ${
            isCompleted 
              ? 'text-emerald-100' 
              : isExpanded 
                ? 'text-white' 
                : 'text-gray-200 group-hover:text-white'
          }`} style={{
            wordBreak: 'break-word',
            whiteSpace: 'normal'
          }}>
            {item.title}
          </h3>
          <p className={`text-xs mt-1 transition-colors duration-300 ${
            isCompleted 
              ? 'text-emerald-300' 
              : 'text-gray-400'
          }`}>
            {item.content?.length || 0} {item.content?.length === 1 ? 'item' : 'itens'}
            {isCompleted && ' ✓ Completo'}
          </p>
        </div>
      </div>
    );

    return (
      <div className="mb-2">
        <Collapsible 
          trigger={triggerElement}
          open={isExpanded}
          onTriggerOpening={() => !isExpanded && toggleModuleExpansion(item.path)}
          onTriggerClosing={() => isExpanded && toggleModuleExpansion(item.path)}
          transitionTime={300}
          easing="ease-in-out"
        >
          {item.content && (
            <div className="mt-2 space-y-1">
              {item.content.map((child, idx) => (
                <ModuleItem
                  key={idx}
                  item={child}
                  courseTitle={courseTitle}
                  onSelectLesson={onSelectLesson}
                  completedLessons={completedLessons}
                  level={level + 1}
                  expandedModules={expandedModules}
                  toggleModuleExpansion={toggleModuleExpansion}
                  selectedLesson={selectedLesson}
                  videoDurations={videoDurations}
                  loadingVideos={loadingVideos}
                  formatTime={formatTime}
                  toggleLessonComplete={toggleLessonComplete}
                />
              ))}
            </div>
          )}
        </Collapsible>
      </div>
    );
  }

  // Renderizar uma lição (arquivo)
  const isInSubModule = level > 0;
  return (
    <div
      className={`group relative py-3 px-4 transition-all duration-300 cursor-pointer mb-1 ${
        isInSubModule 
          ? 'border-l-2 border-t border-l-slate-600/30 border-t-slate-600/15' 
          : 'border-l-2 border-t border-l-transparent border-t-slate-700/15'
      } ${
        isSelected 
          ? "bg-gradient-to-r from-blue-600/25 to-blue-500/25 border-l-blue-400/50 shadow-sm" 
          : isCompleted
            ? isInSubModule
              ? "bg-gradient-to-r from-slate-700/20 to-slate-600/20 border-l-slate-500/40 hover:from-slate-700/25 hover:to-slate-600/25"
              : "bg-gradient-to-r from-slate-800/25 to-slate-700/25 hover:from-slate-800/30 hover:to-slate-700/30"
            : isInSubModule
              ? "hover:bg-gradient-to-r hover:from-slate-700/15 hover:to-slate-600/15 hover:border-l-slate-500/40"
              : "hover:bg-gradient-to-r hover:from-slate-800/20 hover:to-slate-700/20"
      }`}
      onClick={() => onSelectLesson(item)}
    >
      <div className="flex items-start gap-3">
        <div 
          className={`flex items-center justify-center w-6 h-6 mt-1 transition-all duration-300 flex-shrink-0 cursor-pointer ${
            isCompleted 
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300"
              : isSelected
                ? "bg-blue-500/25 text-blue-300 hover:bg-blue-500/35 hover:text-blue-200"
                : "bg-slate-700/40 text-slate-400 group-hover:bg-slate-600/50 group-hover:text-slate-300 hover:bg-slate-600/60 hover:text-slate-200"
          }`}
          onClick={(e) => {
            e.stopPropagation(); // Impede que clique abra a aula
            toggleLessonComplete(item);
          }}
          title={isCompleted ? "Marcar como pendente" : "Marcar como concluída"}
        >
          {isCompleted ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <Circle className="w-3 h-3" />
          )}
        </div>

        <div className={`flex items-center justify-center w-6 h-6 mt-1 transition-all duration-300 flex-shrink-0 ${
          isVideo 
            ? isSelected
              ? "bg-red-500/20 text-red-300"
              : isInSubModule
                ? "bg-red-500/12 text-red-400 group-hover:bg-red-500/18"
                : "bg-red-500/15 text-red-400 group-hover:bg-red-500/25"
            : isSelected
              ? "bg-violet-500/20 text-violet-300"
              : isInSubModule
                ? "bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/15"
                : "bg-violet-500/15 text-violet-400 group-hover:bg-violet-500/25"
        }`}>
          <div className="scale-75">
            {getFileIcon(item.title)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className={`font-medium text-sm leading-relaxed transition-all duration-300 ${
                isCompleted 
                  ? "text-gray-400 line-through group-hover:text-gray-300" 
                  : isSelected 
                    ? "text-white font-semibold" 
                    : "text-gray-200 group-hover:text-white"
              }`} title={item.title} style={{
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                lineHeight: '1.4'
              }}>
                {item.title}
              </h4>
            </div>
            
            {isVideo && formatTime && (
              <div className={`flex items-center px-2 py-1 text-xs transition-all duration-300 mt-0.5 flex-shrink-0 ${
                isCompleted 
                  ? "bg-slate-600/25 text-slate-400"
                  : isSelected 
                    ? "bg-blue-500/25 text-blue-200 font-medium" 
                    : isInSubModule
                      ? "bg-slate-700/30 text-slate-400 group-hover:bg-slate-600/40"
                      : "bg-slate-800/40 text-slate-300 group-hover:bg-slate-700/50"
              }`}>
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                {videoDurations[item.path] 
                  ? formatTime(videoDurations[item.path])
                  : loadingVideos.has(item.path) 
                    ? "..." 
                    : "--:--"
                }
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CourseCard = ({ title, description }) => (
  <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 h-full">
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center mb-4">
        <FolderOpen className="w-6 h-6 mr-3 text-blue-500" />
        <h3 className="text-xl font-semibold text-gray-100">{title}</h3>
      </div>
      <p className="text-gray-400 text-sm flex-grow">{description}</p>
      <div className="mt-4 flex items-center text-blue-500 text-sm">
        <Play className="w-4 h-4 mr-1" />
        <span>Iniciar curso</span>
      </div>
    </div>
  </div>
);

// Função para aplanar a estrutura de módulos e lições
const flattenCourseContent = (content) => {
  return content.reduce((acc, item) => {
    if (item.type === "lesson") {
      acc.push(item);
    } else if (item.type === "module" && item.content) {
      acc.push(...flattenCourseContent(item.content));
    }
    return acc;
  }, []);
};

// Encontrar a próxima lição
const findNextLesson = (content, currentPath) => {
  const allLessons = flattenCourseContent(content);
  const currentIndex = allLessons.findIndex((lesson) => lesson.path === currentPath);
  return currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
};

const MainComponent = () => {
  const [view, setView] = useState("courses");
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [completedLessons, setCompletedLessons] = useState({});
  const [loading, setLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarLocked, setSidebarLocked] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [coursesPath, setCoursesPath] = useState('/mnt/nvme2/kadabra/Downloads/cursos/');
  const [sidebarPosition, setSidebarPosition] = useState('right'); // 'right' ou 'left'
  const [showTopControls, setShowTopControls] = useState(false);
  const [showBottomControls, setShowBottomControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [expandedModules, setExpandedModules] = useState({});
  const [videoDurations, setVideoDurations] = useState({});
  const [loadingVideos, setLoadingVideos] = useState(new Set());
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState(null);
  const [clickCount, setClickCount] = useState(0);
  const [clickTimeout, setClickTimeout] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    // Carregar configuração do caminho dos cursos
    const loadCoursesPath = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/config/courses-path");
        const data = await response.json();
        setCoursesPath(data.path);
      } catch (error) {
        console.error("Erro ao carregar caminho dos cursos:", error);
      }
    };

    const loadCourses = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/courses");
        const courseData = await response.json();

        // Processar a estrutura do curso para identificar subpastas
        courseData.forEach((course) => {
          processCourseStructure(course);
        });

        setCourses(courseData);
        console.log("Courses loaded:", courseData.length, "courses");

        // Carregar durações do cache do servidor
        try {
          const durationsResponse = await fetch("http://localhost:3001/api/video-durations");
          const cachedDurations = await durationsResponse.json();
          setVideoDurations(cachedDurations);
          console.log("Durações carregadas do cache:", Object.keys(cachedDurations).length, "vídeos");
        } catch (error) {
          console.error("Erro ao carregar cache de durações:", error);
        }

        const savedProgress = localStorage.getItem("courseProgress");
        if (savedProgress) {
          setCompletedLessons(JSON.parse(savedProgress));
        }

        const savedRate = localStorage.getItem("preferredPlaybackRate");
        if (savedRate) {
          setPlaybackRate(parseFloat(savedRate));
        }

        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar cursos:", error);
        setLoading(false);
      }
    };

    // Processar a estrutura para identificar subpastas como módulos
    const processCourseStructure = (course) => {
      if (!course.content) return;

      // Mapear caminhos de pasta para objetos de módulo
      const moduleMap = new Map();

      // Primeiro passo: identificar todas as subpastas como módulos
      course.content.forEach((item) => {
        if (item.type === "lesson" && item.path) {
          const pathParts = item.path.split("/");

          // Se há mais de 2 partes (curso/subpasta/arquivo), é uma subpasta
          if (pathParts.length > 2) {
            // Criar módulos para cada nível de subpasta
            let currentPath = pathParts[0];

            for (let i = 1; i < pathParts.length - 1; i++) {
              currentPath += "/" + pathParts[i];

              if (!moduleMap.has(currentPath)) {
                moduleMap.set(currentPath, {
                  type: "module",
                  title: pathParts[i],
                  path: currentPath,
                  content: [],
                });
              }
            }
          }
        }
      });

      // Segundo passo: atribuir lições e módulos aos seus módulos pai
      const rootContent = [];

      course.content.forEach((item) => {
        if (item.type === "lesson" && item.path) {
          const pathParts = item.path.split("/");

          if (pathParts.length <= 2) {
            // Lição de nível superior
            rootContent.push(item);
          } else {
            // Obter o caminho do módulo pai
            const parentPath = pathParts.slice(0, -1).join("/");
            const parentModule = moduleMap.get(parentPath);

            if (parentModule) {
              parentModule.content.push(item);
            }
          }
        } else if (item.type === "module") {
          // Módulos existentes definidos
          rootContent.push(item);
        }
      });

      // Adicionar módulos de subpasta que são filhos diretos do curso
      moduleMap.forEach((module, path) => {
        const pathParts = path.split("/");

        if (pathParts.length === 2) {
          rootContent.push(module);
        }
      });

      // Tratar o aninhamento de módulos de subpasta
      moduleMap.forEach((module, path) => {
        const pathParts = path.split("/");

        if (pathParts.length > 2) {
          const parentPath = pathParts.slice(0, -1).join("/");
          const parentModule = moduleMap.get(parentPath);

          if (parentModule && !parentModule.content.includes(module)) {
            parentModule.content.push(module);
          }
        }
      });

      course.content = rootContent;
    };

    loadCoursesPath();
    loadCourses();
  }, []);

  // Efeito para carregar conteúdo HTML quando um arquivo HTML é selecionado
  useEffect(() => {
    if (selectedLesson && selectedLesson.title.endsWith(".html")) {
      const fileUrl = `http://localhost:3001/cursos/${selectedCourse.title}/${selectedLesson.path}`;

      // Abordagem mais robusta para tratar problemas de codificação
      fetch(fileUrl)
        .then((response) => response.arrayBuffer()) // Usamos arrayBuffer para preservar os bytes originais
        .then((buffer) => {
          // Tenta primeiro decodificar como UTF-8
          let content;
          try {
            content = new TextDecoder("utf-8").decode(buffer);
          } catch (e) {
            // Fallback para ISO-8859-1 (Latin1) se UTF-8 falhar
            console.warn("Decodificação UTF-8 falhou, tentando ISO-8859-1", e);
            content = new TextDecoder("iso-8859-1").decode(buffer);
          }

          // Normaliza quebras de linha
          content = content.replace(/\r\n/g, "\n");

          // Verifica se já tem meta charset
          const hasCharset =
            content.includes("charset=") || content.match(/<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/) !== null;

          let processedContent = content;

          // Se não tem charset, adiciona
          if (!hasCharset) {
            if (content.includes("<head>")) {
              processedContent = content.replace("<head>", '<head><meta charset="UTF-8">');
            } else if (content.includes("<html>")) {
              processedContent = content.replace("<html>", '<html><head><meta charset="UTF-8"></head>');
            } else {
              // Se não tem head nem html, adiciona documento completo
              processedContent =
                '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + content + "</body></html>";
            }
          }

          // Força o charset para UTF-8 se já existe algum outro
          if (hasCharset && !content.includes('charset="UTF-8"') && !content.includes("charset=UTF-8")) {
            processedContent = processedContent.replace(
              /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i,
              '<meta charset="UTF-8">'
            );
          }

          // Adiciona estilos para melhorar a visualização
          const finalContent = processedContent.replace(
            /<\/head>/i,
            `<style>
              body { 
                margin: 0 auto; 
                padding: 40px; 
                font-family: Arial, sans-serif;
                font-size: 16px;
                line-height: 1.6;
              }
              p { 
                font-size: 16px;
                margin-bottom: 1em;
              }
              h1 { 
                font-size: 28px;
                margin-bottom: 1em;
              }
              h2 { 
                font-size: 24px;
                margin-bottom: 1em;
              }
              h3 { 
                font-size: 20px;
                margin-bottom: 1em;
              }
              code {
                font-size: 15px;
                background-color: #f4f4f4;
                padding: 2px 6px;
                border-radius: 4px;
              }
              pre {
                background-color: #f4f4f4;
                padding: 15px;
                border-radius: 8px;
                overflow-x: auto;
              }
              pre code {
                background-color: transparent;
                padding: 0;
              }
              ul, ol {
                margin-bottom: 1em;
                padding-left: 2em;
              }
              li {
                margin-bottom: 0.5em;
              }
            </style></head>`
          );

          setHtmlContent(finalContent);
        })
        .catch((error) => {
          console.error("Erro ao carregar HTML:", error);
          setHtmlContent("<h1>Erro ao carregar o conteúdo</h1><p>Não foi possível carregar o arquivo HTML.</p>");
        });
    }
  }, [selectedLesson, selectedCourse]);

  // Toggle para expandir/recolher módulos
  const toggleModuleExpansion = (modulePath) => {
    if (!modulePath) return;

    setExpandedModules((prev) => ({
      ...prev,
      [modulePath]: !prev[modulePath],
    }));
  };

  // Função para salvar configuração do caminho dos cursos
  const saveCoursesPath = async (newPath) => {
    try {
      const response = await fetch("http://localhost:3001/api/config/courses-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: newPath }),
      });
      
      if (response.ok) {
        setCoursesPath(newPath);
        setShowConfigModal(false);
        // Recarregar cursos com o novo caminho
        window.location.reload(); // Recarrega a página para aplicar as mudanças
      } else {
        alert("Erro ao salvar configuração");
      }
    } catch (error) {
      console.error("Erro ao salvar caminho dos cursos:", error);
      alert("Erro ao salvar configuração");
    }
  };

  // Função para verificar se um módulo está completo
  const isModuleComplete = (moduleContent, courseTitle) => {
    if (!moduleContent || !Array.isArray(moduleContent)) return false;
    
    // Se não há lições completas no curso, nenhum módulo está completo
    const courseProgress = completedLessons[courseTitle];
    if (!courseProgress || Object.keys(courseProgress).length === 0) {
      return false;
    }
    
    return moduleContent.every(item => {
      if (item.type === 'lesson') {
        return completedLessons[courseTitle]?.[item.path] || false;
      } else if (item.type === 'module') {
        return isModuleComplete(item.content, courseTitle);
      }
      return false;
    });
  };

  // Função para verificar se um módulo contém a lição atual
  const moduleContainsCurrentLesson = (moduleContent, lessonPath) => {
    return moduleContent.some(item => {
      if (item.type === 'lesson') {
        return item.path === lessonPath;
      } else if (item.type === 'module') {
        return moduleContainsCurrentLesson(item.content, lessonPath);
      }
      return false;
    });
  };

  // Auto-expandir apenas módulo da aula ativa e retrair módulos completos
  useEffect(() => {
    if (selectedLesson && selectedLesson.path && selectedCourse) {
      const newExpandedModules = {};
      
      // Função recursiva para processar módulos
      const processModules = (content) => {
        content.forEach(item => {
          if (item.type === 'module') {
            const modulePath = item.path;
            const isComplete = isModuleComplete(item.content, selectedCourse.title);
            const containsCurrentLesson = moduleContainsCurrentLesson(item.content, selectedLesson.path);
            
            // Expandir APENAS se contém a lição atual
            if (containsCurrentLesson) {
              newExpandedModules[modulePath] = true;
            } else {
              // Retrair todos os outros módulos (completos ou não)
              newExpandedModules[modulePath] = false;
            }

            // Processar submódulos recursivamente
            if (item.content) {
              processModules(item.content);
            }
          }
        });
      };

      processModules(selectedCourse.content);
      setExpandedModules(newExpandedModules);
    }
  }, [selectedLesson, selectedCourse, completedLessons]);

  const applyPlaybackRate = (videoElement) => {
    if (videoElement) {
      videoElement.playbackRate = playbackRate;
    }
  };


  // Função para carregar duração de um vídeo específico - OTIMIZADA
  const loadVideoDuration = async (videoPath) => {
    // Se já tem duração (mesmo que seja 0) ou está carregando, não faz nada
    if (videoDurations[videoPath] !== undefined || loadingVideos.has(videoPath)) {
      return;
    }

    // Marca como carregando
    setLoadingVideos(prev => new Set(prev).add(videoPath));

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = `http://localhost:3001/cursos/${encodeURIComponent(selectedCourse.title)}/${encodeURIComponent(videoPath)}`;
      
      await new Promise((resolve) => {
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoad);
          video.removeEventListener('error', onError);
          video.src = '';
        };

        const onLoad = async () => {
          const duration = video.duration || 0;
          setVideoDurations(prev => ({
            ...prev,
            [videoPath]: duration
          }));
          
          // Salvar no cache do servidor
          try {
            await fetch(`http://localhost:3001/api/video-durations/${encodeURIComponent(videoPath)}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ duration })
            });
          } catch (error) {
            console.error('Erro ao salvar duração no cache:', error);
          }
          
          cleanup();
          resolve();
        };

        const onError = () => {
          // Não sobrescrever se já existe uma duração válida
          setVideoDurations(prev => ({
            ...prev,
            [videoPath]: prev[videoPath] !== undefined ? prev[videoPath] : 0
          }));
          cleanup();
          resolve();
        };

        // Timeout de segurança
        setTimeout(() => {
          if (video.readyState === 0) {
            onError();
          }
        }, 5000);

        video.addEventListener('loadedmetadata', onLoad);
        video.addEventListener('error', onError);
      });
    } catch (error) {
      // Não sobrescrever se já existe uma duração válida
      setVideoDurations(prev => ({
        ...prev,
        [videoPath]: prev[videoPath] !== undefined ? prev[videoPath] : 0
      }));
    } finally {
      // Remove do conjunto de carregando
      setLoadingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoPath);
        return newSet;
      });
    }
  };

  // Capturar duração quando vídeo carrega no player principal
  useEffect(() => {
    if (selectedLesson && videoRef.current) {
      const video = videoRef.current;
      
      const handleLoadedMetadata = () => {
        if (selectedLesson.path && video.duration) {
          setVideoDurations(prev => ({
            ...prev,
            [selectedLesson.path]: video.duration
          }));
        }
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [selectedLesson]);

  // Carregar durações de todos os vídeos gradualmente - VERSÃO OTIMIZADA
  useEffect(() => {
    if (!selectedCourse || !selectedCourse.content) return;

    const getAllVideos = (content, videos = []) => {
      content.forEach(item => {
        if (item.type === 'lesson' && item.title && item.title.match(/\.(mp4|webm|ts|m3u8)$/i)) {
          videos.push(item.path);
        } else if (item.type === 'module' && item.content) {
          getAllVideos(item.content, videos);
        }
      });
      return videos;
    };

    const allVideos = getAllVideos(selectedCourse.content);
    console.log('Iniciando carregamento de durações para', allVideos.length, 'vídeos');
    
    // Carregar com delay escalonado maior para evitar sobrecarga
    allVideos.forEach((videoPath, index) => {
      setTimeout(async () => {
        await loadVideoDuration(videoPath);
      }, index * 500); // 500ms entre cada carregamento (mais espaçado)
    });
  }, [selectedCourse?.title]); // Dependência mais específica




  useEffect(() => {
    if (selectedLesson && videoRef.current) {
      const video = videoRef.current;
      
      const updateTime = () => {
        if (!isDragging) {
          setCurrentTime(video.currentTime);
        }
      };
      
      const updateDuration = () => setDuration(video.duration);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleVolumeChange = () => setVolume(video.volume);
      
      video.addEventListener('timeupdate', updateTime);
      video.addEventListener('loadedmetadata', updateDuration);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('volumechange', handleVolumeChange);
      
      // Auto-play
      video.play().catch((error) => {
        console.log("Autoplay foi impedido:", error);
      });
      applyPlaybackRate(video);
      
      return () => {
        video.removeEventListener('timeupdate', updateTime);
        video.removeEventListener('loadedmetadata', updateDuration);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('volumechange', handleVolumeChange);
      };
    }
  }, [selectedLesson, playbackRate, isDragging]);

  // Funções para controlar fullscreen customizado
  const enterFullscreen = async () => {
    const container = videoContainerRef.current;
    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
      } else if (container.mozRequestFullScreen) {
        await container.mozRequestFullScreen();
      } else if (container.msRequestFullscreen) {
        await container.msRequestFullscreen();
      }
    } catch (error) {
      console.error('Erro ao entrar em fullscreen:', error);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    } catch (error) {
      console.error('Erro ao sair de fullscreen:', error);
    }
  };

  // Detectar mudanças de tela cheia e remover indicadores
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      
      // Apenas detecta mudança de fullscreen - indicador de exit é uma limitação do browser
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      
      // Limpeza simples sem event listeners adicionais
    };
  }, []);

  // Controles baseados apenas em hover em fullscreen

  // Handlers de teclado para fullscreen e navegação
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Setas funcionam sempre (em fullscreen ou não)
      const video = videoRef.current;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          // Retroceder 10 segundos no vídeo atual
          if (video) {
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          // Avançar 10 segundos no vídeo atual
          if (video && duration) {
            video.currentTime = Math.min(duration, video.currentTime + 10);
          }
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          // Ir para vídeo anterior
          const allLessons = flattenCourseContent(selectedCourse.content);
          const currentIndex = allLessons.findIndex((lesson) => lesson.path === selectedLesson.path);
          if (currentIndex > 0) {
            const prevLesson = allLessons[currentIndex - 1];
            handleLessonSelect(prevLesson);
            
          }
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          // Ir para próximo vídeo
          const nextLesson = findNextLesson(selectedCourse.content, selectedLesson.path);
          if (nextLesson) {
            handleLessonSelect(nextLesson);
            
          }
          break;
      }

      // Teclas específicas para fullscreen
      if (isFullscreen) {
        switch (e.key) {
          case 'Escape':
            exitFullscreen();
            break;
          case 'f':
          case 'F':
            exitFullscreen();
            break;
          case ' ':
            e.preventDefault();
            if (video) {
              video.paused ? video.play() : video.pause();
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, selectedLesson, selectedCourse, duration]);

  // Cleanup dos timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, []);

  const changeGlobalPlaybackRate = (rate) => {
    setPlaybackRate(rate);
    const currentVideo = videoRef.current;
    applyPlaybackRate(currentVideo);
    localStorage.setItem("preferredPlaybackRate", rate);
  };

  // Funções para controles customizados
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (video) {
      if (isPlaying) {
        video.pause();
      } else {
        video.play();
      }
    }
  };

  // Função para lidar com cliques simples e duplos
  const handleVideoClick = () => {
    const currentCount = clickCount + 1;
    setClickCount(currentCount);
    
    if (clickTimeout) {
      clearTimeout(clickTimeout);
    }
    
    if (currentCount === 2) {
      // Duplo clique = toggle fullscreen
      if (isFullscreen) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
      // Reset imediato
      setClickCount(0);
      setClickTimeout(null);
    } else {
      // Primeiro clique - aguarda para ver se vem o segundo
      const timeout = setTimeout(() => {
        // Se chegou aqui, foi clique simples = play/pause
        togglePlayPause();
        setClickCount(0);
        setClickTimeout(null);
      }, 300);
      
      setClickTimeout(timeout);
    }
  };

  const handleTimelineClick = (e) => {
    const video = videoRef.current;
    const timeline = e.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    
    if (video && duration) {
      video.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Removida função duplicada - agora integrada no onMouseMove da timeline

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCourseSelect = (course) => {
    console.log("Course clicked:", course.title);
    console.log("Setting selectedCourse:", course);
    console.log("Setting view to lessons");
    setSelectedCourse(course);
    setView("lessons");
  };

  const handleLessonSelect = (lesson) => {
    setSelectedLesson(lesson);
  };

  const toggleLessonComplete = (lesson) => {
    const courseKey = selectedCourse.title;
    const wasCompleted = completedLessons[courseKey]?.[lesson.path];
    
    const newCompletedLessons = {
      ...completedLessons,
      [courseKey]: {
        ...completedLessons[courseKey],
        [lesson.path]: !wasCompleted,
      },
    };
    setCompletedLessons(newCompletedLessons);
    localStorage.setItem("courseProgress", JSON.stringify(newCompletedLessons));
    
    // Se marcou como completa (não estava completa antes), pular para próxima aula
    if (!wasCompleted) {
      const nextLesson = findNextLesson(selectedCourse.content, lesson.path);
      if (nextLesson) {
        setTimeout(() => {
          handleLessonSelect(nextLesson);
        }, 300); // Pequeno delay para dar feedback visual
      }
    }
  };

  const handleBack = () => {
    if (selectedLesson) {
      setSelectedLesson(null);
      setSidebarVisible(true);
    } else {
      setSelectedCourse(null);
      setView("courses");
    }
  };


  const renderLesson = () => {
    const isVideo = selectedLesson.title.match(/\.(mp4|webm|ts|m3u8)$/i);
    const isPDF = selectedLesson.title.endsWith(".pdf");
    const isHTML = selectedLesson.title.endsWith(".html");
    const fileUrl = `http://localhost:3001/cursos/${selectedCourse.title}/${selectedLesson.path}`;

    if (isVideo) {
      return (
        <div className="flex flex-col h-full">
          {/* Header com controles */}
          <div className="bg-gray-800 py-1 px-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold">{selectedLesson.title}</h2>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Voltar
                </button>
                <div className="flex items-center space-x-2">
                  {[1, 1.25, 1.5, 1.75].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changeGlobalPlaybackRate(rate)}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        playbackRate === rate ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
                <button
                  onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors flex items-center"
                  title={isFullscreen ? "Sair da Tela Cheia" : "Entrar em Tela Cheia"}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isFullscreen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6M21 3v6h-6M3 21v-6h6" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                    )}
                  </svg>
                  {isFullscreen ? "Sair" : "Tela Cheia"}
                </button>
              </div>
            </div>
          </div>

          {/* Container do vídeo */}
          <div 
            ref={videoContainerRef}
            className="flex-1 bg-gray-900 relative group video-container"
          >
            <video
              ref={videoRef}
              className="w-full h-full cursor-pointer"
              key={selectedLesson.path}
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              onClick={handleVideoClick}
              onTimeUpdate={(e) => {
                const video = e.target;
                if (
                  video &&
                  !completedLessons[selectedCourse.title]?.[selectedLesson.path] &&
                  video.currentTime >= video.duration - 1
                ) {
                  toggleLessonComplete(selectedLesson);
                }
              }}
              onEnded={async () => {
                if (!completedLessons[selectedCourse.title]?.[selectedLesson.path]) {
                  await toggleLessonComplete(selectedLesson);
                }
                const nextLesson = findNextLesson(selectedCourse.content, selectedLesson.path);
                if (nextLesson) {
                  handleLessonSelect(nextLesson);
                }
              }}
              src={fileUrl}
              autoPlay
            />

            {/* Área de trigger dos controles inferiores */}
            {isFullscreen && (
              <div 
                className="absolute bottom-0 left-0 w-full h-16 z-40 bg-transparent"
                onMouseEnter={() => setShowBottomControls(true)}
                onMouseLeave={() => setShowBottomControls(false)}
              />
            )}

            {/* Controles customizados elegantes */}
            <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 transition-all duration-300 ease-in-out z-50 ${
              isFullscreen 
                ? (showBottomControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full')
                : 'opacity-100 translate-y-0'
            }`}
            style={{ pointerEvents: isFullscreen ? (showBottomControls ? 'auto' : 'none') : 'auto' }}
            onMouseEnter={() => isFullscreen && setShowBottomControls(true)}
            onMouseLeave={() => isFullscreen && setShowBottomControls(false)}
            >
              {/* Timeline customizada elegante */}
              <div 
                className="custom-timeline mb-4 relative bg-white/20 rounded-full h-2 cursor-pointer hover:h-3 transition-all duration-200 ease-out group"
                onClick={handleTimelineClick}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onMouseMove={(e) => {
                  if (isDragging) {
                    const timeline = e.currentTarget;
                    const rect = timeline.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const newTime = percent * duration;
                    
                    if (videoRef.current && duration) {
                      videoRef.current.currentTime = newTime;
                      setCurrentTime(newTime);
                    }
                  }
                }}
              >
                {/* Barra de progresso azul visível */}
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-75 ease-out shadow-sm"
                  style={{ 
                    width: duration > 0 ? `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` : '0%',
                    minWidth: currentTime > 0 ? '2px' : '0px'
                  }}
                />
                
                {/* Indicador de posição (thumb) */}
                <div 
                  className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 border-2 border-blue-400"
                  style={{ 
                    left: duration > 0 ? `calc(${Math.min(100, Math.max(0, (currentTime / duration) * 100))}% - 8px)` : '0px'
                  }}
                />
              </div>

              {/* Controles inferiores */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-4">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    className="player-button flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 hover:scale-105 rounded-full transition-all duration-200 ease-out z-50 relative backdrop-blur-sm"
                    title={isPlaying ? "Pausar" : "Reproduzir"}
                    style={{ pointerEvents: 'auto' }}
                  >
                    {isPlaying ? (
                      <div className="w-6 h-6 flex items-center justify-center">
                        <div className="w-1 h-4 bg-white mr-1"></div>
                        <div className="w-1 h-4 bg-white"></div>
                      </div>
                    ) : (
                      <div className="w-6 h-6 flex items-center justify-center ml-0.5">
                        <div style={{
                          width: 0,
                          height: 0,
                          borderLeft: '8px solid white',
                          borderTop: '6px solid transparent',
                          borderBottom: '6px solid transparent'
                        }}></div>
                      </div>
                    )}
                  </button>

                  {/* Tempo atual / Duração */}
                  <div className="text-white text-sm font-medium">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center space-x-2" title={`Volume: ${Math.round(volume * 100)}%`}>
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      {volume === 0 ? (
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                      ) : volume < 0.5 ? (
                        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                      ) : (
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      )}
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => {
                        const newVolume = parseFloat(e.target.value);
                        setVolume(newVolume);
                        if (videoRef.current) {
                          videoRef.current.volume = newVolume;
                        }
                      }}
                      className="w-16 h-1 bg-white/20 rounded-lg appearance-none slider"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Controles de velocidade */}
                  <div className="flex items-center space-x-1">
                    {[1, 1.25, 1.5, 1.75].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => changeGlobalPlaybackRate(rate)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          playbackRate === rate 
                            ? "bg-blue-500 text-white" 
                            : "bg-white/20 hover:bg-white/30 text-white/80"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Fullscreen button */}
                  {!isFullscreen && (
                    <button
                      onClick={enterFullscreen}
                      className="player-button flex items-center justify-center w-9 h-9 bg-white/20 hover:bg-white/30 hover:scale-110 rounded-lg transition-all duration-200 ease-out backdrop-blur-sm"
                      title="Tela Cheia"
                    >
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                      </svg>
                    </button>
                  )}

                  {/* Exit fullscreen button em fullscreen */}
                  {isFullscreen && (
                    <button
                      onClick={exitFullscreen}
                      className="player-button flex items-center justify-center w-9 h-9 bg-white/20 hover:bg-white/30 hover:scale-110 rounded-lg transition-all duration-200 ease-out backdrop-blur-sm"
                      title="Sair da Tela Cheia"
                    >
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Controles em fullscreen - sempre visíveis para debug */}
            {isFullscreen && (
              <>
                {/* Área de trigger do topo */}
                <div 
                  className="absolute top-0 left-0 w-full h-16 z-40 bg-transparent"
                  onMouseEnter={() => setShowTopControls(true)}
                  onMouseLeave={() => setShowTopControls(false)}
                />

                {/* Controles no topo */}
                <div 
                  className={`absolute top-0 left-0 w-full h-20 z-50 transition-all duration-300 ease-in-out ${showTopControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'}`}
                  style={{ pointerEvents: showTopControls ? 'auto' : 'none' }}
                  onMouseEnter={() => setShowTopControls(true)}
                  onMouseLeave={() => setShowTopControls(false)}
                >
                  <div className="bg-gradient-to-b from-black/80 via-black/60 to-transparent px-6 py-4 h-full flex items-center justify-between">
                    <div className="flex items-center space-x-4 pointer-events-auto">
                      <h2 className="text-white text-lg font-semibold">{selectedLesson.title}</h2>
                    </div>
                    
                    <div className="flex items-center space-x-3 pointer-events-auto">
                      {/* Botões removidos - agora estão na sidebar */}
                    </div>
                  </div>
                </div>

                {/* Área de trigger lateral */}
                <div 
                  className={`absolute ${sidebarPosition === 'right' ? 'right-0' : 'left-0'} top-0 w-8 h-full z-40`}
                  onMouseEnter={() => setSidebarHovered(true)}
                  onMouseLeave={() => setSidebarHovered(false)}
                >
                  <div className={`absolute ${sidebarPosition === 'right' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'} top-1/2 transform -translate-y-1/2 w-1 h-16 bg-blue-500/50`}></div>
                </div>

                {/* Sidebar fullscreen */}
                <div 
                  className={`absolute ${sidebarPosition === 'right' ? 'right-0' : 'left-0'} w-[28rem] bg-black/90 backdrop-blur-md transform transition-transform duration-300 ease-in-out`}
                  style={{ 
                    height: '100vh',
                    top: '0',
                    zIndex: 9998,
                    transform: `${(sidebarHovered || sidebarLocked) ? 'translateX(0)' : sidebarPosition === 'right' ? 'translateX(100%)' : 'translateX(-100%)'}`
                  }}
                  onMouseEnter={() => setSidebarHovered(true)}
                  onMouseLeave={() => !sidebarLocked && setSidebarHovered(false)}
                >
                  <div className="h-full flex flex-col">
                    {/* Header com título e botões de controle */}
                    <div 
                      className="p-4 border-b border-white/10 pointer-events-auto"
                      onMouseEnter={() => setSidebarLocked(true)}
                      onMouseLeave={() => setSidebarLocked(false)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-lg font-bold text-center flex-1">
                          {selectedCourse.title}
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('Botão clicado! Posição atual:', sidebarPosition);
                            setSidebarPosition(sidebarPosition === 'right' ? 'left' : 'right');
                          }}
                          className="ml-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors pointer-events-auto relative z-50"
                          title={`Mover para ${sidebarPosition === 'right' ? 'esquerda' : 'direita'}`}
                          style={{ pointerEvents: 'auto', zIndex: 9999 }}
                        >
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            {sidebarPosition === 'right' ? (
                              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                            ) : (
                              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                            )}
                          </svg>
                        </button>
                      </div>
                      <div className="text-white/60 text-xs text-center mb-4">
                        Lista de Aulas
                      </div>
                      
                    </div>
                    
                    {/* Lista de aulas com scroll */}
                    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
                      <div className="space-y-2">
                        {selectedCourse.content.map((item, index) => (
                          <ModuleItem
                            key={index}
                            item={item}
                            courseTitle={selectedCourse.title}
                            onSelectLesson={handleLessonSelect}
                            completedLessons={completedLessons}
                            expandedModules={expandedModules}
                            toggleModuleExpansion={toggleModuleExpansion}
                            selectedLesson={selectedLesson}
                            videoDurations={videoDurations}
                            loadingVideos={loadingVideos}
                            formatTime={formatTime}
                            toggleLessonComplete={toggleLessonComplete}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      );
    } else if (isPDF) {
      return (
        <div className="flex flex-col h-full w-full">
          <div className="bg-gray-800 p-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold">{selectedLesson.title}</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleLessonComplete(selectedLesson)}
                  className="flex items-center px-4 py-2 rounded-lg transition-colors bg-green-600 hover:bg-green-700 mr-3"
                >
                  {completedLessons[selectedCourse.title]?.[selectedLesson.path] ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      <span>Concluído</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-5 h-5 mr-2" />
                      <span>Concluir</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-white">
            <object data={fileUrl} type="application/pdf" className="w-full h-full">
              <iframe src={fileUrl} className="w-full h-full" title={selectedLesson.title}>
                <a href={fileUrl}>Download PDF</a>
              </iframe>
            </object>
          </div>
        </div>
      );
    } else if (isHTML) {
      return (
        <div className="flex flex-col h-full">
          <div className="bg-gray-800 py-1 px-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold">{selectedLesson.title}</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleLessonComplete(selectedLesson)}
                  className="flex items-center px-4 py-2 rounded-lg transition-colors bg-green-600 hover:bg-green-700 mr-3"
                >
                  {completedLessons[selectedCourse.title]?.[selectedLesson.path] ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      <span>Concluído</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-5 h-5 mr-2" />
                      <span>Concluir</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-gray-100 relative overflow-auto p-8">
            {/* Container centralizado com largura fixa ajustada */}
            <div className="mx-auto bg-white shadow-xl rounded-lg" style={{ width: "1000px", minHeight: "100%" }}>
              {/* Usando srcDoc para injetar conteúdo HTML com configuração de codificação robusta */}
              <iframe
                srcDoc={htmlContent}
                className="w-full border-0 rounded-lg"
                style={{ 
                  height: "calc(100vh - 160px)",
                  minHeight: "600px"
                }}
              title={selectedLesson.title}
              allowFullScreen
              sandbox="allow-same-origin allow-scripts allow-popups"
                onLoad={(e) => {
                  // Tenta aplicar codificação UTF-8 diretamente no documento do iframe
                  try {
                    const iframeDocument = e.target.contentDocument || e.target.contentWindow.document;
                    if (iframeDocument) {
                      // Verifica se há meta charset
                      const metaCharset = iframeDocument.querySelector("meta[charset]");
                      if (!metaCharset) {
                        // Adiciona meta charset se não existir
                        const meta = iframeDocument.createElement("meta");
                        meta.setAttribute("charset", "UTF-8");
                        const head = iframeDocument.head || iframeDocument.getElementsByTagName("head")[0];
                        if (head && head.firstChild) {
                          head.insertBefore(meta, head.firstChild);
                        }
                      }
                      
                      // Adiciona estilos para melhorar a aparência do conteúdo
                      const style = iframeDocument.createElement("style");
                      style.textContent = `
                        body {
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                          line-height: 1.6;
                          padding: 3rem 4rem;
                          margin: 0;
                          background: #ffffff;
                          color: #333;
                          max-width: 100%;
                          box-sizing: border-box;
                        }
                        h1, h2, h3, h4, h5, h6 {
                          color: #2d3748;
                          margin-top: 1.5rem;
                          margin-bottom: 1rem;
                        }
                        h1 { font-size: 2rem; }
                        h2 { font-size: 1.5rem; }
                        h3 { font-size: 1.25rem; }
                        p {
                          margin-bottom: 1rem;
                        }
                        ul, ol {
                          margin-bottom: 1rem;
                          padding-left: 1.5rem;
                        }
                        li {
                          margin-bottom: 0.5rem;
                        }
                        code {
                          background: #f7fafc;
                          padding: 0.25rem 0.5rem;
                          border-radius: 0.25rem;
                          font-family: 'Courier New', monospace;
                        }
                        pre {
                          background: #1a202c;
                          color: #e2e8f0;
                          padding: 1rem;
                          border-radius: 0.5rem;
                          overflow-x: auto;
                        }
                        pre code {
                          background: transparent;
                          padding: 0;
                        }
                        blockquote {
                          border-left: 4px solid #4299e1;
                          padding-left: 1rem;
                          margin: 1rem 0;
                          color: #4a5568;
                          font-style: italic;
                        }
                        img {
                          max-width: 100%;
                          height: auto;
                          border-radius: 0.5rem;
                          margin: 1rem 0;
                        }
                        table {
                          width: 100%;
                          border-collapse: collapse;
                          margin: 1rem 0;
                        }
                        th, td {
                          border: 1px solid #e2e8f0;
                          padding: 0.75rem;
                          text-align: left;
                        }
                        th {
                          background: #f7fafc;
                          font-weight: 600;
                        }
                        a {
                          color: #4299e1;
                          text-decoration: none;
                        }
                        a:hover {
                          text-decoration: underline;
                        }
                      `;
                      const head = iframeDocument.head || iframeDocument.getElementsByTagName("head")[0];
                      if (head) {
                        head.appendChild(style);
                      }
                    }
                  } catch (error) {
                    console.error("Erro ao ajustar charset do iframe:", error);
                  }
                }}
              />
            </div>
          </div>
        </div>
      );
    }
    
    // Default case for unrecognized file types
    return (
      <div className="flex flex-col h-full w-full">
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h2 className="text-lg font-semibold">{selectedLesson.title}</h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => toggleLessonComplete(selectedLesson)}
                className="flex items-center px-4 py-2 rounded-lg transition-colors bg-green-600 hover:bg-green-700 mr-3"
              >
                {completedLessons[selectedCourse.title]?.[selectedLesson.path] ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    <span>Concluído</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-5 h-5 mr-2" />
                    <span>Concluir</span>
                  </>
                )}
              </button>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-500" />
            <h3 className="text-xl font-semibold mb-2">Tipo de arquivo não suportado</h3>
            <p className="text-sm">
              Este tipo de arquivo não pode ser visualizado diretamente.
            </p>
            <a 
              href={`http://localhost:3001/cursos/${selectedCourse.title}/${selectedLesson.path}`}
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-xl">Carregando cursos...</div>
      </div>
    );
  }

  if (view === "lessons" && selectedCourse && !selectedLesson) {
    const courseProgress = completedLessons[selectedCourse.title] || {};

    const countLessons = (content) => {
      return content.reduce((count, item) => {
        if (item.type === "lesson") return count + 1;
        if (item.type === "module" && item.content) return count + countLessons(item.content);
        return count;
      }, 0);
    };

    const countCompletedLessons = (content) => {
      return content.reduce((count, item) => {
        if (item.type === "lesson") {
          return count + (courseProgress[item.path] ? 1 : 0);
        }
        if (item.type === "module" && item.content) {
          return count + countCompletedLessons(item.content);
        }
        return count;
      }, 0);
    };

    const totalLessons = countLessons(selectedCourse.content);
    const completedCount = countCompletedLessons(selectedCourse.content);

    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleBack}
            className="mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Voltar para cursos
          </button>
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">{selectedCourse.title}</h2>
            <div className="text-gray-400">
              Progresso: {completedCount} de {totalLessons} aulas concluídas
            </div>
          </div>
          <div className="space-y-2">
            {selectedCourse.content.map((item, index) => (
              <ModuleItem
                key={index}
                item={item}
                courseTitle={selectedCourse.title}
                onSelectLesson={handleLessonSelect}
                completedLessons={completedLessons}
                expandedModules={expandedModules}
                toggleModuleExpansion={toggleModuleExpansion}
                selectedLesson={selectedLesson}
                videoDurations={videoDurations}
                loadingVideos={loadingVideos}
                formatTime={formatTime}
                toggleLessonComplete={toggleLessonComplete}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selectedLesson) {
    const isHTML = selectedLesson.title.endsWith(".html");
    
    if (isHTML) {
      // Layout com sidebar fixa para HTML
      return (
        <div className="h-screen bg-gray-900 text-gray-100 flex">
          {/* Área principal do conteúdo */}
          <div className="flex-1 bg-gray-800">
            {renderLesson()}
          </div>
          
          {/* Sidebar fixa para HTML */}
          <div className="w-[28rem] bg-gray-800 border-l border-gray-700 flex flex-col">
            {/* Header com título */}
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white text-lg font-bold text-center">
                {selectedCourse.title}
              </h3>
              <div className="text-gray-400 text-xs text-center mt-2">
                Lista de Aulas
              </div>
            </div>
            
            {/* Lista de aulas com scroll */}
            <div className="flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
              <div className="space-y-2">
                {selectedCourse.content.map((item, index) => (
                  <ModuleItem
                    key={index}
                    item={item}
                    courseTitle={selectedCourse.title}
                    onSelectLesson={handleLessonSelect}
                    completedLessons={completedLessons}
                    expandedModules={expandedModules}
                    toggleModuleExpansion={toggleModuleExpansion}
                    selectedLesson={selectedLesson}
                    videoDurations={videoDurations}
                    loadingVideos={loadingVideos}
                    formatTime={formatTime}
                    toggleLessonComplete={toggleLessonComplete}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Layout com sidebar hover para vídeos
    return (
      <div className="h-screen bg-gray-900 text-gray-100 flex relative">
        {/* Área principal do conteúdo - sempre ocupa a tela toda */}
        <div className="w-full h-full bg-gray-800">
          {renderLesson()}
        </div>

        {/* Área de trigger com indicador visual sutil */}
        <div 
          className={`absolute ${sidebarPosition === 'right' ? 'right-0' : 'left-0'} top-0 w-8 h-full z-10 group`}
          onMouseEnter={() => setSidebarHovered(true)}
        >
          {/* Indicador visual sutil */}
          <div className={`absolute ${sidebarPosition === 'right' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'} top-1/2 transform -translate-y-1/2 w-1 h-16 bg-gradient-to-b from-transparent via-blue-500 to-transparent opacity-30 group-hover:opacity-60 transition-opacity duration-300`}></div>
          
          {/* Tooltip de instrução */}
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap border border-gray-600 pointer-events-none">
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1 w-2 h-2 bg-gray-800 rotate-45 border-r border-t border-gray-600"></div>
            <div className="text-xs">← Passe o mouse aqui</div>
            <div className="text-xs text-gray-300">para ver as aulas</div>
          </div>
        </div>

        {/* Sidebar com hover - aparece sobre o conteúdo */}
        <div 
          className={`absolute ${sidebarPosition === 'right' ? 'right-0 rounded-l-lg' : 'left-0 rounded-r-lg'} w-[28rem] bg-gradient-to-b from-gray-800 to-gray-850 shadow-2xl transform transition-transform duration-300 ease-in-out z-20`}
          style={{ 
            height: '100vh',
            top: '0',
            transform: `${(sidebarHovered || sidebarLocked) ? 'translateX(0)' : sidebarPosition === 'right' ? 'translateX(100%)' : 'translateX(-100%)'}`
          }}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => !sidebarLocked && setSidebarHovered(false)}
        >
          <div className="h-full flex flex-col border-l border-gray-700">
            {/* Header com título e botões de controle */}
            <div 
              className="p-4 border-b border-white/10"
              onMouseEnter={() => setSidebarLocked(true)}
              onMouseLeave={() => setSidebarLocked(false)}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white text-lg font-bold text-center flex-1">
                  {selectedCourse.title}
                </h3>
                <button
                  onClick={() => setSidebarPosition(sidebarPosition === 'right' ? 'left' : 'right')}
                  className="ml-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  title={`Mover para ${sidebarPosition === 'right' ? 'esquerda' : 'direita'}`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    {sidebarPosition === 'right' ? (
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    ) : (
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                    )}
                  </svg>
                </button>
              </div>
              <div className="text-white/60 text-xs text-center mb-4">
                Lista de Aulas
              </div>
              
            </div>
            
            {/* Lista de aulas com scroll */}
            <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
              <div className="space-y-2">
                {selectedCourse.content.map((item, index) => (
                  <ModuleItem
                    key={index}
                    item={item}
                    courseTitle={selectedCourse.title}
                    onSelectLesson={handleLessonSelect}
                    completedLessons={completedLessons}
                    expandedModules={expandedModules}
                    toggleModuleExpansion={toggleModuleExpansion}
                    selectedLesson={selectedLesson}
                    videoDurations={videoDurations}
                    loadingVideos={loadingVideos}
                    formatTime={formatTime}
                    toggleLessonComplete={toggleLessonComplete}
                  />
                ))}
              </div>
              
              {/* Gradiente sutil no final da sidebar */}
              <div className="mt-6 h-8 bg-gradient-to-t from-gray-800 to-transparent rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header com botão de configuração */}
      <header className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Cursos Disponíveis</h1>
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
            <span>Configurações</span>
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course, index) => (
            <div key={index} onClick={() => handleCourseSelect(course)} className="cursor-pointer">
              <CourseCard title={course.title} description={course.description} />
            </div>
          ))}
        </div>
      </main>

      {/* Modal de Configuração */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Configurações</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Caminho dos Cursos:
              </label>
              <input
                type="text"
                value={coursesPath}
                onChange={(e) => setCoursesPath(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/caminho/para/os/cursos/"
              />
              <p className="text-sm text-gray-400 mt-1">
                Informe o caminho completo onde estão localizados os cursos
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => saveCoursesPath(coursesPath)}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setCoursesPath('/mnt/nvme2/kadabra/Downloads/cursos/'); // Reset para valor padrão
                }}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainComponent;
