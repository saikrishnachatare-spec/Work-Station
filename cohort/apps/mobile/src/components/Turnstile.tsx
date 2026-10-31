import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

/**
 * Cloudflare Turnstile bot check, web only. Renders nothing on native and
 * nothing when no site key is configured, so the app works unchanged until
 * CAPTCHA is enabled in Supabase auth settings and the key is provided.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** Bump to force a fresh token after a failed attempt (tokens are single-use). */
  resetSignal?: number;
};

export function Turnstile({ siteKey, onToken, resetSignal = 0 }: Props) {
  const host = useRef<any>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !host.current || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(host.current as unknown as HTMLElement, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    };
    if (window.turnstile) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current !== null && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  if (Platform.OS !== 'web') return null;
  return <View ref={host} style={{ marginTop: 8, minHeight: 65 }} />;
}
