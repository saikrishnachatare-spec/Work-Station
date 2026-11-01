import { Link, useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { useMounted } from '@/lib/use-mounted';
import { JobScreen } from '@/features/work/JobScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mounted = useMounted();
  return (
    <>
      {mounted && id && <Link href={{pathname:'/safety',params:{type:'job',id}}} style={{padding:12,color:'#B9532D'}}>Report this job</Link>}
      <SeoHead description="Details and application window for this Cohort opening." path="/job" title="Opening" />
      <JobScreen id={id ?? ''} />
    </>
  );
}
