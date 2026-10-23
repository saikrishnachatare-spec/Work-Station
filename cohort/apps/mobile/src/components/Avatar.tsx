import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

type AvatarProps = {
  name: string;
  size?: number;
};

/** Initials avatar; colour picked from the prototype accent palette by name. */
export function Avatar({ name, size = 38 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const index = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % colors.accent.length;

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: colors.accent[index],
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
