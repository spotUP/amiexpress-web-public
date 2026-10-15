import React from 'react';
import { Check } from 'lucide-react';

export interface Theme {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'dark-blue',
    name: 'Dark Blue',
    colors: {
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      accent: '#06B6D4',
      background: '#1E1E1E',
      surface: '#252526',
      text: '#FFFFFF',
    },
  },
  {
    id: 'dark-purple',
    name: 'Dark Purple',
    colors: {
      primary: '#8B5CF6',
      secondary: '#EC4899',
      accent: '#A78BFA',
      background: '#1E1E1E',
      surface: '#252526',
      text: '#FFFFFF',
    },
  },
  {
    id: 'dark-green',
    name: 'Dark Green',
    colors: {
      primary: '#10B981',
      secondary: '#059669',
      accent: '#34D399',
      background: '#1E1E1E',
      surface: '#252526',
      text: '#FFFFFF',
    },
  },
  {
    id: 'dark-red',
    name: 'Dark Red',
    colors: {
      primary: '#EF4444',
      secondary: '#DC2626',
      accent: '#F87171',
      background: '#1E1E1E',
      surface: '#252526',
      text: '#FFFFFF',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    colors: {
      primary: '#FF00FF',
      secondary: '#00FFFF',
      accent: '#FFFF00',
      background: '#0A0A0A',
      surface: '#1A1A1A',
      text: '#FFFFFF',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: {
      primary: '#0EA5E9',
      secondary: '#06B6D4',
      accent: '#22D3EE',
      background: '#0C1E2E',
      surface: '#1E3A4F',
      text: '#FFFFFF',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      primary: '#22C55E',
      secondary: '#15803D',
      accent: '#4ADE80',
      background: '#0F1E13',
      surface: '#1A3320',
      text: '#FFFFFF',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: {
      primary: '#F59E0B',
      secondary: '#EF4444',
      accent: '#F97316',
      background: '#1E1410',
      surface: '#2E241E',
      text: '#FFFFFF',
    },
  },
];

interface ThemeSelectorProps {
  currentTheme: string;
  onThemeChange: (theme: Theme) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      {themes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onThemeChange(theme)}
          className={`
            relative p-4 rounded-lg border-2 transition-all hover:scale-105
            ${
              currentTheme === theme.id
                ? 'border-blue-500'
                : 'border-gray-700 hover:border-gray-600'
            }
          `}
          style={{ backgroundColor: theme.colors.surface }}
        >
          {/* Theme preview */}
          <div className="flex gap-2 mb-3">
            <div
              className="w-8 h-8 rounded"
              style={{ backgroundColor: theme.colors.primary }}
            />
            <div
              className="w-8 h-8 rounded"
              style={{ backgroundColor: theme.colors.secondary }}
            />
            <div
              className="w-8 h-8 rounded"
              style={{ backgroundColor: theme.colors.accent }}
            />
          </div>

          {/* Theme name */}
          <p className="text-sm font-medium text-white">{theme.name}</p>

          {/* Selected indicator */}
          {currentTheme === theme.id && (
            <div className="absolute top-2 right-2">
              <Check className="w-5 h-5 text-blue-500" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

// Hook to apply theme colors to CSS variables
export const useTheme = (theme: Theme) => {
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-secondary', theme.colors.secondary);
    root.style.setProperty('--color-accent', theme.colors.accent);
    root.style.setProperty('--color-background', theme.colors.background);
    root.style.setProperty('--color-surface', theme.colors.surface);
    root.style.setProperty('--color-text', theme.colors.text);
  }, [theme]);
};

export default ThemeSelector;
