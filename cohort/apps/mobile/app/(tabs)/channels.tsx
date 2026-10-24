import { SeoHead } from '@/components/SeoHead';
import { ChannelsScreen } from '@/features/channels/ChannelsScreen';

export default function Screen() {
  return (
    <>
      <SeoHead description="One-way channels from admins and creators on Cohort." path="/channels" title="Channels" />
      <ChannelsScreen />
    </>
  );
}
