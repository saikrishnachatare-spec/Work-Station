import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { ResourceScreen } from '@/features/resources/ResourceScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <SeoHead description="Study resource shared by the Cohort community." path="/resource" title="Resource" />
      <ResourceScreen id={id ?? ''} />
    </>
  );
}
