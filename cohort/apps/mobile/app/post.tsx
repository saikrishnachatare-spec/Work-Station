import { Link, useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { ListSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/use-mounted';
import { View } from 'react-native';
import { PostScreen } from '@/features/feed/PostScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mounted = useMounted();
  return (
    <>
      {mounted && id && <Link href={{pathname:'/safety',params:{type:'post',id}}} style={{padding:12,color:'#B9532D'}}>Report this post</Link>}
      <SeoHead description="Read this post from the Cohort community." path="/post" title="Post" />
      {!mounted ? (
        <View style={{ padding: 16 }}><ListSkeleton count={2} /></View>
      ) : (
        <PostScreen id={id ?? ''} />
      )}
    </>
  );
}
