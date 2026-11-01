import { Link, useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { useMounted } from '@/lib/use-mounted';
import { PostScreen } from '@/features/feed/PostScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mounted = useMounted();
  return (
    <>
      {mounted && id && <Link href={{pathname:'/safety',params:{type:'post',id}}} style={{padding:12,color:'#B9532D'}}>Report this post</Link>}
      <SeoHead description="Read this post from the Cohort community." path="/post" title="Post" />
      <PostScreen id={id ?? ''} />
    </>
  );
}
