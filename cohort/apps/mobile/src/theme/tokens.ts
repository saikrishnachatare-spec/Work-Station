/**
 * Cohort design tokens - light blue theme (user request 2026-10-31):
 * soft sky blue accents, fresh mint green highlights,
 * cool off-white background, soft rounded cards.
 */
export const colors = {
  brand: '#4D9DE8',
  brandDeep: '#2F7CC4',
  brandSoft: '#E3F0FC',
  danger: '#b3261e',
  cream: '#F7FBFF',
  lineWarm: '#E1EDF8',
  card: '#ffffff',

  ink: '#21262E',
  ink2: '#6A7280',
  ink3: '#9BA3AE',
  ink4: '#c0bebf',
  raised: '#F2F7FC',
  hairline: '#E6EFF6',

  // Fresh greens
  green: '#1E9E63',
  greenSoft: '#DFF6E9',

  // Avatar palette: soft tint background + deep ink initials
  accent: ['#E3F0FC', '#DFF6E9', '#FFF1DB', '#E8E4F5', '#F0E4F0', '#DFF3EE'] as const,
  accentInk: ['#2F7CC4', '#157A4D', '#A8732A', '#5A4FA0', '#9C4A7E', '#2E7D6B'] as const,
} as const;

export const radius = {
  card: 22,
  tile: 16,
  input: 14,
  sheet: 26,
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
  display: undefined as string | undefined, // smooth system sans
  text: undefined as string | undefined,
} as const;

export const type = {
  screenTitle: { fontFamily: font.display, fontSize: 21, fontWeight: '800' as const, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: font.display, fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16 },
  pill: { fontSize: 10, fontWeight: '600' as const },
} as const;
