import { Modal, Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type BottomSheetProps = ViewProps & {
  visible: boolean;
  onClose: () => void;
};

/** Minimal modal bottom sheet. Reanimated slide/spring lands with the create flow. */
export function BottomSheet({ visible, onClose, children, style, ...rest }: BottomSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, style]} {...rest}>
        <View style={styles.handle} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(37, 31, 33, 0.35)',
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopColor: colors.lineWarm,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.ink4,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.sm,
    width: 36,
  },
});
