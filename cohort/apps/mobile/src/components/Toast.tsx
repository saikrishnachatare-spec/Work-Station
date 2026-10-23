/**
 * Lightweight toast notifications. Wrap the app in <ToastProvider> and call
 * useToast().show(message, kind) from any screen.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void }>({
  show: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

function ToastCard({ toast, onDone }: { onDone: (id: number) => void; toast: Toast }) {
  const [translate] = useState(() => new Animated.Value(-24));
  const [opacity] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translate.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(opacity, { duration: 180, toValue: 1, useNativeDriver: true }),
        Animated.timing(translate, { duration: 180, toValue: 0, useNativeDriver: true }),
      ]).start();
    }
    const timer = setTimeout(() => {
      if (reducedMotion) {
        onDone(toast.id);
      } else {
        Animated.timing(opacity, { duration: 200, toValue: 0, useNativeDriver: true })
          .start(() => onDone(toast.id));
      }
    }, 3200);
    return () => clearTimeout(timer);
  }, [onDone, opacity, reducedMotion, toast.id, translate]);

  const icon = toast.kind === 'success' ? 'checkmark-circle' : toast.kind === 'error' ? 'alert-circle' : 'information-circle';
  const tint = toast.kind === 'success' ? '#2f6b3a' : toast.kind === 'error' ? '#a23424' : colors.ink2;

  return (
    <Animated.View accessibilityLiveRegion="polite" style={[styles.toast, { opacity, transform: [{ translateY: translate }] }]}>
      <Ionicons color={tint} name={icon} size={18} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, kind, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="none" style={styles.host}>
        {toasts.map((t) => <ToastCard key={t.id} onDone={dismiss} toast={t} />)}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    right: 0,
    top: Platform.OS === 'web' ? 16 : 54,
    zIndex: 1000,
  },
  toast: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.lineWarm,
    borderRadius: radius.pill,
    borderWidth: 1,
    elevation: 4,
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  toastText: { color: colors.ink, flexShrink: 1, fontSize: typeScale.body.fontSize },
});
