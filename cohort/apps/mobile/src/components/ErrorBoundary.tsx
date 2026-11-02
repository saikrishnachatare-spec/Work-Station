/**
 * App-level error boundary: logs the crash to error_logs and shows a calm
 * fallback with a way back instead of a white screen.
 */
import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isChunkLoadError, logError } from '@/lib/errors';
import { colors, spacing, type as typeScale } from '@/theme';

type State = { hasError: boolean; loadFailed: boolean; error: Error | null };

/** Calm fallback shared by the app-level boundary and expo-router's per-route
 * boundary. A failed page download gets a real Reload; anything else keeps the
 * in-place retry. */
export function ErrorFallback({ error, onRetry }: { error?: Error | null; onRetry: () => void }) {
  const loadFailed = isChunkLoadError(error?.message);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{loadFailed ? "Couldn't load this page" : 'Something went wrong'}</Text>
      <Text style={styles.meta}>
        {loadFailed
          ? 'Check your connection, then reload.'
          : 'The team has been notified automatically. Reload to try again.'}
      </Text>
      <Pressable
        onPress={() => {
          if (loadFailed && typeof window !== 'undefined' && window.location) window.location.reload();
          else onRetry();
        }}
        style={styles.btn}
      >
        <Text style={styles.btnText}>{loadFailed ? 'Reload' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, loadFailed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, loadFailed: isChunkLoadError(error?.message), error };
  }

  componentDidCatch(error: Error) {
    logError(error.message, error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, loadFailed: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', backgroundColor: colors.cream, flex: 1,
    gap: spacing.md, justifyContent: 'center', padding: spacing.lg,
  },
  title: { ...typeScale.screenTitle, color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3, textAlign: 'center' },
  btn: {
    backgroundColor: colors.brandSoft, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  btnText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
});
