import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { useMounted } from '@/lib/use-mounted';
import { GroupChatScreen } from '@/features/community/GroupChatScreen';

export default function Screen() {
  const { group, name } = useLocalSearchParams<{ group: string; name?: string }>();
  const mounted = useMounted();
  return (
    <>
      <SeoHead noindex description="Group chat with your Cohort circle." path="/group-chat" title="Group chat" />
      <GroupChatScreen groupId={group ?? ''} groupName={mounted && name ? name : 'Group'} />
    </>
  );
}
