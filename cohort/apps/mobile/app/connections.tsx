import { SeoHead } from '@/components/SeoHead';
import { ConnectionsScreen } from '@/features/connections/ConnectionsScreen';

export default function Screen() {
  return (
    <>
      <SeoHead noindex description="Your connection requests and network." path="/connections" title="Connections" />
      <ConnectionsScreen />
    </>
  );
}
