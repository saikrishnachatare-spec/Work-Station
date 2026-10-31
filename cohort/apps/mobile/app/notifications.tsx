import { SeoHead } from '@/components/SeoHead';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';

export default function Screen() {
  return (
    <>
      <SeoHead noindex description="Your messages, replies and application updates." path="/notifications" title="Notifications" />
      <NotificationsScreen />
    </>
  );
}
