/**
 * First-party error reporting: uncaught errors and unhandled rejections are
 * logged to the error_logs table (admins read them in the admin panel).
 * Fire-and-forget - logging must never break the app itself.
 */
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** A stale tab after a new deploy cannot find its old JS chunks. Reload once
 * per tab session instead of leaving a broken page and a flood of errors. */
function reloadOnceForStaleChunk(message: string) {
  if (!/Loading (module|chunk)|dynamically imported module/i.test(message)) return;
  try {
    if (window.sessionStorage.getItem('cohort-chunk-reload')) return;
    window.sessionStorage.setItem('cohort-chunk-reload', '1');
    window.location.reload();
  } catch {
    /* ignore */
  }
}

export function logError(message: string, stack?: string | null) {
  const onWeb = Platform.OS === 'web' && typeof window !== 'undefined';
  // Every occurrence is logged: the admin view groups repeats with counts, so
  // recurrence stays measurable instead of being hidden client-side.
  if (onWeb) reloadOnceForStaleChunk(message);
  const entry = {
    message: message.slice(0, 1000),
    stack: stack?.slice(0, 4000) ?? null,
    url: onWeb ? window.location.pathname : 'app',
    user_agent: onWeb ? navigator.userAgent.slice(0, 300) : Platform.OS,
  };
  supabase.from('error_logs').insert(entry).then(({ error }) => {
    if (error) console.warn('[cohort] error logging failed:', error.message);
  });
}

let installed = false;

/** Attach global web handlers once. Safe to call on every app start. */
export function installErrorLogging() {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    logError(event.message || 'Uncaught error', event.error?.stack);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as Error | string;
    logError(
      typeof reason === 'string' ? reason : reason?.message || 'Unhandled promise rejection',
      typeof reason === 'string' ? undefined : reason?.stack,
    );
  });
}
