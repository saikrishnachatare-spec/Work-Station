import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { JoinGroupScreen } from '@/features/community/JoinGroupScreen';

export default function Screen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return (
    <>
      <SeoHead description="Join a Cohort group from an invite link." path="/join" title="Join a group" />
      <JoinGroupScreen token={token ?? ''} />
    </>
  );
}
