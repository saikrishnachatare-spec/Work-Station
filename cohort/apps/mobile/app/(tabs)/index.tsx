import { SeoHead } from '@/components/SeoHead';
import { FeedScreen } from '@/features/feed/FeedScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="Daily reads, posts and announcements from your CA community." path="/" title="Your feed" />
      <FeedScreen />
    </>
  );
}
