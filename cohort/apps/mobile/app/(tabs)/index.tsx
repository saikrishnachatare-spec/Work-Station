import { SeoHead } from '@/components/SeoHead';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { Redirect } from 'expo-router';

import { useMyProfile } from '@/lib/data';
import { useAuth } from '@/store/session';

export default function Screen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const isOrg = profile.data?.account_type === 'firm' || profile.data?.account_type === 'enterprise';

  // Firm and company accounts get the company panel as their home instead of
  // the individual member dashboard. Other member tabs stay reachable.
  if (userId && isOrg) {
    return <Redirect href="/company" />;
  }
  return (
    <>
      <SeoHead description="Daily reads, posts and announcements from your CA community." path="/" title="Your feed" />
      <FeedScreen />
    </>
  );
}
