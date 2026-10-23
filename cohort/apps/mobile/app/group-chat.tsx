import { useLocalSearchParams } from 'expo-router';

import { SeoHead } from '@/components/SeoHead';
import { GroupChatScreen } from '@/features/community/GroupChatScreen';

export default function Screen() {
  const { group, name } = useLocalSearchParams<{ group: string; name?: string }>();
  return (
    <>
      <SeoHead noindex description="Group chat with your Cohort circle." path="/group-chat" title="Group chat" />
      <GroupChatScreen groupId={group ?? ''} groupName={name ?? 'Group'} />
    </>
  );
}
