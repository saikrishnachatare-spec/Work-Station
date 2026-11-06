import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/** Periodic updates, not a socket. Never poll a hidden/background preview. */
export function useForeground() {
  const visible = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive' &&
    (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [foreground, setForeground] = useState(visible);
  useEffect(() => {
    const update = () => setForeground(visible());
    const sub = AppState.addEventListener('change', update);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', update);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return foreground;
}

export function pollDelay(base: number, foreground: boolean, failures: number, error: unknown): number | false {
  if (!foreground) return false;
  const status = (error as {status?:number} | null)?.status;
  if (status === 401 || status === 403) return false;
  return Math.min(base * 2 ** Math.min(failures, 4), 300_000);
}

// Query retry=false avoids stacked retries. Count distinct failed polling
// responses here, because fetchFailureCount resets on each new fetch.
const failures = new WeakMap<object,{updated:number;count:number}>();
export function queryPollDelay(base:number, foreground:boolean, q:{state:{error:unknown;errorUpdatedAt:number}}):number|false {
  if (!q.state.error) {failures.delete(q);return pollDelay(base,foreground,0,null);}
  const previous=failures.get(q);
  const count=previous?.updated===q.state.errorUpdatedAt ? previous.count : (previous?.count??0)+1;
  failures.set(q,{updated:q.state.errorUpdatedAt,count});
  return pollDelay(base,foreground,count,q.state.error);
}
