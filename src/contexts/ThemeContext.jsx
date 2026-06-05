import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "pcw.theme";
const DEFAULT_THEME = "slate";

export const THEMES = [
  {
    id: "petrol",
    label: "Azul-petróleo",
    description: "Teal suave + accent âmbar. Recomendado para leitura prolongada.",
    swatches: ["#0b1418", "#14b8a6", "#d4a574"],
  },
  {
    id: "forest",
    label: "Verde-musgo",
    description: "Tons sage e forest. Neutraliza vermelho do cansaço visual.",
    swatches: ["#0d1612", "#84cc16", "#c9a76a"],
  },
  {
    id: "slate",
    label: "Slate clássico",
    description: "Azul-cinza tradicional, refinado.",
    swatches: ["#020617", "#3b82f6", "#f59e0b"],
  },
  {
    id: "ciano",
    label: "Ciano-noturno",
    description: "Slate escuro + accent ciano — a paleta do curso de digitação.",
    swatches: ["#0f172a", "#22d3ee", "#0891b2"],
  },
];

const isValidTheme = (id) => THEMES.some((t) => t.id === id);

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidTheme(stored)) return stored;
  } catch {
    // localStorage indisponível (SSR / privacy mode) — cai pro default.
  }
  return DEFAULT_THEME;
};

const ThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignora — preferência só não persiste.
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!isValidTheme(next)) return;
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
