import { SeoHead } from '@/components/SeoHead';
import { MessagesScreen } from '@/features/messages/MessagesScreen';

export default function Screen() {
  return (
    <>
      <SeoHead noindex description="Messages with students, mentors and firms." path="/messages" title="Messages" />
      <MessagesScreen />
    </>
  );
}
