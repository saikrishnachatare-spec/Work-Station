import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { MemberScreen } from '@/features/members/MemberScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <SeoHead noindex description="A Cohort member profile." path="/member" title="Member" />
      <MemberScreen id={id ?? ''} />
    </>
  );
}
