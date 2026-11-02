/**
 * First-party error reporting: uncaught errors and unhandled rejections are
 * logged to the error_logs table (admins read them in the admin panel).
 * Fire-and-forget - logging must never break the app itself.
 */
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** A stale tab after a new deploy cannot find its old JS chunks. Reload to
 * pick up the fresh HTML instead of leaving a broken page and a flood of
 * errors. Retries up to 3 times per tab session with a growing delay: a
 * reload that lands while the deploy is still propagating can serve HTML that
 * still points at the old chunks, so a single immediate attempt is not
 * enough. Covers Chrome ("Loading module ... failed", "Failed to fetch
 * dynamically imported module") and Safari ("Importing a module script
 * failed"). */
const CHUNK_ERROR = /Loading (module|chunk)|dynamically imported module|Importing a module script failed|AsyncRequireError|ChunkLoadError/i;

/** True when a JS chunk of the app failed to download (flaky network, or a
 * stale page after a deploy) rather than a bug in the app's own code. */
export function isChunkLoadError(message: string | undefined | null): boolean {
  return !!message && CHUNK_ERROR.test(message);
}

/** The reload budget is per tab session. Clear it once the app has stayed up
 * for a while, so one bad spell does not use up the retries for good. */
let chunkErrorSeen = false;

function resetReloadBudgetLater() {
  setTimeout(() => {
    // A page that hit a chunk error never refunds the budget, otherwise a
    // permanently failing page would reload forever.
    if (chunkErrorSeen) return;
    try {
      window.sessionStorage.removeItem('cohort-chunk-reload');
    } catch {
      /* ignore */
    }
  }, 20000);
}

function reloadForStaleChunk(message: string) {
  if (!isChunkLoadError(message)) return;
  chunkErrorSeen = true;
  try {
    const attempts = Number(window.sessionStorage.getItem('cohort-chunk-reload') ?? '0');
    if (attempts >= 3) return;
    window.sessionStorage.setItem('cohort-chunk-reload', String(attempts + 1));
    setTimeout(() => window.location.reload(), attempts * 15000);
  } catch {
    /* ignore */
  }
}

export function logError(message: string, stack?: string | null) {
  const onWeb = Platform.OS === 'web' && typeof window !== 'undefined';
  // Every occurrence is logged: the admin view groups repeats with counts, so
  // recurrence stays measurable instead of being hidden client-side.
  if (onWeb) reloadForStaleChunk(message);
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
  resetReloadBudgetLater();
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
