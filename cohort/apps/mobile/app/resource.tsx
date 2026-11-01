import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { ListSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/use-mounted';
import { View } from 'react-native';
import { ResourceScreen } from '@/features/resources/ResourceScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mounted = useMounted();
  return (
    <>
      <SeoHead description="Study resource shared by the Cohort community." path="/resource" title="Resource" />
      {!mounted ? (
        <View style={{ padding: 16 }}><ListSkeleton count={1} /></View>
      ) : (
        <ResourceScreen id={id ?? ''} />
      )}
    </>
  );
}
