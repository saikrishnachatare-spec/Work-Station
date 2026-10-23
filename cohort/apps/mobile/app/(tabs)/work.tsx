import { SeoHead } from '@/components/SeoHead';
import { WorkScreen } from '@/features/work/WorkScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="Articleships, jobs and firm openings for CA students and professionals." path="/work" title="Work" />
      <WorkScreen />
    </>
  );
}
