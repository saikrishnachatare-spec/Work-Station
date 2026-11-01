import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { ListSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/use-mounted';
import { View } from 'react-native';
import { MemberScreen } from '@/features/members/MemberScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mounted = useMounted();
  return (
    <>
      <SeoHead noindex description="A Cohort member profile." path="/member" title="Member" />
      {!mounted ? (
        <View style={{ padding: 16 }}><ListSkeleton count={2} /></View>
      ) : (
        <MemberScreen id={id ?? ''} />
      )}
    </>
  );
}
