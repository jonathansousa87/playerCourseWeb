// Camadas de z-index compartilhadas. Centralizar evita números mágicos
// espalhados (ex.: 9998) e mantém a ordem de empilhamento previsível.
export const Z_INDEX = {
  sidebarSlideout: 50,
  fullscreenSidebarTrigger: 10,
  fullscreenSidebarPanel: 20,
  // Sidebar sobre o vídeo em fullscreen — precisa ficar acima do elemento
  // de vídeo em fullscreen do navegador.
  fullscreenOverlay: 9998,
};
