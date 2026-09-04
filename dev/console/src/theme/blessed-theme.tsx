// Blessed Theme for Ink-based TUI
// Ports the SDK's door theme system (sdk/engines/ui/theme/tokens.ts) to Ink

import Spinner from 'ink-spinner';

// ThemeTokens — exactly matches sdk/engines/ui/theme/tokens.ts
export interface ThemeTokens {
  ground: string;      // screen background
  ink: string;         // body text
  chrome: string;      // borders and frames
  dim: string;         // secondary text
  bar: string;         // header/footer bar background
  barInk: string;      // text on a bar
  accent: string;      // primary accent — labels, active borders, key caps
  accentAlt: string;   // secondary accent
  selectionBg: string; // highlighted row background
  selectionInk: string;// highlighted row text
  ok: string;          // green
  warn: string;        // yellow
  alert: string;       // red
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  tokens: ThemeTokens;
  border: 'line' | 'double' | 'none';
  rail: string;
  glitches: boolean;
}

// Classic — the board as it has always looked. Uses blessed colour names.
export const CLASSIC: Theme = {
  id: 'classic',
  name: 'Classic',
  blurb: 'The board as it has always looked.',
  border: 'line',
  rail: '',
  glitches: false,
  tokens: {
    ground: 'black',
    ink: 'white',
    chrome: 'cyan',
    dim: 'gray',
    bar: 'blue',
    barInk: 'white',
    accent: 'yellow',
    accentAlt: 'cyan',
    selectionBg: 'blue',
    selectionInk: 'white',
    ok: 'green',
    warn: 'yellow',
    alert: 'red',
  },
};

// Slate & Slash — quiet slate chrome, magenta accent, room to breathe.
export const SLATE_SLASH: Theme = {
  id: 'slate-slash',
  name: 'Slate & Slash',
  blurb: 'Quiet slate chrome, one magenta accent.',
  border: 'line',
  rail: '///',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#C9D4E8',
    chrome: '#48566E',
    dim: '#48566E',
    bar: 'black',
    barInk: '#C9D4E8',
    accent: '#FF3D9A',
    accentAlt: '#4DE0F0',
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF5C7A',
  },
};

// Uprough Neon — demoscene magenta and cyan, double-ruled, masthead slashes.
export const UPROUGH_NEON: Theme = {
  id: 'uprough-neon',
  name: 'Uprough Neon',
  blurb: 'Demoscene magenta and cyan, double-ruled.',
  border: 'double',
  rail: '/////',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#E4ECFA',
    chrome: '#4DE0F0',
    dim: '#48566E',
    bar: 'black',
    barInk: '#4DE0F0',
    accent: '#FF3D9A',
    accentAlt: '#4DE0F0',
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF5C7A',
  },
};

// Quiet Phosphor — green phosphor terminal look, no borders.
export const QUIET_PHOSPHOR: Theme = {
  id: 'quiet-phosphor',
  name: 'Quiet Phosphor',
  blurb: 'Green phosphor terminal.',
  border: 'none',
  rail: '////',
  glitches: false,
  tokens: {
    ground: 'black',
    ink: '#57E389',
    chrome: '#2E4A3C',
    dim: '#2E4A3C',
    bar: 'black',
    barInk: '#57E389',
    accent: '#8CFFB4',
    accentAlt: '#57E389',
    selectionBg: '#57E389',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF5C7A',
  },
};

// Default theme for the TUI — Slate & Slash for the animated slash rail
export const DEFAULT_THEME: Theme = SLATE_SLASH;

export let T: ThemeTokens = DEFAULT_THEME.tokens;
export let CURRENT_THEME: Theme = DEFAULT_THEME;

export function applyTheme(theme: Theme): void {
  CURRENT_THEME = theme;
  T = theme.tokens;
}

// Border style mapping for Ink
export const BORDER_STYLE: Record<string, 'single' | 'double' | 'round'> = {
  line: 'single',
  double: 'double',
  none: 'round',
};

// Rail pattern animation frames
export const RAIL_FRAMES = ['/', '//', '///', '////', '/////'];

// Spinner frames
export const SPINNER_FRAMES = ['|', '/', '-', '\\'];

// Ink component that renders a blessed-style box
import React from 'react';
import { Box, Text } from 'ink';

interface BlessedBoxProps {
  children?: React.ReactNode;
  theme?: Theme;
  label?: string;
  padding?: number;
  width?: number | string;
  flexDirection?: 'row' | 'column';
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginBottom?: number;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  minWidth?: number;
  flexGrow?: number;
  flexWrap?: 'wrap' | 'nowrap';
  [key: string]: any;
}

export function BlessedBox({ children, theme, ...props }: BlessedBoxProps) {
  const t = theme?.tokens ?? T;
  const borderChrome = t.chrome;
  const style = theme?.border ?? CURRENT_THEME.border;

  return (
    <Box
      borderStyle={BORDER_STYLE[style] ?? 'single'}
      borderColor={borderChrome}
      paddingX={1}
      paddingY={1}
      {...props}
    >
      {children}
    </Box>
  );
}

// Blessed-style text with theme colours
interface BlessedTextProps {
  children: React.ReactNode;
  variant?: 'ink' | 'dim' | 'accent' | 'accentAlt' | 'ok' | 'warn' | 'alert' | 'chrome';
  bold?: boolean;
}

export function BlessedText({ children, variant = 'ink', bold = false }: BlessedTextProps) {
  const colorMap: Record<string, string> = {
    ink: T.ink,
    dim: T.dim,
    accent: T.accent,
    accentAlt: T.accentAlt,
    ok: T.ok,
    warn: T.warn,
    alert: T.alert,
    chrome: T.chrome,
  };
  const color = colorMap[variant] ?? T.ink;
  const isDim = variant === 'dim';
  return (
    <Text color={color} bold={bold} dimColor={isDim}>
      {children}
    </Text>
  );
}

// Spinner
interface BlessedSpinnerProps {
  color?: string;
}

export function BlessedSpinner({ color = T.accent }: BlessedSpinnerProps) {
  return (
    <Text color={color}>
      <Spinner type="dots" />
    </Text>
  );
}

// Progress bar
interface BlessedProgressBarProps {
  percent: number;
  filledChar?: string;
  emptyChar?: string;
}

export function BlessedProgressBar({
  percent,
  filledChar = '\u2588',
  emptyChar = '\u2591',
}: BlessedProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, isNaN(percent) ? 0 : percent));
  const width = 30;
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return (
    <Box>
      <Text color={T.ok}>{filledChar.repeat(filled)}</Text>
      <Text color={T.dim}>{emptyChar.repeat(empty)}</Text>
      <Text> {clamped}%</Text>
    </Box>
  );
}

// Rail — animated slashes
interface RailProps {
  theme?: Theme;
  frame?: number;
}

export function Rail({ theme, frame = 0 }: RailProps) {
  const t = theme?.tokens ?? T;
  const rail = theme?.rail ?? CURRENT_THEME.rail;
  const animated = rail ? rail.slice(0, (frame % 5) + 1) : '';
  return (
    <Text color={t.accent} bold>
      {animated}
    </Text>
  );
}