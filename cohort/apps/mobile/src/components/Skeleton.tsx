/** Loading placeholder blocks that pulse gently until real content arrives. */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, radius, spacing } from '@/theme';

type SkeletonProps = {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
};

export function Skeleton({ height = 14, width = '100%', style }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.45));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return; // stay at a steady shade instead of pulsing
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: 700, toValue: 1, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 700, toValue: 0.45, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { height, opacity, width }, style]}
    />
  );
}

/** A card-shaped placeholder used while feed/search/lists load. */
export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Skeleton height={40} width={40} style={{ borderRadius: 20 }} />
        <View style={styles.cardHeadText}>
          <Skeleton height={13} width="55%" />
          <Skeleton height={11} width="35%" />
        </View>
      </View>
      <Skeleton height={12} />
      <Skeleton height={12} width="88%" />
      <Skeleton height={12} width="60%" />
    </View>
  );
}

/** A stack of card placeholders sized to fill a loading screen. */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading" style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => <CardSkeleton key={i} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.lineWarm,
    borderRadius: radius.input,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.lineWarm,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  cardHeadText: { flex: 1, gap: 6 },
});
