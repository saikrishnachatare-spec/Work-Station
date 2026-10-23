/**
 * Cohort design tokens, ported from the clickable prototype (docs/cohort).
 * Warm terracotta on cream, rounded cards.
 */
export const colors = {
  brand: '#c0562f',
  brandDeep: '#94401f',
  brandSoft: '#f7e6da',
  danger: '#b3261e',
  cream: '#faf5f1',
  lineWarm: '#efe4dc',
  card: '#ffffff',

  ink: '#251f21',
  ink2: '#585254',
  ink3: '#969394',
  ink4: '#c0bebf',
  raised: '#f4efec',
  hairline: '#eae9ea',

  // Avatar / accent palette from the prototype
  accent: ['#c0562f', '#7a8b6f', '#b98a2f', '#6f7f96', '#96586b', '#4f7a72'] as const,
} as const;

export const radius = {
  card: 18,
  tile: 14,
  input: 12,
  sheet: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const font = {
  display: 'Georgia', // prototype: "Aime", Georgia, serif
  text: undefined as string | undefined, // prototype: "KMR Melange Grotesk", system sans
} as const;

export const type = {
  screenTitle: { fontFamily: font.display, fontSize: 21, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: font.display, fontSize: 17, letterSpacing: -0.3 },
  body: { fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16 },
  pill: { fontSize: 10, fontWeight: '600' as const },
} as const;
