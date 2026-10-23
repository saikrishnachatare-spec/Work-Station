import { SeoHead } from '@/components/SeoHead';
import { IcaiScreen } from '@/features/icai/IcaiScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="ICAI announcements, exam dates, results and official updates." path="/icai" title="ICAI updates" />
      <IcaiScreen />
    </>
  );
}
