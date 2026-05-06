import { useEffect } from 'react';
import { useViewerStore } from '../../stores/useViewerStore';
import type { UseThemeReturn } from '../../types/hooks';

export function useTheme(): UseThemeReturn {
  const theme = useViewerStore((state) => state.theme);
  const setTheme = useViewerStore((state) => state.setTheme);

  // 应用主题到 document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return { theme, setTheme, toggleTheme };
}
