// Design tokens ported from apps/web/src/index.css (:root and the
// data-theme="dark" block). Single source of truth for the mobile theme.

export type Scheme = 'light' | 'dark';

export interface Palette {
  paper: string;
  paperCard: string;
  paperHover: string;
  ink: string;
  fadedInk: string;
  line: string;
  lineDark: string;
  coral: string;
  teal: string;
  mustard: string;
  highlighter: string;
  danger: string;
  accentGlow: string;
  gridLine: string;
}

export const lightPalette: Palette = {
  paper: '#F7F6F2',
  paperCard: '#FFFFFF',
  paperHover: '#FCFBF8',
  ink: '#14141A',
  fadedInk: '#6B685C',
  line: '#E2DFC9',
  lineDark: '#C8C4B0',
  coral: '#FF5A36',
  teal: '#00A896',
  mustard: '#F4B43D',
  highlighter: '#F4B43D',
  danger: '#C9371E',
  accentGlow: 'rgba(255, 90, 54, 0.18)',
  gridLine: 'rgba(20, 20, 26, 0.045)',
};

export const darkPalette: Palette = {
  paper: '#121216',
  paperCard: '#1B1B22',
  paperHover: '#23232C',
  ink: '#F2EFE5',
  fadedInk: '#BDB8A9',
  line: '#35353F',
  lineDark: '#4C4C59',
  coral: '#FF8B70',
  teal: '#45D6C2',
  mustard: '#FFD166',
  highlighter: '#FFD166',
  danger: '#FF9A86',
  accentGlow: 'rgba(255, 139, 112, 0.22)',
  gridLine: 'rgba(255, 255, 255, 0.035)',
};

export const radii = {
  md: 4,
  lg: 10,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const fonts = {
  display: 'ClashDisplay_600',
  displayBold: 'ClashDisplay_700',
  body: 'GeneralSans_400',
  bodyMedium: 'GeneralSans_500',
  bodySemiBold: 'GeneralSans_600',
  bodyBold: 'GeneralSans_700',
  mono: 'JetBrainsMono_400',
};

export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  lead: 17,
  h3: 20,
  h2: 24,
  h1: 30,
  display: 36,
};

export const grid = 32;
