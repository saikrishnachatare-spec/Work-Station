/**
 * Share links for posts, jobs and resources. Content is publicly readable,
 * so a share link is simply the public URL of the item's page. Groups use
 * invite links instead (see getGroupInviteLink).
 */
import { Platform, Share } from 'react-native';

import { SITE_URL } from '@/components/SeoHead';

export type ShareableKind = 'post' | 'job' | 'resource';

export function itemShareUrl(kind: ShareableKind, id: string): string {
  return `${SITE_URL}/${kind}?id=${id}`;
}

/**
 * Web: copy the link to the clipboard. Native: open the system share sheet.
 * Returns false when neither worked so the caller can show the raw link.
 */
export async function shareItemLink(url: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await Share.share({ message: `${message}\n${url}` });
    return true;
  } catch {
    return false;
  }
}
