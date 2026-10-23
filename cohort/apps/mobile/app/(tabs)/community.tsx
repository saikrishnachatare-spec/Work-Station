import { SeoHead } from '@/components/SeoHead';
import { CommunityScreen } from '@/features/community/CommunityScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="Study circles, groups and peers preparing for CA together." path="/community" title="Community" />
      <CommunityScreen />
    </>
  );
}
