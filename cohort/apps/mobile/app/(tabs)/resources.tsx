import { SeoHead } from '@/components/SeoHead';
import { ResourcesScreen } from '@/features/resources/ResourcesScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="Notes, papers and study resources shared by the community." path="/resources" title="Resources" />
      <ResourcesScreen />
    </>
  );
}
