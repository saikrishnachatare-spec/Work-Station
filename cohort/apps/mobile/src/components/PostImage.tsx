import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { colors, radius } from '@/theme';

/**
 * A post's image, always shown whole: the box takes the image's own aspect
 * ratio (nothing is cropped); extremely tall images cap at maxHeight and
 * letterbox instead of cropping. Falls back to a fixed box until dimensions
 * load.
 */
export function PostImage({ label, maxHeight = 420, uri }: { label: string; maxHeight?: number; uri: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    Image.getSize(
      uri,
      (w, h) => { if (live && w > 0 && h > 0) setRatio(w / h); },
      () => {},
    );
    return () => { live = false; };
  }, [uri]);
  if (ratio) {
    return (
      <Image
        accessibilityLabel={label}
        resizeMode="contain"
        source={{ uri }}
        style={{ aspectRatio: ratio, backgroundColor: colors.brandSoft, borderRadius: radius.tile, maxHeight, width: '100%' }}
      />
    );
  }
  return (
    <Image
      accessibilityLabel={label}
      resizeMode="contain"
      source={{ uri }}
      style={{ backgroundColor: colors.brandSoft, borderRadius: radius.tile, height: 220, width: '100%' }}
    />
  );
}
