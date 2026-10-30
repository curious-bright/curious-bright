import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import {
  fontSize,
  fonts,
  grid,
  lightPalette,
  darkPalette,
  radii,
  spacing,
  type Palette,
  type Scheme,
} from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: Scheme;
  preference: ThemePreference;
  colors: Palette;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const PREF_KEY = 'cb.theme';

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<Scheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(PREF_KEY, next);
  }, []);

  const scheme: Scheme = preference === 'system' ? systemScheme : preference;
  const toggle = useCallback(
    () => setPreference(scheme === 'dark' ? 'light' : 'dark'),
    [scheme, setPreference],
  );

  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      preference,
      colors: scheme === 'dark' ? darkPalette : lightPalette,
      setPreference,
      toggle,
    }),
    [scheme, preference, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

export { fontSize, fonts, grid, radii, spacing, lightPalette, darkPalette };
export type { Palette, Scheme };
