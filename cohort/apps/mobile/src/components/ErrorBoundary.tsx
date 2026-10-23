/**
 * App-level error boundary: logs the crash to error_logs and shows a calm
 * fallback with a way back instead of a white screen.
 */
import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logError } from '@/lib/errors';
import { colors, spacing, type as typeScale } from '@/theme';

type State = { hasError: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logError(error.message, error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.meta}>
            The team has been notified automatically. Reload to try again.
          </Text>
          <Pressable onPress={() => this.setState({ hasError: false })} style={styles.btn}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
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
    backgroundColor: colors.brand, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
});
