/**
 * Cohort design tokens - pastel watermelon theme (approved 2026-10-31):
 * soft watermelon pink/rose accents, fresh mint green highlights,
 * warm off-white background, soft rounded cards.
 */
export const colors = {
  brand: '#E85D7A',
  brandDeep: '#C24362',
  brandSoft: '#FFE1E9',
  danger: '#b3261e',
  cream: '#FFFAF8',
  lineWarm: '#F8E9E4',
  card: '#ffffff',

  ink: '#2A2126',
  ink2: '#7A6C72',
  ink3: '#A79AA1',
  ink4: '#c0bebf',
  raised: '#FBF3EF',
  hairline: '#F3E8E4',

  // Watermelon greens
  green: '#1E9E63',
  greenSoft: '#DFF6E9',

  // Avatar palette: soft tint background + deep ink initials
  accent: ['#FFE1E9', '#DFF6E9', '#FFF1DB', '#E8EDF9', '#F5E4F0', '#DFF3EE'] as const,
  accentInk: ['#C24362', '#157A4D', '#A8732A', '#54679B', '#9C4A7E', '#2E7D6B'] as const,
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
