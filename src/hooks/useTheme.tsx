import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { configureSound } from '../utils/sound';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'fivecrowns.theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

/**
 * Applies theme, reduced motion, high contrast and large card preferences to
 * the document root so plain CSS can react to them too.
 */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { settings, updateSettings, user } = useAuth();

  const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null;
  const theme: Theme = user ? settings.theme : (stored ?? settings.theme);

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('contrast-boost', Boolean(settings.highContrast));
    root.classList.toggle('reduce-motion', Boolean(settings.reduceMotion) || !settings.animations);
    root.dataset.cardSize = settings.largeCards ? 'large' : 'normal';
    root.style.colorScheme = resolved;
  }, [resolved, settings.highContrast, settings.reduceMotion, settings.animations, settings.largeCards]);

  useEffect(() => {
    configureSound({ enabled: settings.soundEffects });
  }, [settings.soundEffects]);

  // Follow the OS when set to "system".
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.classList.toggle('dark', media.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolved,
      setTheme: (next) => {
        localStorage.setItem(STORAGE_KEY, next);
        void updateSettings({ theme: next });
        const isDark = next === 'system' ? systemPrefersDark() : next === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
      },
    }),
    [theme, resolved, updateSettings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
