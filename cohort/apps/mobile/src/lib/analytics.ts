/**
 * Privacy-friendly analytics behind explicit consent.
 * Vercel Web Analytics is cookie-less and collects no personal data, but the
 * script only loads after the visitor accepts in the consent banner. The
 * choice persists in localStorage; declining loads nothing.
 */
import { Platform } from 'react-native';

const KEY = 'cohort-analytics-consent';

export type Consent = 'accepted' | 'declined' | null;

export function getConsent(): Consent {
  if (Platform.OS !== 'web') return null; // native consent UI does not exist yet: optional tracking stays off there by default
  if (typeof window === 'undefined') return null; // static export render pass
  const v = window.localStorage.getItem(KEY);
  return v === 'accepted' || v === 'declined' ? v : null;
}

export function setConsent(choice: Exclude<Consent, null>) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, choice);
  if (choice === 'accepted') injectAnalytics();
}

export function injectAnalytics() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (document.querySelector('script[data-cohort-analytics]')) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  script.dataset.cohortAnalytics = 'true';
  document.head.appendChild(script);
}

/** Called once at startup: loads analytics only for visitors who already accepted. */
export function initAnalytics() {
  if (getConsent() === 'accepted') injectAnalytics();
}
