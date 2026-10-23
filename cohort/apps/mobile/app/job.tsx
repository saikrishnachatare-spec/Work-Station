import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { JobScreen } from '@/features/work/JobScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <SeoHead description="Details and application window for this Cohort opening." path="/job" title="Opening" />
      <JobScreen id={id ?? ''} />
    </>
  );
}
