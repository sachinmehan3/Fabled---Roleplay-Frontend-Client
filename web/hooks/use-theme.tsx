import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'fabled' | 'dark' | 'light';

export const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'fabled', label: 'Fabled', hint: 'Ink and bronze' },
  { value: 'dark', label: 'Dark', hint: 'Zinc and violet' },
  { value: 'light', label: 'Light', hint: 'Parchment' },
];

const STORAGE_KEY = 'rp-theme';

const isTheme = (v: unknown): v is Theme => v === 'fabled' || v === 'dark' || v === 'light';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: 'fabled',
  setTheme: () => {},
  toggle: () => {},
});

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'fabled'; // the house theme; the picker remembers your choice
}

/** Everything but Light keeps the `dark` class, so Tailwind's dark: utilities still apply. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme !== 'light');
  root.classList.toggle('theme-fabled', theme === 'fabled');
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => THEMES[(THEMES.findIndex((x) => x.value === t) + 1) % THEMES.length].value),
    [],
  );

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
