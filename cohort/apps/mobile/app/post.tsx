import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { PostScreen } from '@/features/feed/PostScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <SeoHead description="Read this post from the Cohort community." path="/post" title="Post" />
      <PostScreen id={id ?? ''} />
    </>
  );
}
